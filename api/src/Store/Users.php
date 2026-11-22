<?php

declare(strict_types=1);

/**
 * Benutzer, Sessions und Login-Fehlversuche.
 *
 * Benutzer und Sessions liegen in derselben Datenbank wie die Sammlung, damit
 * ein Deployment nur ein Volume braucht.
 */
trait StoreUsers
{
    public function createUser(string $username, string $passwordHash): bool
    {
        $statement = $this->db->prepare(
            'INSERT OR IGNORE INTO users (username, password_hash, created_at)
             VALUES (?, ?, ?)'
        );
        $statement->execute([$username, $passwordHash, gmdate('c')]);

        return $statement->rowCount() > 0;
    }

    /** @return array{username: string, password_hash: string}|null */
    public function findUser(string $username): ?array
    {
        $statement = $this->db->prepare(
            'SELECT username, password_hash FROM users WHERE username = ?'
        );
        $statement->execute([$username]);
        $user = $statement->fetch();

        return $user === false ? null : [
            'username' => (string) $user['username'],
            'password_hash' => (string) $user['password_hash'],
        ];
    }

    public function setUserPassword(string $username, string $passwordHash): bool
    {
        $this->db->beginTransaction();

        try {
            $statement = $this->db->prepare(
                'UPDATE users SET password_hash = ? WHERE username = ?'
            );
            $statement->execute([$passwordHash, $username]);
            // Ein Passwortwechsel entzieht auch kopierten Sessions den Zugriff.
            $this->deleteSessionsFor($username);
            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }

        return $statement->rowCount() > 0;
    }

    private function deleteSessionsFor(string $username): void
    {
        $statement = $this->db->prepare('DELETE FROM sessions WHERE username = ?');
        $statement->execute([$username]);
    }

    /** @return list<string> */
    public function users(): array
    {
        return array_map(
            'strval',
            $this->db->query('SELECT username FROM users ORDER BY username')
                ->fetchAll(PDO::FETCH_COLUMN)
        );
    }

    public function deleteUser(string $username): bool
    {
        $this->db->beginTransaction();

        try {
            $this->deleteSessionsFor($username);
            $statement = $this->db->prepare('DELETE FROM users WHERE username = ?');
            $statement->execute([$username]);
            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }

        return $statement->rowCount() > 0;
    }

    public function createSession(string $tokenHash, string $username, int $ttlSeconds): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO sessions (token_hash, username, expires_at, created_at)
             VALUES (?, ?, ?, ?)'
        );
        $statement->execute([
            $tokenHash,
            $username,
            gmdate('c', time() + $ttlSeconds),
            gmdate('c'),
        ]);
    }

    public function sessionUser(string $tokenHash): ?string
    {
        // Join gegen users: ein geloeschter Benutzer ist sofort ungueltig,
        // auch wenn seine Session-Zeile noch existiert.
        $statement = $this->db->prepare(
            'SELECT s.username FROM sessions s
             JOIN users u ON u.username = s.username
             WHERE s.token_hash = ? AND s.expires_at > ?'
        );
        $statement->execute([$tokenHash, gmdate('c')]);
        $user = $statement->fetchColumn();

        return $user === false ? null : (string) $user;
    }

    public function deleteSession(string $tokenHash): void
    {
        $statement = $this->db->prepare('DELETE FROM sessions WHERE token_hash = ?');
        $statement->execute([$tokenHash]);
    }

    public function purgeExpiredSessions(): void
    {
        $statement = $this->db->prepare('DELETE FROM sessions WHERE expires_at <= ?');
        $statement->execute([gmdate('c')]);
    }

    public function recentLoginFailures(string $address, int $windowSeconds): int
    {
        $statement = $this->db->prepare(
            'SELECT COUNT(*) FROM login_failures WHERE address = ? AND attempted_at > ?'
        );
        $statement->execute([$address, gmdate('c', time() - $windowSeconds)]);

        return (int) $statement->fetchColumn();
    }

    public function recordLoginFailure(string $address): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO login_failures (address, attempted_at) VALUES (?, ?)'
        );
        $statement->execute([$address, gmdate('c')]);
    }

    public function purgeLoginFailures(int $olderThanSeconds): void
    {
        $statement = $this->db->prepare('DELETE FROM login_failures WHERE attempted_at <= ?');
        $statement->execute([gmdate('c', time() - $olderThanSeconds)]);
    }
}
