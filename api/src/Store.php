<?php

declare(strict_types=1);

/**
 * SQLite-Speicher der Sammlung.
 *
 * Die Datenbank ist nach dem ersten Start die Quelle für die Oberfläche. Der
 * Sheet-Snapshot dient nur als Seed: Er wird importiert, solange die Tabelle
 * leer ist. Zeilen werden nie dedupliziert — eine Nummer darf mehrfach
 * vorkommen, pro Exemplar eine Zeile.
 *
 * Alle Sammlungsdaten gehören einem Benutzer (`owner`). Benutzer und Sessions
 * liegen in derselben Datenbank, damit ein Deployment nur ein Volume braucht.
 */
final class Store
{
    private const KINDS = ['ltb', 'donaldDuck', 'panzerknacker'];

    /**
     * Frühere Namen aus der Sammlung -> offizielle Schreibweise der Reihen.
     * Die Migration führt bestehende Nummern zusammen statt Duplikate zu
     * erzeugen und ist idempotent.
     */
    private const SERIES_RENAMES = [
        'Enten Edition' => 'LTB Enten-Edition',
        'LTB-Premium' => 'LTB Premium',
        'Premium+' => 'LTB Premium +',
        'Ultimativer Phantomias' => 'LTB Ultimate Phantomias',
        'Young' => 'LTB Young Comics',
        'Halloween' => 'LTB Halloween',
        'LTB-History' => 'LTB History',
        'Phantomias Collection' => 'LTB Phantomias Collection',
        'Entenhausens Unterwelt' => 'LTB Sonderedition – Entenhausens Unterwelt',
    ];

    private PDO $db;

