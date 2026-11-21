<?php

declare(strict_types=1);

/**
 * SQLite-Speicher der Sammlung.
 *
 * Die Datenbank ist nach dem ersten Start die Quelle für die Oberfläche. Der
 * Sheet-Snapshot dient nur als Seed: Er wird importiert, solange die Tabelle
 * leer ist. Zeilen werden nie dedupliziert — eine Nummer darf mehrfach
 * vorkommen, pro Exemplar eine Zeile.
 */
final class Store
{
    private const KINDS = ['ltb', 'donaldDuck', 'panzerknacker'];

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
        $this->backfillSeedSyncedAt();
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
                kind TEXT NOT NULL CHECK (kind IN ('ltb', 'donaldDuck', 'panzerknacker')),
                number INTEGER NOT NULL CHECK (number > 0),
                contained_in TEXT,
                created_at TEXT NOT NULL
            )"
        );
        $this->db->exec(
            'CREATE INDEX IF NOT EXISTS rows_kind_number ON rows (kind, number)'
        );
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS series (
                name TEXT PRIMARY KEY,
                position INTEGER NOT NULL
            )'
        );
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS series_numbers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                series TEXT NOT NULL,
                number INTEGER NOT NULL CHECK (number > 0),
                UNIQUE (series, number)
            )'
        );
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
                'INSERT INTO rows (kind, number, contained_in, created_at) VALUES (?, ?, ?, ?)'
            );
            $now = gmdate('c');

            foreach (self::KINDS as $kind) {
                foreach ($seed[$kind] ?? [] as $row) {
                    $insert->execute([
                        $kind,
                        (int) $row['number'],
                        $row['containedIn'] ?? null,
                        $now,
                    ]);
                }
            }

            $seriesInsert = $this->db->prepare(
                'INSERT OR IGNORE INTO series_numbers (series, number) VALUES (?, ?)'
            );
            $seriesMeta = $this->db->prepare(
                'INSERT OR IGNORE INTO series (name, position) VALUES (?, ?)'
            );

            foreach ($seed['specials'] ?? [] as $position => $series) {
                $name = (string) $series['name'];
                $seriesMeta->execute([$name, $position]);

                foreach ($series['numbers'] ?? [] as $number) {
                    $seriesInsert->execute([$name, (int) $number]);
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
            $fromSeed = is_array($seed) ? ($seed['meta']['syncedAt'] ?? null) : null;

            if (is_string($fromSeed) && trim($fromSeed) !== '') {
                $syncedAt = $fromSeed;
            }
        }

        $this->setMeta('seed_synced_at', $syncedAt);
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

    public function collection(): array
    {
        $rows = $this->fetchRows('ltb');
        $specials = [];

        // Reihen stehen in einer eigenen Tabelle, damit auch eine (noch) leere
        // Sonderserie erhalten bleibt.
        $seriesNames = $this->db
            ->query('SELECT name FROM series ORDER BY position')
            ->fetchAll(PDO::FETCH_COLUMN);

        foreach ($seriesNames as $name) {
            $specials[(string) $name] = ['name' => (string) $name, 'numbers' => []];
        }

        $statement = $this->db->query(
            'SELECT series, number FROM series_numbers ORDER BY series, number'
        );

        foreach ($statement->fetchAll() as $seriesRow) {
            $name = (string) $seriesRow['series'];

            $specials[$name] ??= ['name' => $name, 'numbers' => []];
            $specials[$name]['numbers'][] = (int) $seriesRow['number'];
        }

        $lastWrite = $this->db->query('SELECT MAX(created_at) FROM rows')->fetchColumn();

        return [
            'meta' => [
                'sheetId' => $this->meta('sheet_id') ?? '',
                'sheetUrl' => $this->meta('sheet_url') ?? '',
                // Zeitpunkt des Sheet-Imports (nicht der letzten Schreiboperation).
                'syncedAt' => $this->meta('seed_synced_at')
                    ?? $this->meta('seeded_at')
                    ?? gmdate('c'),
                'updatedAt' => $lastWrite === false || $lastWrite === null
                    ? gmdate('c')
                    : (string) $lastWrite,
                'source' => 'sqlite',
            ],
            'ltb' => $rows,
            'specials' => array_values($specials),
            'donaldDuck' => $this->fetchRows('donaldDuck'),
            'panzerknacker' => $this->fetchRows('panzerknacker'),
        ];
    }

    private function fetchRows(string $kind): array
    {
        $statement = $this->db->prepare(
            'SELECT number, contained_in FROM rows WHERE kind = ? ORDER BY id'
        );
        $statement->execute([$kind]);

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
    public function addLtbRows(array $items): array
    {
        $insert = $this->db->prepare(
            'INSERT INTO rows (kind, number, contained_in, created_at) VALUES (?, ?, ?, ?)'
        );
        $now = gmdate('c');

        $this->db->beginTransaction();

        try {
            foreach ($items as $item) {
                $insert->execute(['ltb', $item['number'], $item['containedIn'], $now]);
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
    public function updateLtbRow(int $number, int $occurrence, ?string $containedIn): bool
    {
        $id = $this->rowIdAt('ltb', $number, $occurrence);

        if ($id === null) {
            return false;
        }

        $statement = $this->db->prepare('UPDATE rows SET contained_in = ? WHERE id = ?');
        $statement->execute([$containedIn, $id]);

        return true;
    }

    public function removeLtbRow(int $number, int $occurrence): bool
    {
        $id = $this->rowIdAt('ltb', $number, $occurrence);

        if ($id === null) {
            return false;
        }

        $statement = $this->db->prepare('DELETE FROM rows WHERE id = ?');
        $statement->execute([$id]);

        return true;
    }

    private function rowIdAt(string $kind, int $number, int $occurrence): ?int
    {
        $statement = $this->db->prepare(
            'SELECT id FROM rows WHERE kind = ? AND number = ? ORDER BY id'
        );
        $statement->execute([$kind, $number]);
        $ids = $statement->fetchAll(PDO::FETCH_COLUMN);

        return isset($ids[$occurrence]) ? (int) $ids[$occurrence] : null;
    }

    public function createSeries(string $name): string
    {
        $existing = $this->findSeries($name);

        if ($existing !== null) {
            return $existing;
        }

        $position = (int) $this->db
            ->query('SELECT COALESCE(MAX(position), -1) + 1 FROM series')
            ->fetchColumn();

        $statement = $this->db->prepare(
            'INSERT INTO series (name, position) VALUES (?, ?)'
        );
        $statement->execute([$name, $position]);

        return $name;
    }

    /** Sucht eine Reihe ohne Rücksicht auf Groß-/Kleinschreibung. */
    public function findSeries(string $name): ?string
    {
        $statement = $this->db->prepare(
            'SELECT name FROM series WHERE lower(name) = lower(?) LIMIT 1'
        );
        $statement->execute([$name]);
        $found = $statement->fetchColumn();

        return $found === false ? null : (string) $found;
    }

    /**
     * @param list<int> $numbers
     * @return array{added: int, skipped: int}
     */
    public function addSeriesNumbers(string $series, array $numbers): array
    {
        $insert = $this->db->prepare(
            'INSERT OR IGNORE INTO series_numbers (series, number) VALUES (?, ?)'
        );
        $added = 0;

        $this->db->beginTransaction();

        try {
            foreach ($numbers as $number) {
                $insert->execute([$series, $number]);
                $added += $insert->rowCount();
            }

            $this->db->commit();
        } catch (Throwable $error) {
            $this->db->rollBack();

            throw $error;
        }

        return ['added' => $added, 'skipped' => count($numbers) - $added];
    }

    public function removeSeriesNumber(string $series, int $number): bool
    {
        $statement = $this->db->prepare(
            'DELETE FROM series_numbers WHERE series = ? AND number = ?'
        );
        $statement->execute([$series, $number]);

        return $statement->rowCount() > 0;
    }

    public function counts(): array
    {
        $statement = $this->db->query(
            'SELECT kind, COUNT(*) AS total, COUNT(DISTINCT number) AS distinct_numbers
             FROM rows GROUP BY kind'
        );
        $counts = ['ltb' => 0, 'donaldDuck' => 0, 'panzerknacker' => 0];

        foreach ($statement->fetchAll() as $row) {
            $counts[(string) $row['kind']] = (int) $row['total'];
        }

        return $counts;
    }
}
