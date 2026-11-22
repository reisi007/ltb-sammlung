<?php

declare(strict_types=1);

/**
 * Router der JSON-API.
 *
 * `dispatch()` bekommt Methode, Pfad, Server-Parameter und Body und liefert
 * Status, Payload und Header zurück. Dadurch ist die komplette HTTP-Schicht
 * (Auth, Origin, Body-Limit, Validierung vor dem Schreiben) direkt testbar.
 *
 * Anmeldung: eigene Benutzer + Sessions in SQLite. Das Cookie ist der einzige
 * Auth-Nachweis; ein fest verdrahteter Benutzername existiert nicht. Caddy
 * reicht `/api/*` nur per FastCGI an PHP weiter und prueft keine eigene
 * Session (`/api/auth/check` bleibt fuer Clients/Tests verfügbar).
 *
 * Routen, Auth und Antwortformat liegen in Traits unter `Api/`; die Klasse
 * hält Konstanten, Store und Einstiegspunkt zusammen.
 */
require_once __DIR__ . '/Validation.php';
require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/Catalog.php';
require_once __DIR__ . '/Api/Routes.php';
require_once __DIR__ . '/Api/Auth.php';
require_once __DIR__ . '/Api/Lookup.php';
require_once __DIR__ . '/Api/Response.php';

final class Api
{
    use ApiRoutes;
    use ApiAuth;
    use ApiLookup;
    use ApiResponse;

    private const COOKIE_NAME = 'auth';
    private const SESSION_TTL = 43200;
    private const LOGIN_WINDOW = 900;
    private const LOGIN_MAX_FAILURES = 10;

    /** @var array<string, string> */
    public const HEADERS = [
        'Content-Type' => 'application/json; charset=utf-8',
        'Cache-Control' => 'no-store',
        'X-Content-Type-Options' => 'nosniff',
        // Die API liefert nur JSON: keine Skripte, Styles oder Einbettungen.
        // Einen eventuell von Caddy gesetzten CSP-Header schraenkt der Browser
        // zusätzlich ein (Schnittmenge), er setzt ihn nicht ausser Kraft.
        'Content-Security-Policy' => "default-src 'self'; img-src 'self' https: data:; script-src 'none'; style-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ];

    private ?Catalog $catalog = null;

    /** Einmalig pro PHP-Prozess erzeugter Dummy-Hash, siehe dummyPasswordHash(). */
    private static ?string $dummyPasswordHash = null;

    /**
     * `$catalogPath` ist optional: ohne Katalogdatei antwortet `/api/lookup`
     * nur anhand der gelernten Zuordnungen.
     */
    public function __construct(
        private readonly Store $store,
        private readonly ?string $catalogPath = null
    ) {
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
}
