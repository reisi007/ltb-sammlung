<?php

declare(strict_types=1);

/**
 * Tests der API ohne Framework: `php api/tests/run.php`.
 *
 * Deckt Seed, Duplikate, Occurrence-Semantik und die Eingabevalidierung ab.
 */

require __DIR__ . '/../src/Validation.php';
require __DIR__ . '/../src/Store.php';

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

$databasePath = $workDir . '/ltb.sqlite';
$store = new Store($databasePath, $seedPath);

echo "Seed\n";
$collection = $store->collection();
check('seedet drei LTB-Zeilen', count($collection['ltb']) === 3);
check('behält doppelte Nummer 219', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 2);
check('behält die freie Notiz', $collection['ltb'][0]['containedIn'] === 'MM 4');
check('liefert Sonderserien getrennt', count($collection['specials']) === 2);
check('leere Sonderserie bleibt erhalten', $collection['specials'][1]['numbers'] === []);
check('Meta kommt aus dem Seed', $collection['meta']['sheetId'] === 'sheet-id');

echo "Hinzufügen\n";
$store->addLtbRows([
    ['number' => 900, 'containedIn' => null],
    ['number' => 219, 'containedIn' => 'Zweites Exemplar'],
]);
$collection = $store->collection();
check('drei Zeilen 219 nach dem Hinzufügen?', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 3);
check('unbekannte Nummer wird gespeichert', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 900
)) === 1);

echo "Occurrence-Semantik\n";
check('Notiz der zweiten Zeile 219 ändern', $store->updateLtbRow(219, 1, 'Notiz 2'));
$collection = $store->collection();
$rows219 = array_values(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
));
check('erste Zeile 219 unverändert', $rows219[0]['containedIn'] === 'MM 4');
check('zweite Zeile 219 aktualisiert', $rows219[1]['containedIn'] === 'Notiz 2');
check('unbekannte Occurrence liefert false', $store->updateLtbRow(219, 9, 'x') === false);
check('Löschen der dritten Zeile 219', $store->removeLtbRow(219, 2) === true);
$collection = $store->collection();
check('nach dem Löschen zwei Zeilen 219', count(array_filter(
    $collection['ltb'],
    static fn (array $row): bool => $row['number'] === 219
)) === 2);
check('Löschen einer unbekannten Occurrence liefert false', $store->removeLtbRow(219, 5) === false);

echo "Validierung\n";
$valid = validate_add_body(['items' => [
    ['number' => 12, 'containedIn' => '  Notiz  '],
    ['number' => '13'],
]]);
check('akzeptiert ein bis drei Einträge', count($valid) === 2);
check('trimmt die Notiz', $valid[0]['containedIn'] === 'Notiz');
check('leere Notiz wird null', $valid[1]['containedIn'] === null);
check('akzeptiert eine einzelne Zahl als Objekt', validate_add_body(['number' => 7])[0]['number'] === 7);

expect_validation_error('lehnt vier Einträge ab', 422, static fn () => validate_add_body([
    'items' => [['number' => 1], ['number' => 2], ['number' => 3], ['number' => 4]],
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

echo "Persistenz\n";
$second = new Store($databasePath, $seedPath);
check('zweiter Start seedet nicht erneut', count($second->collection()['ltb']) === 4);

array_map('unlink', glob($workDir . '/*') ?: []);
rmdir($workDir);

echo "\n{$checks} Checks, {$failures} Fehler\n";
exit($failures === 0 ? 0 : 1);
