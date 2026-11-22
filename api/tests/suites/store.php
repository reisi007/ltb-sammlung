<?php

declare(strict_types=1);

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
