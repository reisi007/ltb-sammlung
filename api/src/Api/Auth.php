<?php

declare(strict_types=1);

/**
 * Anmeldung, Abmeldung und Session-Cookie.
 *
 * Das Cookie ist der einzige Auth-Nachweis; ein fest verdrahteter
 * Benutzername existiert nicht.
 */
trait ApiAuth
{
    /**
     * Einmalig pro Prozess erzeugter Dummy-Hash mit demselben Algorithmus und
     * denselben Kosten wie echte Hashes (`PASSWORD_DEFAULT`). So verraet die
     * Antwortzeit nicht, ob ein Benutzer existiert — unabhaengig von der
     * PHP-Version und den Default-Kosten.
     */
    public static function dummyPasswordHash(): string
    {
        self::$dummyPasswordHash ??= self::createDummyPasswordHash();

        return self::$dummyPasswordHash;
    }

    private static function createDummyPasswordHash(?string $rawMaterial = null): string
    {
        // bcrypt (PASSWORD_DEFAULT) lehnt NUL-Bytes im Passwort ab; rohe
        // random_bytes() enthalten mit ca. 12 % Wahrscheinlichkeit mindestens
        // eines. Hex-Kodierung ist NUL-frei und behält die 256 Bit Entropie.
        // Der optionale Parameter erlaubt den Regressionstest, gezielt
        // NUL-Material durch denselben Pfad zu schicken.
        $hash = password_hash(bin2hex($rawMaterial ?? random_bytes(32)), PASSWORD_DEFAULT);

        if ($hash === false) {
            throw new RuntimeException('Dummy-Passwort-Hash konnte nicht erzeugt werden.');
        }

        return $hash;
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
        $hash = $user['password_hash'] ?? self::dummyPasswordHash();

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
        self::assertSameOrigin($server);
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
}
