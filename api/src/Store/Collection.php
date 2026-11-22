<?php

declare(strict_types=1);

/**
 * Sammlungszeilen: Lesen der kompletten Sammlung und Schreiben einzelner
 * LTB-Zeilen.
 *
 * Zeilen werden nie dedupliziert; `occurrence` adressiert eine Zeile unter
 * mehreren mit derselben Nummer.
 */
trait StoreCollection
{
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
}
