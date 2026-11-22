<?php

declare(strict_types=1);

/**
 * Tests der API ohne Framework: `php api/tests/run.php`.
 *
 * Deckt Seed, Duplikate, Occurrence-Semantik und die Eingabevalidierung ab.
 * Die Pruefungen liegen thematisch getrennt unter `api/tests/suites/`; diese
 * Datei ist der Einsprungpunkt, stellt Zaehler und Helfer bereit und fuehrt
 * alle Suites in fester Reihenfolge aus.
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

require __DIR__ . '/suites/catalog.php';
require __DIR__ . '/suites/store.php';
require __DIR__ . '/suites/migration.php';
require __DIR__ . '/suites/http.php';
require __DIR__ . '/suites/isbn.php';
require __DIR__ . '/suites/security.php';
require __DIR__ . '/suites/users.php';
require __DIR__ . '/suites/auth.php';

array_map('unlink', glob($workDir . '/*') ?: []);
rmdir($workDir);

echo "\n{$checks} Checks, {$failures} Fehler\n";
exit($failures === 0 ? 0 : 1);
