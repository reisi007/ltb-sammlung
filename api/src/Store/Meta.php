<?php

declare(strict_types=1);

/**
 * Schluessel/Wert-Paare der Tabelle `meta`.
 *
 * Sie halten Herkunft und Zeitpunkte des Sheet-Imports; die Migration und
 * `collection()` lesen und schreiben darueber.
 */
trait StoreMeta
{
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
}
