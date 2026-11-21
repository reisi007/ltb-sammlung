<?php

declare(strict_types=1);

/**
 * Router der JSON-API.
 *
 * Bewusst ohne Superglobals und ohne Ausgabe: `dispatch()` bekommt Methode,
 * Pfad, Server-Parameter und Body und liefert Status, Payload und Header
 * zurück. Dadurch ist die komplette HTTP-Schicht (Auth, Origin, Body-Limit,
 * Validierung vor dem Schreiben) direkt testbar.
 *
 * Anmeldung: eigene Benutzer + Sessions in SQLite. Das Cookie ist der einzige
 * Auth-Nachweis; ein fest verdrahteter Benutzername existiert nicht. Caddy
 * reicht `/api/*` nur per FastCGI an PHP weiter und prueft keine eigene
 * Session (`/api/auth/check` bleibt fuer Clients/Tests verfügbar).
 */
require_once __DIR__ . '/Validation.php';
require_once __DIR__ . '/Store.php';

final class Api
{
    private const COOKIE_NAME = 'auth';
    private const SESSION_TTL = 43200;
    private const LOGIN_WINDOW = 900;
    private const LOGIN_MAX_FAILURES = 10;

    /** @var array<string, string> */
    public const HEADERS = [
        'Content-Type' => 'application/json; charset=utf-8',
        'Cache-Control' => 'no-store',
        'X-Content-Type-Options' => 'nosniff',
    ];

    public function __construct(private readonly Store $store)
    {
    }

    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    public function dispatch(
        string $method,
        string $path,
        array $server,
        string $rawBody,
        int $contentLength
    ): array {
        try {
            return $this->route(
                strtoupper($method),
                $path,
                $server,
                $rawBody,
                $contentLength
            );
        } catch (ValidationError $error) {
            return self::response($error->status, ['error' => $error->getMessage()]);
        } catch (Throwable $error) {
            error_log('ltb-api: ' . $error->getMessage());

            return self::response(500, ['error' => 'Interner Fehler.']);
        }
    }

    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    private function route(
        string $method,
        string $path,
        array $server,
        string $rawBody,
        int $contentLength
    ): array {
        if ($path === '/api/health') {
            return self::response(200, ['status' => 'ok']);
        }

        if (!str_starts_with($path, '/api/')) {
            throw new ValidationError(404, 'Unbekannte Route.');
        }

        // Oeffentliche Auth-Routen. /api/login|me|logout bleiben als Alias,
        // damit die vorhandene Login-Seite unveraendert funktioniert.
        if (($path === '/api/login' || $path === '/api/auth/login') && $method === 'POST') {
            return $this->login($server, $rawBody, $contentLength);
        }

        if (($path === '/api/me' || $path === '/api/auth/me') && $method === 'GET') {
            $user = $this->currentUser($server);

            return self::response(200, ['user' => $user]);
        }

        if ($path === '/api/auth/check' && $method === 'GET') {
            $user = $this->currentUser($server);

            return self::response(200, ['ok' => true, 'user' => $user]);
        }

        if (($path === '/api/logout' || $path === '/api/auth/logout') && $method === 'POST') {
            return $this->logout($server);
        }

        $user = $this->currentUser($server);

        if ($path === '/api/collection' && $method === 'GET') {
            $collection = $this->store->collection($user);
            $collection['meta']['user'] = $user;

            return self::response(200, $collection);
        }

        if ($path === '/api/ltb' && $method === 'POST') {
            self::assertSameOrigin($server);
            $items = validate_add_body(self::readJsonBody($rawBody, $contentLength));
            $created = $this->store->addLtbRows($user, $items);

            return self::response(201, ['created' => count($created), 'rows' => $created]);
        }

        if ($path === '/api/ltb' && $method === 'PATCH') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $reference = validate_row_reference($body);
            $item = validate_item(
                ['number' => $reference['number'], 'containedIn' => $body['containedIn'] ?? null],
                0
            );

            if (!$this->store->updateLtbRow(
                $user,
                $reference['number'],
                $reference['occurrence'],
                $item['containedIn']
            )) {
                throw new ValidationError(404, 'Zeile nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/series' && $method === 'POST') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $name = validate_series_name($body['name'] ?? null);
            // Erst validieren, dann schreiben: ein 422 darf keine leere Reihe
            // hinterlassen.
            $numbers = array_key_exists('numbers', $body)
                ? validate_series_numbers($body['numbers'])
                : null;
            $name = $this->store->createSeries($user, $name);
            $added = 0;
            $skipped = 0;

            if ($numbers !== null) {
                $result = $this->store->addSeriesNumbers($user, $name, $numbers);
                $added = $result['added'];
                $skipped = $result['skipped'];
            }

            return self::response(201, [
                'name' => $name,
                'added' => $added,
                'skipped' => $skipped,
            ]);
        }

        if ($path === '/api/series/volume' && $method === 'POST') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $series = $this->store->findSeries(
                $user,
                validate_series_name($body['series'] ?? null)
            );

            if ($series === null) {
                throw new ValidationError(404, 'Sonderserie nicht gefunden.');
            }

            $result = $this->store->addSeriesNumbers(
                $user,
                $series,
                validate_series_numbers($body['numbers'] ?? null)
            );

            return self::response(201, [
                'series' => $series,
                'added' => $result['added'],
                'skipped' => $result['skipped'],
            ]);
        }

