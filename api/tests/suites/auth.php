<?php

declare(strict_types=1);

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

echo "Logout-Origin\n";
// Eigener, frischer Token: der finale Logout-Test weiter unten benutzt $admin
// und muss von diesen Checks unberuehrt bleiben.
$logoutToken = bin2hex(random_bytes(32));
$store->createSession(hash('sha256', $logoutToken), 'admin', 3600);
$logoutSession = [
    'HTTP_HOST' => 'ltb.test',
    'REMOTE_ADDR' => '10.0.0.1',
    'HTTP_COOKIE' => 'auth=' . $logoutToken,
];
$foreignLogout = $logoutSession + ['HTTP_ORIGIN' => 'https://evil.test'];
$response = $api->dispatch('POST', '/api/logout', $foreignLogout, '', 0);
check('Logout mit fremdem Origin ist 403', $response['status'] === 403);
$response = $api->dispatch('GET', '/api/collection', $logoutSession, '', 0);
check('fremder Logout laesst die Session gueltig', $response['status'] === 200);
$sameOriginLogout = $logoutSession + ['HTTP_ORIGIN' => 'https://ltb.test'];
$response = $api->dispatch('POST', '/api/logout', $sameOriginLogout, '', 0);
check('Logout mit eigenem Origin ist 200', $response['status'] === 200);
$response = $api->dispatch('GET', '/api/collection', $logoutSession, '', 0);
check('eigener Logout beendet die Session', $response['status'] === 401);

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
