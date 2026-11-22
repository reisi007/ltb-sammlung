<?php

declare(strict_types=1);

require_once __DIR__ . '/Store/Schema.php';
require_once __DIR__ . '/Store/Migration.php';
require_once __DIR__ . '/Store/Users.php';
require_once __DIR__ . '/Store/Isbn.php';
require_once __DIR__ . '/Store/Meta.php';
require_once __DIR__ . '/Store/Collection.php';
require_once __DIR__ . '/Store/Series.php';

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
 *
 * Die Methoden sind nach Themen in Traits unter `Store/` gruppiert; die
 * Klasse hält Verbindung, Seed-Pfad und Migrationsreihenfolge zusammen.
 */
final class Store
{
    use StoreSchema;
    use StoreMigration;
    use StoreUsers;
    use StoreIsbn;
    use StoreMeta;
    use StoreCollection;
    use StoreSeries;

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
        'LTB Sonderedition – Entenhausens Unterwelt' => 'Entenhausens Unterwelt',
        'LTB Sonderedition - Entenhausens Unterwelt' => 'Entenhausens Unterwelt',
        'Sonderedition – Entenhausens Unterwelt' => 'Entenhausens Unterwelt',
        'Sonderedition - Entenhausens Unterwelt' => 'Entenhausens Unterwelt',
        'Sonderedition Entenhausens Unterwelt' => 'Entenhausens Unterwelt',
        'Ultimate Phantomias' => 'LTB Ultimate Phantomias',
        'Young Comics' => 'LTB Young Comics',
    ];

    private PDO $db;

    public function __construct(string $databasePath, private readonly string $seedPath)
    {
        $directory = dirname($databasePath);

        // SQLite erzeugt DB, WAL und SHM mit 0666 & ~umask. Mit 077 entstehen
        // 0600-Dateien und 0700-Verzeichnisse; der alte Umask wird immer
        // wiederhergestellt, damit andere Codepfade unberuehrt bleiben.
        $previousUmask = umask(0o077);

        try {
            if (!is_dir($directory) && !mkdir($directory, 0o700, true) && !is_dir($directory)) {
                throw new RuntimeException("Datenverzeichnis nicht beschreibbar: {$directory}");
            }

            $this->db = new PDO('sqlite:' . $databasePath, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $this->db->exec('PRAGMA journal_mode = WAL');
            $this->db->exec('PRAGMA busy_timeout = 5000');

            // Bereits vorhandene, world-readable DB-Dateien duerfen nicht
            // still weiterbestehen — das betrifft auch WAL und SHM, die ein
            // Restore oder ein alter Container mit 0644 hinterlassen kann.
            // Fehlt das Recht zum Nachbessern, bricht der Start ab.
            foreach ([$databasePath, $databasePath . '-wal', $databasePath . '-shm'] as $dbFile) {
                if (is_file($dbFile) && !@chmod($dbFile, 0o600)) {
                    throw new RuntimeException("Datenbankdatei nicht absicherbar: {$dbFile}");
                }
            }

            $this->migrate();
            $this->seedIfEmpty();
            $this->migrateSeriesNames();
            $this->backfillSeedSyncedAt();
            $this->purgeExpiredSessions();
        } finally {
            umask($previousUmask);
        }
    }
}
