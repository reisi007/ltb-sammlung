<?php

declare(strict_types=1);

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
check(
    'Antwort enthaelt die CSP der JSON-API',
    ($response['headers']['Content-Security-Policy'] ?? '')
        === "default-src 'self'; img-src 'self' https: data:; script-src 'none'; style-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
);
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

