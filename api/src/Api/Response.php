<?php

declare(strict_types=1);

/**
 * Antwortformat, Header und Request-Aufbereitung.
 *
 * Bewusst ohne Superglobals und ohne Ausgabe: `dispatch()` bekommt Methode,
 * Pfad, Server-Parameter und Body und liefert Status, Payload und Header
 * zurueck. Dadurch ist die komplette HTTP-Schicht direkt testbar.
 */
trait ApiResponse
{
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
     * Einfacher CSRF-Schutz: Wenn der Browser einen Origin sendet, müssen
     * Schema und Host zum eigenen Host passen. Zusammen mit SameSite=Lax am
     * Auth-Cookie reicht das für eine JSON-API ohne eigene Tokens.
     *
     * Der Dev-Schalter `LTB_INSECURE_COOKIES=1` erlaubt zusaetzlich `http`,
     * damit die lokale Entwicklung nicht zwingend HTTPS braucht.
     *
     * @param array<string, mixed> $server
     */
    private static function assertSameOrigin(array $server): void
    {
        $origin = (string) ($server['HTTP_ORIGIN'] ?? '');

        if ($origin === '') {
            return;
        }

        $originScheme = parse_url($origin, PHP_URL_SCHEME);
        $originHost = parse_url($origin, PHP_URL_HOST);
        // HTTP_HOST kann einen Port enthalten; parse_url() entfernt ihn.
        $hostName = parse_url('http://' . (string) ($server['HTTP_HOST'] ?? ''), PHP_URL_HOST);
        $schemes = ['https'];

        if (getenv('LTB_INSECURE_COOKIES') === '1') {
            $schemes[] = 'http';
        }

        if (
            !is_string($originScheme)
            || !is_string($originHost)
            || !in_array(strtolower($originScheme), $schemes, true)
            || !is_string($hostName)
            || strtolower($originHost) !== strtolower($hostName)
        ) {
            throw new ValidationError(403, 'Origin passt nicht zum Host.');
        }
    }

    /** @return array<string, mixed> */
    private static function readJsonBody(string $raw, int $contentLength): array
    {
        // Beides pruefen: Content-Length kann fehlen (chunked), waehrend der
        // Body trotzdem gross ist. 64 KiB deckt 200 Baende mit je 200 Zeichen
        // Notiz (~46 KiB) ab; alles darueber bleibt ein 413.
        if ($contentLength > 65536 || strlen($raw) > 65536) {
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
