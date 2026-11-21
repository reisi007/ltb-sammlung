<?php

declare(strict_types=1);

/**
 * Eingabevalidierung der API. Bewusst ohne Seiteneffekte, damit sie direkt
 * getestet werden kann (siehe api/tests/run.php).
 */

final class ValidationError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

const MAX_ADD_ITEMS = 3;
const MAX_NOTE_LENGTH = 200;

/** @return array{number: int, containedIn: ?string} */
function validate_item(mixed $item, int $index): array
{
    if (!is_array($item)) {
        throw new ValidationError(422, "Eintrag {$index} ist kein Objekt.");
    }

    $number = $item['number'] ?? null;

    if (is_string($number) && preg_match('/^\d{1,5}$/', $number) === 1) {
        $number = (int) $number;
    }

    if (!is_int($number) || $number < 1 || $number > 99999) {
        throw new ValidationError(
            422,
            "Eintrag {$index}: number muss eine ganze Zahl zwischen 1 und 99999 sein."
        );
    }

    $note = $item['containedIn'] ?? null;

    if ($note !== null && !is_string($note)) {
        throw new ValidationError(422, "Eintrag {$index}: containedIn muss Text oder null sein.");
    }

    if (is_string($note)) {
        $note = trim($note);

        if (mb_strlen($note) > MAX_NOTE_LENGTH) {
            throw new ValidationError(
                422,
                "Eintrag {$index}: containedIn ist länger als " . MAX_NOTE_LENGTH . ' Zeichen.'
            );
        }

        if ($note === '') {
            $note = null;
        }
    }

    return ['number' => $number, 'containedIn' => $note];
}

/** @return list<array{number: int, containedIn: ?string}> */
function validate_add_body(array $body): array
{
    $items = $body['items'] ?? null;

    if ($items === null && array_key_exists('number', $body)) {
        $items = [$body];
    }

    if (!is_array($items) || !array_is_list($items)) {
        throw new ValidationError(422, 'items muss eine Liste sein.');
    }

    if (count($items) < 1 || count($items) > MAX_ADD_ITEMS) {
        throw new ValidationError(
            422,
            'Es können 1 bis ' . MAX_ADD_ITEMS . ' Bände pro Vorgang angelegt werden.'
        );
    }

    $validated = [];

    foreach ($items as $index => $item) {
        $validated[] = validate_item($item, $index);
    }

    return $validated;
}

/** @return array{number: int, occurrence: int} */
function validate_row_reference(array $body): array
{
    $number = $body['number'] ?? null;
    $occurrence = $body['occurrence'] ?? 0;

    if (!is_int($number) || $number < 1 || $number > 99999) {
        throw new ValidationError(422, 'number muss eine ganze Zahl zwischen 1 und 99999 sein.');
    }

    if (!is_int($occurrence) || $occurrence < 0) {
        throw new ValidationError(422, 'occurrence muss eine ganze Zahl >= 0 sein.');
    }

    return ['number' => $number, 'occurrence' => $occurrence];
}

function validate_series_name(mixed $name): string
{
    if (!is_string($name)) {
        throw new ValidationError(422, 'name muss Text sein.');
    }

    $normalized = trim(preg_replace('/\s+/u', ' ', $name) ?? '');

    if ($normalized === '') {
        throw new ValidationError(422, 'name darf nicht leer sein.');
    }

    if (mb_strlen($normalized) > 60) {
        throw new ValidationError(422, 'name ist länger als 60 Zeichen.');
    }

    if (preg_match('/[\x00-\x1F\x7F]/u', $normalized) === 1) {
        throw new ValidationError(422, 'name enthält Steuerzeichen.');
    }

    return $normalized;
}

/** @return list<int> */
function validate_series_numbers(mixed $numbers): array
{
    if (!is_array($numbers) || !array_is_list($numbers)) {
        throw new ValidationError(422, 'numbers muss eine Liste sein.');
    }

    if (count($numbers) < 1 || count($numbers) > MAX_ADD_ITEMS) {
        throw new ValidationError(
            422,
            'Es können 1 bis ' . MAX_ADD_ITEMS . ' Bände pro Vorgang angelegt werden.'
        );
    }

    $validated = [];

    foreach ($numbers as $index => $number) {
        if (is_string($number) && preg_match('/^\d{1,5}$/', $number) === 1) {
            $number = (int) $number;
        }

        if (!is_int($number) || $number < 1 || $number > 99999) {
            throw new ValidationError(
                422,
                "numbers[{$index}] muss eine ganze Zahl zwischen 1 und 99999 sein."
            );
        }

        $validated[] = $number;
    }

    return $validated;
}
