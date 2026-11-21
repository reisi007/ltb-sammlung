<?php

declare(strict_types=1);

/**
 * ISBN-Index aus dem Katalog (src/data/catalog.json) für GET /api/lookup.
 *
 * Der Katalog ist eine optionale Datei (`LTB_CATALOG`). Fehlt sie, bleibt der
 * Index leer und die API antwortet nur anhand der gelernten Zuordnungen.
 *
 * Übernommen wird ausschließlich eine ISBN mit gültiger Prüfziffer. Nennt der
 * Katalog dieselbe ISBN für zwei verschiedene Nummern, wird sie verworfen
 * statt geraten. Kaputte oder fehlende Katalogdaten brechen die API nicht ab.
 */
final class Catalog
{
    /** @var array<string, int> ISBN-13 (normalisiert) => LTB-Nummer */
    private array $numbersByIsbn = [];

    public function __construct(string $path)
    {
        if (!is_file($path) || !is_readable($path)) {
            return;
        }

        $raw = file_get_contents($path);

        if ($raw === false) {
            error_log('ltb-api: Katalog nicht lesbar.');

            return;
        }

        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            error_log('ltb-api: Katalog ist kein gültiges JSON: ' . $error->getMessage());

            return;
        }

        $entries = is_array($data) && is_array($data['entries'] ?? null)
            ? $data['entries']
            : [];
        $conflicts = [];

        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $number = $entry['number'] ?? null;
            $isbn = $entry['isbn'] ?? null;

            if (!is_int($number) || $number < 1 || !is_string($isbn)) {
                continue;
            }

            try {
                $normalized = validate_isbn($isbn);
            } catch (ValidationError) {
                // Ungültige Prüfziffer im Katalog: ignorieren, nicht raten.
                continue;
            }

            if (isset($this->numbersByIsbn[$normalized])
                && $this->numbersByIsbn[$normalized] !== $number) {
                $conflicts[$normalized] = true;

                continue;
            }

            $this->numbersByIsbn[$normalized] = $number;
        }

        foreach (array_keys($conflicts) as $isbn) {
            unset($this->numbersByIsbn[$isbn]);
        }
    }

    /** Liefert die Katalog-Nummer zu einer normalisierten ISBN-13 oder null. */
    public function numberFor(string $isbn): ?int
    {
        return $this->numbersByIsbn[$isbn] ?? null;
    }
}
