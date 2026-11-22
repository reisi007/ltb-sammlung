<?php

declare(strict_types=1);

echo "Katalog-ISBN\n";
$catalogIndex = new Catalog($catalogPath);
check('Katalog-ISBN wird normalisiert gefunden', $catalogIndex->numberFor('9783770402212') === 219);
check('ISBN mit falscher Prüfziffer wird ignoriert', $catalogIndex->numberFor('9783770402198') === null);
check('widersprüchliche Katalog-ISBN wird verworfen', (new Catalog($conflictCatalogPath))->numberFor('9783770402212') === null);
check('fehlender Katalog bleibt leer', (new Catalog($workDir . '/gibt-es-nicht.json'))->numberFor('9783770402212') === null);

echo "Dateirechte und umask\n";
// Separater temporaerer Pfad: das bestehende Datenverzeichnis des Tests wird
// nicht angefasst, damit die Methoden der Store-Konstruktion sichtbar bleiben.
$secureDir = sys_get_temp_dir() . '/ltb-api-secure-' . bin2hex(random_bytes(4));
$secureDb = $secureDir . '/ltb.sqlite';
$umaskBefore = umask();
$secureStore = new Store($secureDb, $seedPath);
check('umask ist nach dem Konstruktor unveraendert', umask() === $umaskBefore);
check('neues Datenverzeichnis hat Modus 0700', (fileperms($secureDir) & 0o777) === 0o700);
check('neue SQLite-Datei hat Modus 0600', (fileperms($secureDb) & 0o777) === 0o600);
foreach (glob($secureDb . '-*') ?: [] as $secureDbFile) {
    check(
        'SQLite-Nebendatei ' . basename($secureDbFile) . ' hat Modus 0600',
        (fileperms($secureDbFile) & 0o777) === 0o600
    );
}
unset($secureStore);
foreach (glob($secureDir . '/*') ?: [] as $secureFile) {
    unlink($secureFile);
}
rmdir($secureDir);