        if ($path === '/api/series/volume' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $series = $this->store->findSeries(
                $user,
                validate_series_name($body['series'] ?? null)
            );

            if ($series === null) {
                throw new ValidationError(404, 'Sonderserie nicht gefunden.');
            }

            $numbers = validate_series_numbers([$body['number'] ?? null]);

            if (!$this->store->removeSeriesNumber($user, $series, $numbers[0])) {
                throw new ValidationError(404, 'Band nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/isbn' && $method === 'PUT') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $isbn = validate_isbn($body['isbn'] ?? null);
            $number = validate_item(['number' => $body['number'] ?? null], 0)['number'];
            $this->store->rememberIsbn($user, $isbn, $number);

            return self::response(200, [
                'ok' => true,
                'isbn' => $isbn,
                'number' => $number,
            ]);
        }

        if ($path === '/api/isbn' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);

            if (!$this->store->forgetIsbn($user, validate_isbn($body['isbn'] ?? null))) {
                throw new ValidationError(404, 'ISBN nicht zugeordnet.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/ltb' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $reference = validate_row_reference(
                self::readJsonBody($rawBody, $contentLength)
            );

            if (!$this->store->removeLtbRow(
                $user,
                $reference['number'],
                $reference['occurrence']
            )) {
                throw new ValidationError(404, 'Zeile nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        throw new ValidationError(404, 'Unbekannte Route.');
    }

    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    private function login(array $server, string $rawBody, int $contentLength): array
    {
        self::assertSameOrigin($server);
        $address = (string) ($server['REMOTE_ADDR'] ?? 'unbekannt');

        if ($this->store->recentLoginFailures($address, self::LOGIN_WINDOW)
            >= self::LOGIN_MAX_FAILURES) {
            throw new ValidationError(429, 'Zu viele Anmeldeversuche. Bitte spaeter erneut.');
        }

        $body = self::readJsonBody($rawBody, $contentLength);
        $username = is_string($body['username'] ?? null)
            ? validate_username($body['username'])
            : '';
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        $user = $username === '' ? null : $this->store->findUser($username);
        // Auch bei unbekanntem Benutzer einen Hash pruefen: sonst verraet die
        // Antwortzeit, ob ein Konto existiert.
        $hash = $user['password_hash']
            ?? '$2y$12$0000000000000000000000000000000000000000000000000000';

        if (!password_verify($password, $hash) || $user === null) {
            $this->store->recordLoginFailure($address);
            $this->store->purgeLoginFailures(86400);
            usleep(250_000);

            throw new ValidationError(401, 'Zugangsdaten falsch.');
        }

        $token = bin2hex(random_bytes(32));
        $this->store->createSession(hash('sha256', $token), $user['username'], self::SESSION_TTL);

        return self::response(
            200,
            ['ok' => true, 'user' => $user['username']],
            ['Set-Cookie' => self::sessionCookie($token, self::SESSION_TTL)]
        );
    }

    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    private function logout(array $server): array
    {
        $token = self::sessionToken($server);

        if ($token !== null) {
            $this->store->deleteSession(hash('sha256', $token));
        }

        return self::response(200, ['ok' => true], ['Set-Cookie' => self::sessionCookie('', 0)]);
    }

    /**
     * @param array<string, mixed> $server
     */
    private function currentUser(array $server): string
    {
        $token = self::sessionToken($server);
        $user = $token === null
            ? null
            : $this->store->sessionUser(hash('sha256', $token));

        if ($user === null) {
            throw new ValidationError(401, 'Nicht angemeldet.');
        }

        return $user;
    }

    /**
     * @param array<string, mixed> $server
     */
    private static function sessionToken(array $server): ?string
    {
        $header = (string) ($server['HTTP_COOKIE'] ?? '');

        foreach (explode(';', $header) as $part) {
            $pair = explode('=', trim($part), 2);

            if (count($pair) === 2 && $pair[0] === self::COOKIE_NAME && $pair[1] !== '') {
                return $pair[1];
            }
        }

        return null;
    }

    private static function sessionCookie(string $token, int $ttl): string
    {
        $secure = getenv('LTB_INSECURE_COOKIES') === '1' ? '' : ' Secure;';

        return self::COOKIE_NAME . '=' . $token
            . '; Path=/; HttpOnly;' . $secure . ' SameSite=Lax; Max-Age=' . $ttl;
    }

    /**
     * Bereitet die Payload fuer json_encode vor: eine leere ISBN-Map muss als
     * {} erscheinen, nicht als [] — der Client unterscheidet Zuordnung und
     * Liste. (Nicht-leere Maps mit ISBN-Schluesseln kodiert PHP von sich aus
     * als Objekt.)
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public static function forJson(array $payload): array
    {
        if (($payload['isbnMap'] ?? null) === []) {
            $payload['isbnMap'] = new stdClass();
        }

        return $payload;
    }

    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    private static function response(int $status, array $payload, array $extraHeaders = []): array
    {
        return [
            'status' => $status,
            'payload' => $payload,
            'headers' => $extraHeaders === []
                ? self::HEADERS
                : array_merge(self::HEADERS, $extraHeaders),
        ];
    }

    /**
     * Einfacher CSRF-Schutz: Wenn der Browser einen Origin sendet, muss er zum
     * Host passen. Zusammen mit SameSite=Lax am Auth-Cookie reicht das für eine
     * JSON-API ohne eigene Tokens.
     *
     * @param array<string, mixed> $server
     */
    private static function assertSameOrigin(array $server): void
    {
        $origin = (string) ($server['HTTP_ORIGIN'] ?? '');

        if ($origin === '') {
            return;
        }

        $originHost = parse_url($origin, PHP_URL_HOST);
        $host = (string) ($server['HTTP_HOST'] ?? '');

        if (!is_string($originHost) || $originHost !== $host) {
            throw new ValidationError(403, 'Origin passt nicht zum Host.');
        }
    }

    /** @return array<string, mixed> */
    private static function readJsonBody(string $raw, int $contentLength): array
    {
        // Beides pruefen: Content-Length kann fehlen (chunked), waehrend der
        // Body trotzdem gross ist.
        if ($contentLength > 8192 || strlen($raw) > 8192) {
            throw new ValidationError(413, 'Request-Body ist zu groß.');
        }

        if (trim($raw) === '') {
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
}
