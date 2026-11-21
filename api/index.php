<?php

declare(strict_types=1);

/**
 * JSON-API der LTB-Sammlung.
 *
 * Läuft als PHP-FPM hinter Caddy. Caddy prüft die Anmeldung per forward_auth
 * und setzt `Remote-User`; ohne diesen Header antwortet die API mit 401. Der
 * Dienst ist nur im Docker-Netz erreichbar, nicht direkt aus dem Internet.
 *
 * Routen:
 *   GET    /api/collection   Sammlung lesen
 *   POST   /api/ltb          eine bis drei LTB-Zeilen anlegen (Duplikate erlaubt)
 *   POST   /api/series       Sonderserie anlegen (optional mit 1-3 Bänden)
 *   POST   /api/series/volume  Bände zu einer Sonderserie hinzufügen
 *   DELETE /api/series/volume  Band aus einer Sonderserie entfernen
 *   PATCH  /api/ltb          Notiz einer Zeile ändern (number + occurrence)
 *   DELETE /api/ltb          Zeile löschen (number + occurrence)
 *   GET    /api/health       Lebenszeichen ohne Daten
 */

require __DIR__ . '/src/Validation.php';
require __DIR__ . '/src/Store.php';

function respond(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['error' => $message]);
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function request_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

    return is_string($path) ? rtrim($path, '/') : '/';
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        throw new ValidationError(400, 'Leerer Request-Body.');
    }

    try {
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ValidationError(400, 'Request-Body ist kein gültiges JSON.');
    }

    if (!is_array($data)) {
        throw new ValidationError(400, 'Request-Body muss ein JSON-Objekt sein.');
    }

    return $data;
}

function authenticated_user(): string
{
    // Caddy setzt bei FastCGI den CGI-Parameter REMOTE_USER; kommt der Wert
    // als HTTP-Header (copy_headers), heisst er HTTP_REMOTE_USER.
    $user = trim((string) ($_SERVER['REMOTE_USER'] ?? $_SERVER['HTTP_REMOTE_USER'] ?? ''));

    if ($user === '') {
        fail(401, 'Nicht angemeldet.');
    }

    return $user;
}

/**
 * Einfacher CSRF-Schutz: Wenn der Browser einen Origin sendet, muss er zum
 * Host passen. Zusammen mit SameSite=Lax am Auth-Cookie reicht das für eine
 * JSON-API ohne eigene Tokens.
 */
function assert_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($origin === '') {
        return;
    }

    $originHost = parse_url($origin, PHP_URL_HOST);
    $host = $_SERVER['HTTP_HOST'] ?? '';

    if (!is_string($originHost) || $originHost !== $host) {
        fail(403, 'Origin passt nicht zum Host.');
    }
}

function store(): Store
{
    $databasePath = getenv('LTB_DB') ?: '/data/ltb.sqlite';
    $seedPath = getenv('LTB_SEED') ?: '/srv/seed/collection.json';

    return new Store($databasePath, $seedPath);
}

$method = request_method();
$path = request_path();

try {
    if ($path === '/api/health') {
        respond(200, ['status' => 'ok']);
    }

    if (!str_starts_with($path, '/api/')) {
        fail(404, 'Unbekannte Route.');
    }

    $user = authenticated_user();
    $collectionStore = store();

    if ($path === '/api/collection' && $method === 'GET') {
        $collection = $collectionStore->collection();
        $collection['meta']['user'] = $user;
        respond(200, $collection);
    }

    if ($path === '/api/ltb' && $method === 'POST') {
        assert_same_origin();
        $items = validate_add_body(read_json_body());
        $created = $collectionStore->addLtbRows($items);
        respond(201, ['created' => count($created), 'rows' => $created]);
    }

    if ($path === '/api/ltb' && $method === 'PATCH') {
        assert_same_origin();
        $body = read_json_body();
        $reference = validate_row_reference($body);
        $item = validate_item(
            ['number' => $reference['number'], 'containedIn' => $body['containedIn'] ?? null],
            0
        );

        if (!$collectionStore->updateLtbRow(
            $reference['number'],
            $reference['occurrence'],
            $item['containedIn']
        )) {
            fail(404, 'Zeile nicht gefunden.');
        }

        respond(200, ['ok' => true]);
    }

    if ($path === '/api/series' && $method === 'POST') {
        assert_same_origin();
        $body = read_json_body();
        $name = validate_series_name($body['name'] ?? null);
        $name = $collectionStore->createSeries($name);
        $added = 0;
        $skipped = 0;

        if (array_key_exists('numbers', $body)) {
            $result = $collectionStore->addSeriesNumbers(
                $name,
                validate_series_numbers($body['numbers'])
            );
            $added = $result['added'];
            $skipped = $result['skipped'];
        }

        respond(201, ['name' => $name, 'added' => $added, 'skipped' => $skipped]);
    }

    if ($path === '/api/series/volume' && $method === 'POST') {
        assert_same_origin();
        $body = read_json_body();
        $series = $collectionStore->findSeries(validate_series_name($body['series'] ?? null));

        if ($series === null) {
            fail(404, 'Sonderserie nicht gefunden.');
        }

        $result = $collectionStore->addSeriesNumbers(
            $series,
            validate_series_numbers($body['numbers'] ?? null)
        );
        respond(201, ['series' => $series, 'added' => $result['added'], 'skipped' => $result['skipped']]);
    }

    if ($path === '/api/series/volume' && $method === 'DELETE') {
        assert_same_origin();
        $body = read_json_body();
        $series = $collectionStore->findSeries(validate_series_name($body['series'] ?? null));

        if ($series === null) {
            fail(404, 'Sonderserie nicht gefunden.');
        }

        $numbers = validate_series_numbers([$body['number'] ?? null]);

        if (!$collectionStore->removeSeriesNumber($series, $numbers[0])) {
            fail(404, 'Band nicht gefunden.');
        }

        respond(200, ['ok' => true]);
    }

    if ($path === '/api/ltb' && $method === 'DELETE') {
        assert_same_origin();
        $reference = validate_row_reference(read_json_body());

        if (!$collectionStore->removeLtbRow($reference['number'], $reference['occurrence'])) {
            fail(404, 'Zeile nicht gefunden.');
        }

        respond(200, ['ok' => true]);
    }

    fail(404, 'Unbekannte Route.');
} catch (ValidationError $error) {
    fail($error->status, $error->getMessage());
} catch (Throwable $error) {
    error_log('ltb-api: ' . $error->getMessage());
    fail(500, 'Interner Fehler.');
}
