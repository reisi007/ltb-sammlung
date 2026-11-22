<?php

declare(strict_types=1);

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
