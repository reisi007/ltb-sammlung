<?php

declare(strict_types=1);

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
