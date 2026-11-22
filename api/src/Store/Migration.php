<?php

declare(strict_types=1);

/**
 * Datenmigrationen nach dem Schema: Seed-Import, Reihen-Umbenennungen und
 * der Nachtrag des Sheet-Zeitpunkts.
 *
 * Alle Schritte sind idempotent und laufen beim Start der Datenbank.
 */
trait StoreMigration
{
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
}
