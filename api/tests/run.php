<?php

declare(strict_types=1);

/**
 * Tests der API ohne Framework: `php api/tests/run.php`.
 *
 * Deckt Seed, Duplikate, Occurrence-Semantik und die Eingabevalidierung ab.
 */

require __DIR__ . '/../src/Validation.php';
require __DIR__ . '/../src/Store.php';
require __DIR__ . '/../src/Api.php';

$failures = 0;
$checks = 0;

function check(string $label, bool $condition): void
{
    global $failures, $checks;
    $checks++;

    if ($condition) {
        echo "  ok   {$label}\n";

        return;
    }

    $failures++;
    echo "  FAIL {$label}\n";
}

function expect_validation_error(string $label, int $status, callable $callback): void
{
    try {
        $callback();
        check($label, false);
    } catch (ValidationError $error) {
        check($label, $error->status === $status);
    }
}

$workDir = sys_get_temp_dir() . '/ltb-api-test-' . bin2hex(random_bytes(4));
mkdir($workDir, 0o775, true);

$seedPath = $workDir . '/collection.json';
file_put_contents($seedPath, json_encode([
    'meta' => [
        'sheetId' => 'sheet-id',
        'sheetUrl' => 'https://example.test/sheet',
        'syncedAt' => '2026-01-01T00:00:00+00:00',
    ],
    'ltb' => [
        ['number' => 219, 'containedIn' => 'MM 4'],
        ['number' => 219, 'containedIn' => null],
        ['number' => 13, 'containedIn' => null],
    ],
    'specials' => [
        ['name' => 'LTB Spezial', 'numbers' => [1, 2, 3]],
        ['name' => 'Young', 'numbers' => []],
    ],
    'donaldDuck' => [['number' => 201, 'containedIn' => null]],
    'panzerknacker' => [['number' => 2, 'containedIn' => 'Sammelband']],
], JSON_THROW_ON_ERROR));

// Synthetische Test-ISBNs mit gültiger Prüfziffer. Sie sind keine belegten
// Banddaten, sondern nur Fixtures für Katalog-Lookup und Konflikterkennung.
$catalogPath = $workDir . '/catalog.json';
file_put_contents($catalogPath, json_encode([
    'meta' => ['sources' => [], 'syncedAt' => '2026-01-01T00:00:00+00:00'],
    'entries' => [
        [
            'number' => 219,
            'title' => 'Der Zauber-Zylinder',
            'coverUrl' => null,
            'coverUrlOfficial' => null,
            'isbn' => '978-3-7704-0221-2',
        ],
        [
            'number' => 901,
            'title' => null,
            'coverUrl' => null,
            'coverUrlOfficial' => null,
            'isbn' => '9783770402198', // falsche Prüfziffer: wird ignoriert
        ],
        [
            'number' => 902,
            'title' => null,
            'coverUrl' => null,
            'coverUrlOfficial' => null,
            'isbn' => null,
        ],
    ],
    'series' => [],
], JSON_THROW_ON_ERROR));

$conflictCatalogPath = $workDir . '/catalog-conflict.json';
file_put_contents($conflictCatalogPath, json_encode([
    'meta' => ['sources' => [], 'syncedAt' => '2026-01-01T00:00:00+00:00'],
    'entries' => [
        ['number' => 219, 'isbn' => '9783770402212'],
        ['number' => 220, 'isbn' => '9783770402212'],
    ],
    'series' => [],
], JSON_THROW_ON_ERROR));

echo "Katalog-ISBN\n";
$catalogIndex = new Catalog($catalogPath);
check('Katalog-ISBN wird normalisiert gefunden', $catalogIndex->numberFor('9783770402212') === 219);
check('ISBN mit falscher Prüfziffer wird ignoriert', $catalogIndex->numberFor('9783770402198') === null);
check('widersprüchliche Katalog-ISBN wird verworfen', (new Catalog($conflictCatalogPath))->numberFor('9783770402212') === null);
check('fehlender Katalog bleibt leer', (new Catalog($workDir . '/gibt-es-nicht.json'))->numberFor('9783770402212') === null);

