<?php

declare(strict_types=1);

/**
 * Sonderserien und ihre Nummernkreise.
 *
 * Reihen haben eigene Nummernkreise und stehen in eigenen Tabellen; eine
 * (noch) leere Reihe bleibt dadurch erhalten.
 */
trait StoreSeries
{
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