    public function __construct(string $databasePath, private readonly string $seedPath)
    {
        $directory = dirname($databasePath);

        if (!is_dir($directory) && !mkdir($directory, 0o775, true) && !is_dir($directory)) {
            throw new RuntimeException("Datenverzeichnis nicht beschreibbar: {$directory}");
        }

        $this->db = new PDO('sqlite:' . $databasePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec('PRAGMA busy_timeout = 5000');
        $this->migrate();
        $this->seedIfEmpty();
        $this->migrateSeriesNames();
        $this->backfillSeedSyncedAt();
        $this->purgeExpiredSessions();
    }

    private function migrate(): void
    {
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )'
        );
        $this->db->exec(
            "CREATE TABLE IF NOT EXISTS rows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner TEXT NOT NULL DEFAULT 'admin',
                kind TEXT NOT NULL CHECK (kind IN ('ltb', 'donaldDuck', 'panzerknacker')),
                number INTEGER NOT NULL CHECK (number > 0),
                contained_in TEXT,
                created_at TEXT NOT NULL
            )"
        );
        $this->ensureColumn('rows', 'owner');
        $this->db->exec(
            'CREATE INDEX IF NOT EXISTS rows_owner_kind_number
             ON rows (owner, kind, number)'
        );

        $this->migrateSeriesTables();
        $this->migrateIsbnTable();

        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )'
        );
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )'
        );
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS login_failures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                address TEXT NOT NULL,
                attempted_at TEXT NOT NULL
            )'
        );
        $this->db->exec(
            'CREATE INDEX IF NOT EXISTS login_failures_address
             ON login_failures (address, attempted_at)'
        );
    }

    private function ensureColumn(string $table, string $column): void
    {
        if ($this->columnExists($table, $column)) {
            return;
        }

        $this->db->exec(
            "ALTER TABLE {$table} ADD COLUMN {$column} TEXT NOT NULL DEFAULT 'admin'"
        );
    }

    private function columnExists(string $table, string $column): bool
    {
        foreach ($this->db->query("PRAGMA table_info({$table})")->fetchAll() as $info) {
            if (($info['name'] ?? null) === $column) {
                return true;
            }
        }

        return false;
    }

    /**
     * Reihen gehoeren dem Benutzer. Alte Datenbanken hatten den Namen als
     * Primaerschluessel; sie werden einmalig auf (owner, name) umgebaut.
     */
    private function migrateSeriesTables(): void
    {
        $seriesExists = $this->tableExists('series');

        if ($seriesExists && !$this->columnExists('series', 'owner')) {
            $this->db->beginTransaction();

            try {
                $this->db->exec('ALTER TABLE series RENAME TO series_legacy');
                $this->db->exec(
                    'CREATE TABLE series (
                        owner TEXT NOT NULL,
                        name TEXT NOT NULL,
                        position INTEGER NOT NULL,
                        PRIMARY KEY (owner, name)
                    )'
                );
                $this->db->exec(
                    "INSERT INTO series (owner, name, position)
                     SELECT 'admin', name, position FROM series_legacy"
                );
                $this->db->exec('DROP TABLE series_legacy');
                $this->db->commit();
            } catch (Throwable $error) {
                $this->db->rollBack();

                throw $error;
            }
        } else {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS series (
                    owner TEXT NOT NULL,
                    name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    PRIMARY KEY (owner, name)
                )'
            );
        }

        $numbersExist = $this->tableExists('series_numbers');

        if ($numbersExist && !$this->columnExists('series_numbers', 'owner')) {
            $this->db->beginTransaction();

            try {
                $this->db->exec('ALTER TABLE series_numbers RENAME TO series_numbers_legacy');
                $this->db->exec(
                    'CREATE TABLE series_numbers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        owner TEXT NOT NULL,
                        series TEXT NOT NULL,
                        number INTEGER NOT NULL CHECK (number > 0),
                        UNIQUE (owner, series, number)
                    )'
                );
                $this->db->exec(
                    "INSERT INTO series_numbers (owner, series, number)
                     SELECT 'admin', series, number FROM series_numbers_legacy"
                );
                $this->db->exec('DROP TABLE series_numbers_legacy');
                $this->db->commit();
            } catch (Throwable $error) {
                $this->db->rollBack();

                throw $error;
            }
        } else {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS series_numbers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner TEXT NOT NULL,
                    series TEXT NOT NULL,
                    number INTEGER NOT NULL CHECK (number > 0),
                    UNIQUE (owner, series, number)
                )'
            );
        }
    }

    /**
     * Benennt Reihen auf die offiziellen Namen um. Existiert der neue Name
     * bereits, werden die Nummern zusammengeführt; die alte Zeile entfällt.
     */
    private function migrateSeriesNames(): void
    {
        foreach (self::SERIES_RENAMES as $old => $new) {
            $owners = $this->db
                ->prepare('SELECT DISTINCT owner FROM series WHERE name = ?');
            $owners->execute([$old]);
            $ownerNames = $owners->fetchAll(PDO::FETCH_COLUMN);

            foreach ($ownerNames as $owner) {
                $this->db->beginTransaction();

                try {
                    $insertSeries = $this->db->prepare(
                        'INSERT OR IGNORE INTO series (owner, name, position)
                         SELECT owner, ?, position FROM series
                         WHERE owner = ? AND name = ?'
                    );
                    $insertSeries->execute([$new, (string) $owner, $old]);

                    $insertNumbers = $this->db->prepare(
                        'INSERT OR IGNORE INTO series_numbers (owner, series, number)
                         SELECT owner, ?, number FROM series_numbers
                         WHERE owner = ? AND series = ?'
                    );
                    $insertNumbers->execute([$new, (string) $owner, $old]);

                    $this->db
                        ->prepare('DELETE FROM series_numbers WHERE owner = ? AND series = ?')
                        ->execute([(string) $owner, $old]);
                    $this->db
                        ->prepare('DELETE FROM series WHERE owner = ? AND name = ?')
                        ->execute([(string) $owner, $old]);
                    $this->db->commit();
                } catch (Throwable $error) {
                    $this->db->rollBack();

                    throw $error;
                }
            }
        }
    }

    private function migrateIsbnTable(): void
    {
        if ($this->tableExists('isbn_map') && !$this->columnExists('isbn_map', 'owner')) {
            $this->db->beginTransaction();

            try {
                $this->db->exec('ALTER TABLE isbn_map RENAME TO isbn_map_legacy');
                $this->db->exec(
                    'CREATE TABLE isbn_map (
                        owner TEXT NOT NULL,
                        isbn TEXT NOT NULL,
                        number INTEGER NOT NULL CHECK (number > 0),
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (owner, isbn)
                    )'
                );
                $this->db->exec(
                    "INSERT INTO isbn_map (owner, isbn, number, created_at)
                     SELECT 'admin', isbn, number, created_at FROM isbn_map_legacy"
                );
                $this->db->exec('DROP TABLE isbn_map_legacy');
                $this->db->commit();
            } catch (Throwable $error) {
                $this->db->rollBack();

                throw $error;
            }
        } else {
            $this->db->exec(
                'CREATE TABLE IF NOT EXISTS isbn_map (
                    owner TEXT NOT NULL,
                    isbn TEXT NOT NULL,
                    number INTEGER NOT NULL CHECK (number > 0),
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (owner, isbn)
                )'
            );
        }
    }

    private function tableExists(string $table): bool
    {
        $statement = $this->db->prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
        );
        $statement->execute([$table]);

        return $statement->fetchColumn() !== false;
    }

    private function seedIfEmpty(): void
    {
        $count = (int) $this->db->query('SELECT COUNT(*) FROM rows')->fetchColumn();

        if ($count > 0) {
            return;
        }

        $seededAt = $this->meta('seeded_at');

        if ($seededAt !== null) {
            return;
        }

        if (!is_file($this->seedPath)) {
            // Ohne Seed bleibt die Datenbank leer; das ist kein Fehler, aber
            // der Deploy sollte den Seed mitliefern.
            return;
        }

        $raw = file_get_contents($this->seedPath);
        $seed = json_decode($raw === false ? '' : $raw, true, 512, JSON_THROW_ON_ERROR);

        $this->db->beginTransaction();

        try {
            $insert = $this->db->prepare(
                'INSERT INTO rows (owner, kind, number, contained_in, created_at)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $now = gmdate('c');

            foreach (self::KINDS as $kind) {
                foreach ($seed[$kind] ?? [] as $row) {
                    $insert->execute([
                        'admin',
                        $kind,
                        (int) $row['number'],
                        $row['containedIn'] ?? null,
                        $now,
                    ]);
                }
            }

            $seriesInsert = $this->db->prepare(
                'INSERT OR IGNORE INTO series_numbers (owner, series, number)
                 VALUES (?, ?, ?)'
            );
            $seriesMeta = $this->db->prepare(
                'INSERT OR IGNORE INTO series (owner, name, position) VALUES (?, ?, ?)'
            );

            foreach ($seed['specials'] ?? [] as $position => $series) {
                $name = (string) $series['name'];
                $seriesMeta->execute(['admin', $name, $position]);

                foreach ($series['numbers'] ?? [] as $number) {
                    $seriesInsert->execute(['admin', $name, (int) $number]);
                }
            }

            $this->setMeta('seeded_at', $now);
            $this->setMeta('sheet_id', (string) ($seed['meta']['sheetId'] ?? ''));
            $this->setMeta('sheet_url', (string) ($seed['meta']['sheetUrl'] ?? ''));
            $this->setMeta(
                'seed_synced_at',
                (string) ($seed['meta']['syncedAt'] ?? $now)
            );
            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }
    }

    /**
     * Datenbanken, die vor der Trennung von `syncedAt`/`updatedAt` angelegt
     * wurden, kennen nur `seeded_at`. Ohne Nachtrag wuerde `syncedAt` bei
     * jedem Aufruf die aktuelle Zeit liefern. Deshalb einmalig den echten
     * Sheet-Zeitpunkt aus dem Seed uebernehmen, sonst den Seed-Zeitpunkt.
     */
    private function backfillSeedSyncedAt(): void
    {
        if ($this->meta('seed_synced_at') !== null) {
            return;
        }

        $seededAt = $this->meta('seeded_at');

        if ($seededAt === null) {
            return;
        }

        $syncedAt = $seededAt;

        if (is_file($this->seedPath)) {
            $raw = file_get_contents($this->seedPath);
            $seed = $raw === false ? null : json_decode($raw, true);
            $seedMeta = is_array($seed) && is_array($seed['meta'] ?? null)
                ? $seed['meta']
                : [];
            $fromSeed = $seedMeta['syncedAt'] ?? null;

            if (is_string($fromSeed) && trim($fromSeed) !== '') {
                $seedTime = strtotime($fromSeed);
                $seededTime = strtotime($seededAt);

                // Ein spaeter neu gesyncter Seed darf den Zeitpunkt nicht
                // nach vorne ziehen: die Datenbank entstand zum Seed-Lauf.
                $syncedAt = $seedTime !== false
                    && $seededTime !== false
                    && $seedTime > $seededTime
                        ? $seededAt
                        : $fromSeed;
            }
        }

        $this->setMeta('seed_synced_at', $syncedAt);
    }

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

    public function rememberIsbn(string $owner, string $isbn, int $number): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO isbn_map (owner, isbn, number, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (owner, isbn) DO UPDATE SET number = excluded.number'
        );
        $statement->execute([$owner, $isbn, $number, gmdate('c')]);
    }

    public function forgetIsbn(string $owner, string $isbn): bool
    {
        $statement = $this->db->prepare(
            'DELETE FROM isbn_map WHERE owner = ? AND isbn = ?'
        );
        $statement->execute([$owner, $isbn]);

        return $statement->rowCount() > 0;
    }

    /** @return array<string, int> ISBN-13 (normalisiert) => LTB-Nummer */
    public function isbnMappings(string $owner): array
    {
        $statement = $this->db->prepare(
            'SELECT isbn, number FROM isbn_map WHERE owner = ? ORDER BY isbn'
        );
        $statement->execute([$owner]);
        $mappings = [];

        foreach ($statement->fetchAll() as $row) {
            $mappings[(string) $row['isbn']] = (int) $row['number'];
        }

        return $mappings;
    }

    private function meta(string $key): ?string
    {
        $statement = $this->db->prepare('SELECT value FROM meta WHERE key = ?');
        $statement->execute([$key]);
        $value = $statement->fetchColumn();

        return $value === false ? null : (string) $value;
    }

    private function setMeta(string $key, string $value): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value'
        );
        $statement->execute([$key, $value]);
    }

    public function collection(string $owner): array
    {
        $rows = $this->fetchRows($owner, 'ltb');
        $specials = [];

        // Reihen stehen in einer eigenen Tabelle, damit auch eine (noch) leere
        // Sonderserie erhalten bleibt.
        $seriesStatement = $this->db->prepare(
            'SELECT name FROM series WHERE owner = ? ORDER BY position'
        );
        $seriesStatement->execute([$owner]);

        foreach ($seriesStatement->fetchAll(PDO::FETCH_COLUMN) as $name) {
            $specials[(string) $name] = ['name' => (string) $name, 'numbers' => []];
        }

        $numbersStatement = $this->db->prepare(
            'SELECT series, number FROM series_numbers WHERE owner = ? ORDER BY series, number'
        );
        $numbersStatement->execute([$owner]);

        foreach ($numbersStatement->fetchAll() as $seriesRow) {
            $name = (string) $seriesRow['series'];

            $specials[$name] ??= ['name' => $name, 'numbers' => []];
            $specials[$name]['numbers'][] = (int) $seriesRow['number'];
        }

        $lastWriteStatement = $this->db->prepare(
            'SELECT MAX(created_at) FROM rows WHERE owner = ?'
        );
        $lastWriteStatement->execute([$owner]);
        $lastWrite = $lastWriteStatement->fetchColumn();

        return [
            'meta' => [
                'sheetId' => $this->meta('sheet_id') ?? '',
                'sheetUrl' => $this->meta('sheet_url') ?? '',
                // Zeitpunkt des Sheet-Imports (nicht der letzten Schreiboperation).
                'syncedAt' => $this->meta('seed_synced_at')
                    ?? $this->meta('seeded_at')
                    ?? gmdate('c'),
                'updatedAt' => $lastWrite === false || $lastWrite === null
                    ? ($this->userCreatedAt($owner)
                        ?? $this->meta('seeded_at')
                        ?? gmdate('c'))
                    : (string) $lastWrite,
                'source' => 'sqlite',
            ],
            'ltb' => $rows,
            'isbnMap' => $this->isbnMappings($owner),
            'specials' => array_values($specials),
            'donaldDuck' => $this->fetchRows($owner, 'donaldDuck'),
            'panzerknacker' => $this->fetchRows($owner, 'panzerknacker'),
        ];
    }

    private function userCreatedAt(string $owner): ?string
    {
        $statement = $this->db->prepare(
            'SELECT created_at FROM users WHERE username = ?'
        );
        $statement->execute([$owner]);
        $value = $statement->fetchColumn();

        return $value === false ? null : (string) $value;
    }

    private function fetchRows(string $owner, string $kind): array
    {
        $statement = $this->db->prepare(
            'SELECT number, contained_in FROM rows
             WHERE owner = ? AND kind = ? ORDER BY id'
        );
        $statement->execute([$owner, $kind]);

        return array_map(
            static fn (array $row): array => [
                'number' => (int) $row['number'],
                'containedIn' => $row['contained_in'],
            ],
            $statement->fetchAll()
        );
    }

    /**
     * @param list<array{number: int, containedIn: ?string}> $items
     * @return list<array{number: int, containedIn: ?string}>
     */
    public function addLtbRows(string $owner, array $items): array
    {
        $insert = $this->db->prepare(
            'INSERT INTO rows (owner, kind, number, contained_in, created_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $now = gmdate('c');

        $this->db->beginTransaction();

        try {
            foreach ($items as $item) {
                $insert->execute([$owner, 'ltb', $item['number'], $item['containedIn'], $now]);
            }

            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }

        return $items;
    }

    /**
     * Aktualisiert die Notiz einer Zeile. `occurrence` ist der Index unter den
     * Zeilen mit derselben Nummer (0 = erste Zeile), weil Duplikate erlaubt sind.
     */
    public function updateLtbRow(
        string $owner,
        int $number,
        int $occurrence,
        ?string $containedIn
    ): bool {
        $id = $this->rowIdAt($owner, 'ltb', $number, $occurrence);

        if ($id === null) {
            return false;
        }

        $statement = $this->db->prepare(
            'UPDATE rows SET contained_in = ? WHERE id = ? AND owner = ?'
        );
        $statement->execute([$containedIn, $id, $owner]);

        return true;
    }

    public function removeLtbRow(string $owner, int $number, int $occurrence): bool
    {
        $id = $this->rowIdAt($owner, 'ltb', $number, $occurrence);

        if ($id === null) {
            return false;
        }

        $statement = $this->db->prepare(
            'DELETE FROM rows WHERE id = ? AND owner = ?'
        );
        $statement->execute([$id, $owner]);

        return true;
    }

    private function rowIdAt(
        string $owner,
        string $kind,
        int $number,
        int $occurrence
    ): ?int {
        $statement = $this->db->prepare(
            'SELECT id FROM rows WHERE owner = ? AND kind = ? AND number = ? ORDER BY id'
        );
        $statement->execute([$owner, $kind, $number]);
        $ids = $statement->fetchAll(PDO::FETCH_COLUMN);

        return isset($ids[$occurrence]) ? (int) $ids[$occurrence] : null;
    }

    public function createSeries(string $owner, string $name): string
    {
        $existing = $this->findSeries($owner, $name);

        if ($existing !== null) {
            return $existing;
        }

        $positionStatement = $this->db->prepare(
            'SELECT COALESCE(MAX(position), -1) + 1 FROM series WHERE owner = ?'
        );
        $positionStatement->execute([$owner]);
        $position = (int) $positionStatement->fetchColumn();

        $statement = $this->db->prepare(
            'INSERT INTO series (owner, name, position) VALUES (?, ?, ?)'
        );
        $statement->execute([$owner, $name, $position]);

        return $name;
    }

    /** Sucht eine Reihe ohne Rücksicht auf Groß-/Kleinschreibung. */
    public function findSeries(string $owner, string $name): ?string
    {
        $statement = $this->db->prepare(
            'SELECT name FROM series WHERE owner = ? AND lower(name) = lower(?) LIMIT 1'
        );
        $statement->execute([$owner, $name]);
        $found = $statement->fetchColumn();

        return $found === false ? null : (string) $found;
    }

    /**
     * @param list<int> $numbers
     * @return array{added: int, skipped: int}
     */
    public function addSeriesNumbers(string $owner, string $series, array $numbers): array
    {
        $insert = $this->db->prepare(
            'INSERT OR IGNORE INTO series_numbers (owner, series, number)
             VALUES (?, ?, ?)'
        );
        $added = 0;

        $this->db->beginTransaction();

        try {
            foreach ($numbers as $number) {
                $insert->execute([$owner, $series, $number]);
                $added += $insert->rowCount();
            }

            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }

        return ['added' => $added, 'skipped' => count($numbers) - $added];
    }

    public function removeSeriesNumber(string $owner, string $series, int $number): bool
    {
        $statement = $this->db->prepare(
            'DELETE FROM series_numbers WHERE owner = ? AND series = ? AND number = ?'
        );
        $statement->execute([$owner, $series, $number]);

        return $statement->rowCount() > 0;
    }

    public function counts(string $owner): array
    {
        $statement = $this->db->prepare(
            'SELECT kind, COUNT(*) AS total, COUNT(DISTINCT number) AS distinct_numbers
             FROM rows WHERE owner = ? GROUP BY kind'
        );
        $statement->execute([$owner]);
        $counts = ['ltb' => 0, 'donaldDuck' => 0, 'panzerknacker' => 0];

        foreach ($statement->fetchAll() as $row) {
            $counts[(string) $row['kind']] = (int) $row['total'];
        }

        return $counts;
    }
}