$databasePath = $workDir . '/ltb.sqlite';
$store = new Store($databasePath, $seedPath);

echo "Seed\n";
$collection = $store->collection('admin');
check('seedet drei LTB-Zeilen', count($collection['ltb']) === 3);
check('behält doppelte Nummer 219', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 2);
check('behält die freie Notiz', $collection['ltb'][0]['containedIn'] === 'MM 4');
check('liefert Sonderserien getrennt', count($collection['specials']) === 2);
check('leere Sonderserie bleibt erhalten', $collection['specials'][1]['numbers'] === []);
check('Meta kommt aus dem Seed', $collection['meta']['sheetId'] === 'sheet-id');
check(
    'syncedAt ist der Seed-Zeitpunkt',
    $collection['meta']['syncedAt'] === '2026-01-01T00:00:00+00:00'
);

echo "Hinzufügen\n";
$store->addLtbRows('admin', [
    ['number' => 900, 'containedIn' => null],
    ['number' => 219, 'containedIn' => 'Zweites Exemplar'],
]);
$collection = $store->collection('admin');
check('drei Zeilen 219 nach dem Hinzufügen?', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 3);
check('unbekannte Nummer wird gespeichert', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 900
)) === 1);

echo "Occurrence-Semantik\n";
check('Notiz der zweiten Zeile 219 ändern', $store->updateLtbRow('admin', 219, 1, 'Notiz 2'));
$collection = $store->collection('admin');
$rows219 = array_values(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
));
check('erste Zeile 219 unverändert', $rows219[0]['containedIn'] === 'MM 4');
check('zweite Zeile 219 aktualisiert', $rows219[1]['containedIn'] === 'Notiz 2');
check('unbekannte Occurrence liefert false', $store->updateLtbRow('admin', 219, 9, 'x') === false);
check('Löschen der dritten Zeile 219', $store->removeLtbRow('admin', 219, 2) === true);
$collection = $store->collection('admin');
check('nach dem Löschen zwei Zeilen 219', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 2);
check('Löschen einer unbekannten Occurrence liefert false', $store->removeLtbRow('admin', 219, 5) === false);

echo "ISBN-Zuordnung\n";
$store->rememberIsbn('admin', '9783770402199', 219);
$store->rememberIsbn('admin', '9783770402199', 220);
check('ISBN-Zuordnung wird gespeichert und ueberschrieben', $store->isbnMappings('admin')['9783770402199'] === 220);
check('Sammlung liefert die ISBN-Zuordnung mit', ($store->collection('admin')['isbnMap']['9783770402199'] ?? null) === 220);

echo "Validierung\n";
$valid = validate_add_body(['items' => [
    ['number' => 12, 'containedIn' => '  Notiz  '],
    ['number' => '13'],
]]);
check('akzeptiert mehrere Eintraege', count($valid) === 2);
check('trimmt die Notiz', $valid[0]['containedIn'] === 'Notiz');
check('leere Notiz wird null', $valid[1]['containedIn'] === null);
check('akzeptiert eine einzelne Zahl als Objekt', validate_add_body(['number' => 7])[0]['number'] === 7);

expect_validation_error('lehnt mehr als MAX_ADD_ITEMS ab', 422, static fn () => validate_add_body([
    'items' => array_fill(0, MAX_ADD_ITEMS + 1, ['number' => 1]),
]));
expect_validation_error('lehnt leere Liste ab', 422, static fn () => validate_add_body([
    'items' => [],
]));
expect_validation_error('lehnt Nummer 0 ab', 422, static fn () => validate_item(['number' => 0], 0));
expect_validation_error('lehnt Text als Nummer ab', 422, static fn () => validate_item(['number' => 'abc'], 0));
expect_validation_error('lehnt zu lange Notiz ab', 422, static fn () => validate_item([
    'number' => 5,
    'containedIn' => str_repeat('x', 201),
], 0));
expect_validation_error('lehnt negative Occurrence ab', 422, static fn () => validate_row_reference([
    'number' => 5,
    'occurrence' => -1,
]));

