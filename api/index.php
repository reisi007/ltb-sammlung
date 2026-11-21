<?php

declare(strict_types=1);

/**
 * JSON-API der LTB-Sammlung.
 *
 * Läuft als PHP-FPM hinter Caddy. Benutzer und Sessions liegen in SQLite;
 * jede Anfrage auf Sammlungsdaten braucht ein gültiges Session-Cookie und
 * antwortet sonst mit 401. Der Dienst ist nur im Docker-Netz erreichbar,
 * nicht direkt aus dem Internet.
 *
 * Routen:
 *   POST   /api/login        anmelden (Session-Cookie)
 *   POST   /api/logout       Session beenden
 *   GET    /api/me           angemeldeten Benutzer lesen
 *   GET    /api/collection   Sammlung lesen
 *   POST   /api/ltb          bis zu 200 LTB-Zeilen anlegen (Duplikate erlaubt)
 *   POST   /api/series       Sonderserie anlegen (optional mit bis zu 200 Bänden)
 *   POST   /api/series/volume  Bände zu einer Sonderserie hinzufügen
 *   DELETE /api/series/volume  Band aus einer Sonderserie entfernen
 *   PUT    /api/isbn         ISBN einer LTB-Nummer zuordnen (Scanner)
 *   GET    /api/lookup       ISBN nachschlagen (?isbn=…, gelernt + Katalog)
 *   PATCH  /api/ltb          Notiz einer Zeile ändern (number + occurrence)
 *   DELETE /api/ltb          Zeile löschen (number + occurrence)
 *   GET    /api/health       Lebenszeichen ohne Daten
 */

// Keine Fehlerdetails im Response, auch wenn die Store-Initialisierung
// ausserhalb von Api::dispatch() scheitert.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require __DIR__ . '/src/Api.php';

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function request_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

    return is_string($path) ? rtrim($path, '/') : '/';
}

function store(): Store
{
    $databasePath = getenv('LTB_DB') ?: '/data/ltb.sqlite';
    $seedPath = getenv('LTB_SEED') ?: '/srv/seed/collection.json';

    return new Store($databasePath, $seedPath);
}

function api(): Api
{
    // Der Katalog ist optional; ohne Datei nutzt der Lookup nur isbn_map.
    $catalogPath = getenv('LTB_CATALOG') ?: '/srv/seed/catalog.json';

    return new Api(store(), $catalogPath);
}

$length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
$rawBody = '';

// Oberhalb des Limits wird nichts gelesen; die Route antwortet mit 413.
// Auch ohne Content-Length (chunked) hoechstens ein Byte ueber dem Limit
// lesen, damit ein riesiger Body keinen Speicher belegt.
if ($length <= 65536) {
    $rawBody = (string) file_get_contents('php://input', false, null, 0, 65537);

    if ($length === 0) {
        $length = strlen($rawBody);
    }
}

try {
    $response = api()->dispatch(
        request_method(),
        request_path(),
        $_SERVER,
        $rawBody,
        $length
    );
} catch (Throwable $error) {
    error_log('ltb-api: ' . $error->getMessage());
    http_response_code(500);

    foreach (Api::HEADERS as $name => $value) {
        header($name . ': ' . $value);
    }

    echo json_encode(['error' => 'Interner Fehler.']);

    return;
}

http_response_code($response['status']);

foreach ($response['headers'] as $name => $value) {
    header($name . ': ' . $value);
}

echo json_encode(
    Api::forJson($response['payload']),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
