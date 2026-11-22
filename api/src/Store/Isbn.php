<?php

declare(strict_types=1);

/**
 * Gelernte ISBN-Zuordnungen pro Benutzer.
 *
 * Der Scanner merkt sich hier, welche ISBN zu welcher LTB-Nummer gehoert;
 * der Katalog in `Catalog.php` bleibt davon getrennt.
 */
trait StoreIsbn
{
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
}