echo "Sonderserien\n";
$created = $store->createSeries('admin', validate_series_name("  Micky Maus   Legacy Collection "));
check('legt eine neue Reihe an und normalisiert den Namen', $created === 'Micky Maus Legacy Collection');
check('findet die Reihe ohne Groß-/Kleinschreibung', $store->findSeries('admin', 'micky maus legacy collection') === $created);
check('legt dieselbe Reihe nicht doppelt an', $store->createSeries('admin', 'MICKY MAUS LEGACY COLLECTION') === $created);
$added = $store->addSeriesNumbers('admin', $created, [1, 2, 3]);
check('fügt drei Bände hinzu', $added === ['added' => 3, 'skipped' => 0]);
$again = $store->addSeriesNumbers('admin', $created, [3]);
check('ignoriert bereits vorhandene Bände', $again === ['added' => 0, 'skipped' => 1]);
$collection = $store->collection('admin');
$legacy = null;
foreach ($collection['specials'] as $series) {
    if ($series['name'] === $created) {
        $legacy = $series;
    }
}
check('neue Reihe erscheint in der Sammlung', $legacy !== null && $legacy['numbers'] === [1, 2, 3]);
check('unbekannte Reihe liefert null', $store->findSeries('admin', 'Gibt es nicht') === null);
check('entfernt einen Band', $store->removeSeriesNumber('admin', $created, 2) === true);
check('entfernt keinen unbekannten Band', $store->removeSeriesNumber('admin', $created, 99) === false);

expect_validation_error('lehnt leeren Reihennamen ab', 422, static fn () => validate_series_name('   '));
expect_validation_error('lehnt zu langen Reihennamen ab', 422, static fn () => validate_series_name(str_repeat('x', 61)));
expect_validation_error('lehnt mehr als MAX_ADD_ITEMS Reihen-Baende ab', 422, static fn () => validate_series_numbers(array_fill(0, MAX_ADD_ITEMS + 1, 1)));
expect_validation_error('lehnt Text als Reihen-Band ab', 422, static fn () => validate_series_numbers(['abc']));

check('ISBN-13 mit Bindestrichen wird normalisiert', validate_isbn('978-3-7704-0219-9') === '9783770402199');
check('ISBN-10 wird zu ISBN-13', validate_isbn('3-7704-0219-7') === '9783770402199');
expect_validation_error('lehnt falsche ISBN-Pruefziffer ab', 422, static fn () => validate_isbn('9783770402190'));
expect_validation_error('lehnt Text als ISBN ab', 422, static fn () => validate_isbn('keine isbn'));

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

echo "HTTP-Schicht\n";
$api = new Api($store, $catalogPath);
$store->createUser('admin', password_hash('geheim', PASSWORD_DEFAULT));
$store->createUser('zoe', password_hash('zoe-geheim', PASSWORD_DEFAULT));

$loginBody = '{"username":"admin","password":"geheim"}';
$response = $api->dispatch(
    'POST',
    '/api/login',
    ['HTTP_HOST' => 'ltb.test', 'REMOTE_ADDR' => '10.0.0.1'],
    $loginBody,
    strlen($loginBody)
);
check('Login ist 200', $response['status'] === 200);
check('Login nennt den Benutzer', ($response['payload']['user'] ?? null) === 'admin');
$cookie = (string) ($response['headers']['Set-Cookie'] ?? '');
check('Cookie ist HttpOnly', str_contains($cookie, 'HttpOnly'));
check('Cookie ist SameSite=Lax', str_contains($cookie, 'SameSite=Lax'));
preg_match('/auth=([a-f0-9]{64})/', $cookie, $match);
$adminToken = $match[1] ?? '';
check('Cookie traegt ein Session-Token', $adminToken !== '');
$admin = [
    'HTTP_HOST' => 'ltb.test',
    'REMOTE_ADDR' => '10.0.0.1',
    'HTTP_COOKIE' => 'auth=' . $adminToken,
];

