<?php

declare(strict_types=1);

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

echo "Dummy-Hash und Origin-Schema\n";
$probeInfo = password_get_info(password_hash('probe', PASSWORD_DEFAULT));
$dummy = Api::dummyPasswordHash();
check(
    'Dummy-Hash hat dieselben Kosten wie echte Hashes',
    password_get_info($dummy)['options']['cost'] === $probeInfo['options']['cost']
);
check(
    'Dummy-Hash nutzt denselben Algorithmus wie echte Hashes',
    password_get_info($dummy)['algoName'] === $probeInfo['algoName']
);
check('Dummy-Hash verifiziert kein beliebiges Passwort', password_verify('beliebig', $dummy) === false);
check('wiederholte Aufrufe liefern denselben Dummy-Hash', Api::dummyPasswordHash() === $dummy);

// Regression zu #29: rohe random_bytes() enthalten mit ~12 % Wahrscheinlichkeit
// ein NUL-Byte, das bcrypt als ValueError ablehnt. Der Test schickt gezielt
// NUL-haltiges Material durch denselben Erzeuger wie der Produktionspfad;
// vor der Hex-Kodierung waere dieser Test deterministisch fehlgeschlagen.
$createDummyHash = new ReflectionMethod(Api::class, 'createDummyPasswordHash');
$nulSafe = true;
$generated = [];
foreach ([str_repeat("\0", 32), "\0a\0b", random_bytes(32), 'probe'] as $rawMaterial) {
    try {
        $candidate = $createDummyHash->invoke(null, $rawMaterial);
        if (!is_string($candidate) || $candidate === '') {
            $nulSafe = false;
            break;
        }
        $info = password_get_info($candidate);
        if (
            $info['algoName'] !== $probeInfo['algoName']
            || $info['options']['cost'] !== $probeInfo['options']['cost']
        ) {
            $nulSafe = false;
            break;
        }
        $generated[$candidate] = true;
    } catch (Throwable $e) {
        $nulSafe = false;
        break;
    }
}
check('Dummy-Hash bleibt bei NUL-Bytes im Zufall erzeugbar', $nulSafe);
check('unterschiedliches Zufallsmaterial ergibt unterschiedliche Hashes', count($generated) === 4);

$httpOrigin = $admin + ['HTTP_ORIGIN' => 'http://ltb.test'];
$response = $api->dispatch('POST', '/api/ltb', $httpOrigin, $created, strlen($created));
check('http-Origin ist ohne Dev-Schalter 403', $response['status'] === 403);

$noScheme = $admin + ['HTTP_ORIGIN' => '//ltb.test'];
$response = $api->dispatch('POST', '/api/ltb', $noScheme, $created, strlen($created));
check('Origin ohne Schema ist 403', $response['status'] === 403);

$caseOrigin = array_merge($admin, [
    'HTTP_ORIGIN' => 'https://LTB.TEST',
    'HTTP_HOST' => 'ltb.test:443',
]);
$response = $api->dispatch('POST', '/api/ltb', $caseOrigin, $created, strlen($created));
check('Origin ist case-insensitiv und ein Port am Host ist erlaubt', $response['status'] === 201);

$insecureBefore = getenv('LTB_INSECURE_COOKIES');
putenv('LTB_INSECURE_COOKIES=1');
$response = $api->dispatch('POST', '/api/ltb', $httpOrigin, $created, strlen($created));
check('http-Origin ist mit LTB_INSECURE_COOKIES erlaubt', $response['status'] === 201);
if ($insecureBefore === false) {
    putenv('LTB_INSECURE_COOKIES');
} else {
    putenv('LTB_INSECURE_COOKIES=' . $insecureBefore);
}
$response = $api->dispatch('POST', '/api/ltb', $httpOrigin, $created, strlen($created));
check('http-Origin ist nach dem Zurücksetzen wieder 403', $response['status'] === 403);

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
