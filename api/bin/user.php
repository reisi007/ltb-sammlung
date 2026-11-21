#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Benutzerverwaltung der LTB-API.
 *
 *   php api/bin/user.php list
 *   LTB_NEW_PASSWORD=… php api/bin/user.php add <name>
 *   LTB_NEW_PASSWORD=… php api/bin/user.php passwd <name>
 *   php api/bin/user.php delete <name>
 *
 * Im Container: docker exec -i ltb-php php /srv/api/bin/user.php add <name>
 * (Passwort ohne LTB_NEW_PASSWORD ueber stdin, damit es nicht in der History
 * landet).
 */

require __DIR__ . '/../src/Validation.php';
require __DIR__ . '/../src/Store.php';

$databasePath = getenv('LTB_DB') ?: '/data/ltb.sqlite';
$seedPath = getenv('LTB_SEED') ?: '/srv/seed/collection.json';
$store = new Store($databasePath, $seedPath);
$command = $argv[1] ?? 'list';

function readPassword(): string
{
    $fromEnv = getenv('LTB_NEW_PASSWORD');

    if (is_string($fromEnv) && $fromEnv !== '') {
        return $fromEnv;
    }

    $line = fgets(STDIN);

    return $line === false ? '' : trim($line);
}

try {
    switch ($command) {
        case 'list':
            foreach ($store->users() as $user) {
                echo $user . PHP_EOL;
            }

            break;

        case 'add':
            $username = validate_username($argv[2] ?? '');
            $password = readPassword();

            if (strlen($password) < 8) {
                fwrite(STDERR, "Passwort muss mindestens 8 Zeichen haben.\n");
                exit(1);
            }

            if (!$store->createUser($username, password_hash($password, PASSWORD_DEFAULT))) {
                fwrite(STDERR, "Benutzer {$username} existiert bereits.\n");
                exit(1);
            }

            echo "Benutzer {$username} angelegt.\n";
            break;

        case 'passwd':
            $username = validate_username($argv[2] ?? '');
            $password = readPassword();

            if (strlen($password) < 8) {
                fwrite(STDERR, "Passwort muss mindestens 8 Zeichen haben.\n");
                exit(1);
            }

            if (!$store->setUserPassword($username, password_hash($password, PASSWORD_DEFAULT))) {
                fwrite(STDERR, "Benutzer {$username} nicht gefunden.\n");
                exit(1);
            }

            echo "Passwort fuer {$username} geaendert.\n";
            break;

        case 'delete':
            $username = validate_username($argv[2] ?? '');

            if (!$store->deleteUser($username)) {
                fwrite(STDERR, "Benutzer {$username} nicht gefunden.\n");
                exit(1);
            }

            echo "Benutzer {$username} geloescht (Sammlungsdaten bleiben erhalten).\n";
            break;

        default:
            fwrite(STDERR, "Unbekannter Befehl: {$command}\n");
            exit(2);
    }
} catch (ValidationError $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