$response = $api->dispatch('GET', '/api/health', [], '', 0);
check('health ist ohne Login erreichbar', $response['status'] === 200);
check('health liefert status ok', ($response['payload']['status'] ?? null) === 'ok');
check('Cache-Control ist no-store', ($response['headers']['Cache-Control'] ?? '') === 'no-store');
check('nosniff ist gesetzt', ($response['headers']['X-Content-Type-Options'] ?? '') === 'nosniff');
check('kein X-Powered-By im Response-Objekt', !isset($response['headers']['X-Powered-By']));

$response = $api->dispatch('GET', '/api/collection', [], '', 0);
check('Sammlung ohne Cookie ist 401', $response['status'] === 401);
check('401 nennt den Grund', ($response['payload']['error'] ?? '') === 'Nicht angemeldet.');

$response = $api->dispatch(
    'GET',
    '/api/collection',
    ['HTTP_HOST' => 'ltb.test', 'REMOTE_USER' => 'admin'],
    '',
    0
);
check('REMOTE_USER ohne Cookie ist 401', $response['status'] === 401);

$response = $api->dispatch('GET', '/api/collection', $admin, '', 0);
check('Sammlung mit Cookie ist 200', $response['status'] === 200);
check('Meta nennt den Benutzer', ($response['payload']['meta']['user'] ?? null) === 'admin');
check('Meta nennt SQLite als Quelle', ($response['payload']['meta']['source'] ?? null) === 'sqlite');

$response = $api->dispatch('GET', '/api/me', [], '', 0);
check('/api/me ohne Cookie ist 401', $response['status'] === 401);
$response = $api->dispatch('GET', '/api/me', $admin, '', 0);
check('/api/me mit Cookie ist 200', ($response['payload']['user'] ?? null) === 'admin');
$response = $api->dispatch('GET', '/api/auth/check', [], '', 0);
check('forward_auth-Check ohne Cookie ist 401', $response['status'] === 401);
$response = $api->dispatch('GET', '/api/auth/check', $admin, '', 0);
check('forward_auth-Check mit Cookie ist 200', $response['status'] === 200);

$foreign = $admin + ['HTTP_ORIGIN' => 'https://evil.test'];
$response = $api->dispatch('POST', '/api/ltb', $foreign, '{"items":[{"number":5}]}', 23);
check('fremder Origin ist 403', $response['status'] === 403);

echo "API ISBN\n";
$isbnBody = '{"isbn":"978-3-7704-0219-9","number":219}';
$response = $api->dispatch('PUT', '/api/isbn', $admin, $isbnBody, strlen($isbnBody));
check('PUT /api/isbn ist 200', $response['status'] === 200);
check('PUT /api/isbn normalisiert', ($response['payload']['isbn'] ?? null) === '9783770402199');
check('PUT /api/isbn speichert die Nummer', ($store->isbnMappings('admin')['9783770402199'] ?? null) === 219);
check(
    'leere ISBN-Map wird als {} kodiert',
    json_encode(Api::forJson(['isbnMap' => []])) === '{"isbnMap":{}}'
);
check(
    'gefuellte ISBN-Map bleibt ein Objekt',
    json_encode(Api::forJson(['isbnMap' => ['9783770402199' => 219]]))
        === '{"isbnMap":{"9783770402199":219}}'
);

$beforeMap = $store->isbnMappings('admin');
$badBody = '{"isbn":"9783770402190","number":5}';
$response = $api->dispatch('PUT', '/api/isbn', $admin, $badBody, strlen($badBody));
check('falsche Pruefziffer ist 422', $response['status'] === 422);
check('422 aendert keine Zuordnung', $store->isbnMappings('admin') === $beforeMap);

