<?php

declare(strict_types=1);

/**
 * Schema-Anlage und -Umbau der Datenbank.
 *
 * Alte Datenbanken ohne `owner` werden einmalig umgebaut; jede Migration ist
 * idempotent, damit ein Neustart beliebig oft moeglich ist.
 */
trait StoreSchema
{
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
}
