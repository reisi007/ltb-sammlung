<?php

declare(strict_types=1);

/**
 * Schreibt eine kompakte Kopie der SQLite-Datenbank (`VACUUM INTO`).
 *
 * Aufruf im Container:
 *   php /srv/api/bin/vacuum.php /data/ltb-vacuum.sqlite
 *
 * `VACUUM INTO` erzeugt eine konsistente Momentaufnahme, auch waehrend
 * geschrieben wird, und packt die Datei gleich zusammen. Das Ziel darf nicht
 * existieren; die Sicherung wird deshalb immer auf einen frischen Namen
 * geschrieben.
 */

$target = $argv[1] ?? '';
$databasePath = getenv('LTB_DB') ?: '/data/ltb.sqlite';

if ($target === '') {
    fwrite(STDERR, "Zielpfad fehlt.\n");
    exit(2);
}

if (file_exists($target)) {
    fwrite(STDERR, "Ziel existiert bereits: {$target}\n");
    exit(2);
}

$quoted = "'" . str_replace("'", "''", $target) . "'";

try {
    $db = new PDO('sqlite:' . $databasePath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $db->exec('PRAGMA busy_timeout = 10000');
    $db->exec('VACUUM INTO ' . $quoted);

    $copy = new PDO('sqlite:' . $target, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $result = $copy->query('PRAGMA integrity_check')->fetchColumn();

    if ($result !== 'ok') {
        fwrite(STDERR, "Integritaetspruefung fehlgeschlagen: " . var_export($result, true) . "\n");
        @unlink($target);
        exit(1);
    }

    // Eine valide, aber leere Sicherung wuerde eine gute Tagesdatei
    // ueberschreiben. Eine geseedete Installation hat immer Zeilen.
    $rows = (int) $copy->query('SELECT COUNT(*) FROM rows')->fetchColumn();

    if ($rows < 1) {
        fwrite(STDERR, "Datenbank hat keine Zeilen — keine Sicherung geschrieben.\n");
        @unlink($target);
        exit(1);
    }

    echo "VACUUM ok: {$target} (" . filesize($target) . " Bytes, {$rows} Zeilen)\n";
} catch (Throwable $error) {
    @unlink($target);
    fwrite(STDERR, 'VACUUM fehlgeschlagen: ' . $error->getMessage() . "\n");
    exit(1);
}