$response = $api->dispatch('PUT', '/api/isbn', [], $isbnBody, strlen($isbnBody));
check('PUT /api/isbn ohne Login ist 401', $response['status'] === 401);
$response = $api->dispatch('PUT', '/api/isbn', $foreign, $isbnBody, strlen($isbnBody));
check('PUT /api/isbn mit fremdem Origin ist 403', $response['status'] === 403);

$deleteIsbn = '{"isbn":"9783770402199"}';
$response = $api->dispatch('DELETE', '/api/isbn', $admin, $deleteIsbn, strlen($deleteIsbn));
check('DELETE /api/isbn ist 200', $response['status'] === 200);
check('DELETE entfernt die Zuordnung', !isset($store->isbnMappings('admin')['9783770402199']));
$response = $api->dispatch('DELETE', '/api/isbn', $admin, $deleteIsbn, strlen($deleteIsbn));
check('DELETE einer unbekannten ISBN ist 404', $response['status'] === 404);

echo "API Lookup\n";
$response = $api->dispatch(
    'GET',
    '/api/lookup',
    ['HTTP_HOST' => 'ltb.test', 'QUERY_STRING' => 'isbn=978-3-7704-0221-2'],
    '',
    0
);
check('GET /api/lookup ohne Login ist 401', $response['status'] === 401);

$lookup = $admin + ['QUERY_STRING' => 'isbn=978-3-7704-0221-2'];
$response = $api->dispatch('GET', '/api/lookup', $lookup, '', 0);
check('Lookup findet eine Katalog-ISBN', $response['status'] === 200);
check('Lookup liefert die Katalog-Nummer', ($response['payload']['number'] ?? null) === 219);
check('Lookup normalisiert die ISBN-13', ($response['payload']['isbn'] ?? null) === '9783770402212');

$lookupIsbn10 = $admin + ['QUERY_STRING' => 'isbn=3-7704-0221-9'];
$response = $api->dispatch('GET', '/api/lookup', $lookupIsbn10, '', 0);
check(
    'Lookup rechnet ISBN-10 in ISBN-13 um',
    $response['status'] === 200
        && ($response['payload']['isbn'] ?? null) === '9783770402212'
);

// Die gelernte Zuordnung des Benutzers hat Vorrang vor dem Katalog.
$store->rememberIsbn('admin', '9783770402212', 220);
$response = $api->dispatch('GET', '/api/lookup', $lookup, '', 0);
check(
    'gelernte Zuordnung hat Vorrang vor dem Katalog',
    $response['status'] === 200 && ($response['payload']['number'] ?? null) === 220
);
$store->forgetIsbn('admin', '9783770402212');

$unknownLookup = $admin + ['QUERY_STRING' => 'isbn=9783770402236'];
$response = $api->dispatch('GET', '/api/lookup', $unknownLookup, '', 0);
check('unbekannte ISBN ist 404', $response['status'] === 404);
check(
    '404 nennt den Grund',
    ($response['payload']['error'] ?? '') === 'Diese ISBN ist keinem Band zugeordnet.'
);

$invalidLookup = $admin + ['QUERY_STRING' => 'isbn=9783770402230'];
$response = $api->dispatch('GET', '/api/lookup', $invalidLookup, '', 0);
check('ungültige Prüfziffer ist 400', $response['status'] === 400);

$missingLookup = $admin + ['QUERY_STRING' => 'foo=bar'];
$response = $api->dispatch('GET', '/api/lookup', $missingLookup, '', 0);
check('fehlende ISBN ist 400', $response['status'] === 400);

$response = $api->dispatch('POST', '/api/ltb', $admin, '', 70000);
check('Body ueber 64 KB ist 413', $response['status'] === 413);

$response = $api->dispatch('POST', '/api/ltb', $admin, '{kaputt', 7);
check('kaputtes JSON ist 400', $response['status'] === 400);

$response = $api->dispatch('POST', '/api/ltb', $admin, '', 0);
check('leerer Body ist 400', $response['status'] === 400);

$hugeWithoutLength = '{"items":[{"number":5,"containedIn":"' . str_repeat('x', 70000) . '"}]}';
$response = $api->dispatch('POST', '/api/ltb', $admin, $hugeWithoutLength, 0);
check('Body ueber 64 KB ohne Content-Length ist 413', $response['status'] === 413);

