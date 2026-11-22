<?php

declare(strict_types=1);

echo "Persistenz\n";
$second = new Store($databasePath, $seedPath);
check('zweiter Start seedet nicht erneut', count($second->collection('admin')['ltb']) === 4);

echo "Seriennamen\n";
$seededNames = array_column($second->collection('admin')['specials'], 'name');
check(
    'Seed-Reihe wird auf den offiziellen Namen migriert',
    in_array('LTB Young Comics', $seededNames, true)
        && !in_array('Young', $seededNames, true)
);
$store->createSeries('admin', 'Enten Edition');
$store->addSeriesNumbers('admin', 'Enten Edition', [1, 2]);
$store->createSeries('admin', 'LTB Enten-Edition');
$store->addSeriesNumbers('admin', 'LTB Enten-Edition', [2, 3]);
$renamed = new Store($databasePath, $seedPath);
$renamedSpecials = array_column($renamed->collection('admin')['specials'], null, 'name');
$entenNumbers = $renamedSpecials['LTB Enten-Edition']['numbers'] ?? [];
sort($entenNumbers);
check(
    'Umbenennung fuehrt Nummern zusammen',
    !isset($renamedSpecials['Enten Edition']) && $entenNumbers === [1, 2, 3]
);
$renamedAgain = new Store($databasePath, $seedPath);
$entenCount = 0;
foreach ($renamedAgain->collection('admin')['specials'] as $series) {
    if ($series['name'] === 'LTB Enten-Edition') {
        $entenCount += 1;
    }
}
check('Umbenennung ist idempotent', $entenCount === 1);

$store->createSeries('admin', 'LTB Sonderedition – Entenhausens Unterwelt');
$store->addSeriesNumbers('admin', 'LTB Sonderedition – Entenhausens Unterwelt', [1]);
$store->createSeries('admin', 'Entenhausens Unterwelt');
$store->addSeriesNumbers('admin', 'Entenhausens Unterwelt', [2]);
$unterwelt = new Store($databasePath, $seedPath);
$unterweltSpecials = array_column($unterwelt->collection('admin')['specials'], null, 'name');
$unterweltNumbers = $unterweltSpecials['Entenhausens Unterwelt']['numbers'] ?? [];
sort($unterweltNumbers);
check(
    'Sonderedition wird auf die offizielle Kurzform migriert und zusammengefuehrt',
    !isset($unterweltSpecials['LTB Sonderedition – Entenhausens Unterwelt'])
        && $unterweltNumbers === [1, 2]
);

echo "Meta-Nachtrag\n";
$legacyDb = new PDO('sqlite:' . $databasePath);
$legacyDb->exec("DELETE FROM meta WHERE key = 'seed_synced_at'");
unset($legacyDb);
$migrated = new Store($databasePath, $seedPath);
check(
    'alte Datenbank bekommt syncedAt aus dem Seed statt der aktuellen Zeit',
    $migrated->collection('admin')['meta']['syncedAt'] === '2026-01-01T00:00:00+00:00'
);
$again = new Store($databasePath, $seedPath);
check(
    'zweiter Start aendert das nachgetragene syncedAt nicht',
    $again->collection('admin')['meta']['syncedAt'] === '2026-01-01T00:00:00+00:00'
);


echo "Legacy-Migration\n";
$legacyPath = $workDir . '/legacy.sqlite';
$legacyDb = new PDO('sqlite:' . $legacyPath);
$legacyDb->exec(
    'CREATE TABLE rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        number INTEGER NOT NULL,
        contained_in TEXT,
        created_at TEXT NOT NULL
    )'
);
$legacyDb->exec(
    "INSERT INTO rows (kind, number, contained_in, created_at)
     VALUES ('ltb', 219, 'Alt', '2026-01-01T00:00:00+00:00')"
);
$legacyDb->exec('CREATE TABLE series (name TEXT PRIMARY KEY, position INTEGER NOT NULL)');
$legacyDb->exec("INSERT INTO series (name, position) VALUES ('Alt-Reihe', 0)");
$legacyDb->exec(
    'CREATE TABLE series_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series TEXT NOT NULL,
        number INTEGER NOT NULL,
        UNIQUE (series, number)
    )'
);
$legacyDb->exec("INSERT INTO series_numbers (series, number) VALUES ('Alt-Reihe', 3)");
$legacyDb->exec(
    'CREATE TABLE isbn_map (
        isbn TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )'
);
$legacyDb->exec(
    "INSERT INTO isbn_map (isbn, number, created_at)
     VALUES ('9783770402199', 219, '2026-01-01T00:00:00+00:00')"
);
$legacyDb->exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
$legacyDb->exec("INSERT INTO meta (key, value) VALUES ('seeded_at', '2026-01-01T00:00:00+00:00')");
$legacyDb = null;

$legacyStore = new Store($legacyPath, $workDir . '/no-seed.json');
$legacyCollection = $legacyStore->collection('admin');
check(
    'Migration ordnet Zeilen admin zu',
    count($legacyCollection['ltb']) === 1
        && $legacyCollection['ltb'][0]['containedIn'] === 'Alt'
);
check(
    'Migration ordnet Reihen admin zu',
    $legacyCollection['specials'][0]['name'] === 'Alt-Reihe'
        && $legacyCollection['specials'][0]['numbers'] === [3]
);
check(
    'Migration ordnet ISBN admin zu',
    ($legacyCollection['isbnMap']['9783770402199'] ?? null) === 219
);
check('Migration laesst neue Benutzer leer', $legacyStore->collection('neu')['ltb'] === []);
$legacyAgain = new Store($legacyPath, $workDir . '/no-seed.json');
check('Migration ist idempotent', count($legacyAgain->collection('admin')['ltb']) === 1);

echo "Sessions und Benutzer\n";
$beforeCreate = time();
$store->createUser('sessionuser', password_hash('sessionpass', PASSWORD_DEFAULT));
$emptyUpdatedAt = $store->collection('sessionuser')['meta']['updatedAt'];
$emptyUpdatedTime = strtotime($emptyUpdatedAt);
check(
    'leerer Benutzer nutzt seine Anlagezeit als updatedAt',
    $emptyUpdatedTime !== false
        && $emptyUpdatedTime >= $beforeCreate
        && $emptyUpdatedTime <= time() + 1
);
$store->createSession(hash('sha256', 'token-a'), 'sessionuser', 3600);
check('Session ist gueltig', $store->sessionUser(hash('sha256', 'token-a')) === 'sessionuser');
$store->setUserPassword('sessionuser', password_hash('neuespass', PASSWORD_DEFAULT));
check(
    'Passwortwechsel beendet bestehende Sessions',
    $store->sessionUser(hash('sha256', 'token-a')) === null
);
$store->createSession(hash('sha256', 'token-b'), 'sessionuser', 3600);
$store->deleteUser('sessionuser');
check(
    'geloeschter Benutzer hat keine gueltige Session',
    $store->sessionUser(hash('sha256', 'token-b')) === null
);