$beforeSeries = count($store->collection('admin')['specials']);
$tooManyNumbers = json_encode([
    'name' => 'Regression',
    'numbers' => array_fill(0, MAX_ADD_ITEMS + 1, 1),
]);
$response = $api->dispatch(
    'POST',
    '/api/series',
    $admin,
    $tooManyNumbers,
    strlen($tooManyNumbers)
);
$afterSeries = count($store->collection('admin')['specials']);
check('zu viele Serien-Baende sind 422', $response['status'] === 422);
check('422 legt keine leere Reihe an', $afterSeries === $beforeSeries);
check('422 legt den Namen nicht an', $store->findSeries('admin', 'Regression') === null);

$created = '{"items":[{"number":4242,"containedIn":"HTTP-Test"}]}';
$response = $api->dispatch('POST', '/api/ltb', $admin, $created, strlen($created));
check('Anlegen ohne Origin ist 201', $response['status'] === 201);
check('Response nennt eine angelegte Zeile', ($response['payload']['created'] ?? null) === 1);

$sameOrigin = $admin + ['HTTP_ORIGIN' => 'https://ltb.test'];
$response = $api->dispatch('POST', '/api/ltb', $sameOrigin, $created, strlen($created));
check('eigener Origin ist erlaubt', $response['status'] === 201);

$response = $api->dispatch(
    'DELETE',
    '/api/ltb',
    $sameOrigin,
    '{"number":4242,"occurrence":9}',
    30
);
check('unbekannte Occurrence beim Loeschen ist 404', $response['status'] === 404);

$response = $api->dispatch('GET', '/api/gibt-es-nicht', $admin, '', 0);
check('unbekannte API-Route ist 404', $response['status'] === 404);
$response = $api->dispatch('GET', '/anders', [], '', 0);
check('Nicht-API-Pfad ist 404', $response['status'] === 404);

echo "Mehrere Benutzer\n";
$zoeLogin = '{"username":"zoe","password":"zoe-geheim"}';
$response = $api->dispatch(
    'POST',
    '/api/login',
    ['HTTP_HOST' => 'ltb.test', 'REMOTE_ADDR' => '10.0.0.2'],
    $zoeLogin,
    strlen($zoeLogin)
);
check('zweiter Benutzer kann sich anmelden', $response['status'] === 200);
preg_match('/auth=([a-f0-9]{64})/', (string) ($response['headers']['Set-Cookie'] ?? ''), $zoeMatch);
$zoe = [
    'HTTP_HOST' => 'ltb.test',
    'REMOTE_ADDR' => '10.0.0.2',
    'HTTP_COOKIE' => 'auth=' . ($zoeMatch[1] ?? ''),
];

$zoeCollection = $api->dispatch('GET', '/api/collection', $zoe, '', 0);
check('neuer Benutzer startet mit leerer Sammlung', count($zoeCollection['payload']['ltb']) === 0);
check('neuer Benutzer sieht keine Sonderserien', count($zoeCollection['payload']['specials']) === 0);

// Eine Nummer waehlen, die im Admin-Seed garantiert nicht vorkommt: der Test
// darf nicht davon abhaengen, welche Nummern der Seed zufaellig enthaelt.
$adminCollection = $api->dispatch('GET', '/api/collection', $admin, '', 0);
$freeNumber = 90000;
while (count(array_filter(
    $adminCollection['payload']['ltb'],
    static fn (array $row): bool => $row['number'] === $freeNumber
)) > 0) {
    $freeNumber++;
}
$zoeRow = json_encode(['items' => [['number' => $freeNumber, 'containedIn' => 'Zoe']]]);
$response = $api->dispatch('POST', '/api/ltb', $zoe, $zoeRow, strlen($zoeRow));
check('zweiter Benutzer kann anlegen', $response['status'] === 201);
$adminCollection = $api->dispatch('GET', '/api/collection', $admin, '', 0);
check(
    'Zeile des zweiten Benutzers bleibt aus der Admin-Sammlung',
    count(array_filter(
        $adminCollection['payload']['ltb'],
        static fn (array $row): bool => $row['number'] === $freeNumber
    )) === 0
);
$zoeCollection = $api->dispatch('GET', '/api/collection', $zoe, '', 0);
check('zweiter Benutzer sieht die eigene Zeile', count($zoeCollection['payload']['ltb']) === 1);

$foreignPatch = json_encode([
    'number' => $freeNumber,
    'occurrence' => 0,
    'containedIn' => 'Fremd',
]);
$response = $api->dispatch('PATCH', '/api/ltb', $admin, $foreignPatch, strlen($foreignPatch));
check('Admin kann fremde Zeile nicht aendern', $response['status'] === 404);
$foreignDelete = json_encode(['number' => $freeNumber, 'occurrence' => 0]);
$response = $api->dispatch('DELETE', '/api/ltb', $admin, $foreignDelete, strlen($foreignDelete));
check('Admin kann fremde Zeile nicht loeschen', $response['status'] === 404);
$zoeCollection = $api->dispatch('GET', '/api/collection', $zoe, '', 0);
check('fremde Schreibversuche lassen Zoes Zeile unveraendert',
    count($zoeCollection['payload']['ltb']) === 1
        && $zoeCollection['payload']['ltb'][0]['containedIn'] === 'Zoe');

$zoeSeries = '{"name":"Zoe-Reihe","numbers":[1]}';
$response = $api->dispatch('POST', '/api/series', $zoe, $zoeSeries, strlen($zoeSeries));
check('zweiter Benutzer kann eine Reihe anlegen', $response['status'] === 201);
check('Admin sieht die Reihe nicht', $store->findSeries('admin', 'Zoe-Reihe') === null);
check('Zoe sieht die Reihe', $store->findSeries('zoe', 'Zoe-Reihe') === 'Zoe-Reihe');

$zoeIsbn = json_encode(['isbn' => '9783770402205', 'number' => $freeNumber]);
$response = $api->dispatch('PUT', '/api/isbn', $zoe, $zoeIsbn, strlen($zoeIsbn));
check('ISBN-Zuordnung ist pro Benutzer', $response['status'] === 200
    && !isset($store->isbnMappings('admin')['9783770402205'])
    && ($store->isbnMappings('zoe')['9783770402205'] ?? null) === $freeNumber);

echo "Login-Sicherheit\n";
$wrong = '{"username":"admin","password":"falsch"}';
$response = $api->dispatch(
    'POST',
    '/api/login',
    ['HTTP_HOST' => 'ltb.test', 'REMOTE_ADDR' => '10.9.9.9'],
    $wrong,
    strlen($wrong)
);
check('falsches Passwort ist 401', $response['status'] === 401);
for ($attempt = 0; $attempt < 10; $attempt++) {
    $store->recordLoginFailure('10.9.9.9');
}
$response = $api->dispatch(
    'POST',
    '/api/login',
    ['HTTP_HOST' => 'ltb.test', 'REMOTE_ADDR' => '10.9.9.9'],
    $loginBody,
    strlen($loginBody)
);
check('zu viele Fehlversuche sind 429', $response['status'] === 429);

$response = $api->dispatch(
    'POST',
    '/api/logout',
    $admin,
    '',
    0
);
check('Logout ist 200', $response['status'] === 200);
check('Logout loescht das Cookie', str_contains((string) ($response['headers']['Set-Cookie'] ?? ''), 'Max-Age=0'));
$response = $api->dispatch('GET', '/api/collection', $admin, '', 0);
check('alte Session ist nach dem Logout ungueltig', $response['status'] === 401);

array_map('unlink', glob($workDir . '/*') ?: []);
rmdir($workDir);

echo "\n{$checks} Checks, {$failures} Fehler\n";
exit($failures === 0 ? 0 : 1);
