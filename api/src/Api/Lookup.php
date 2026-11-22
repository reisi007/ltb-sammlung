<?php

declare(strict_types=1);

/**
 * Nachschlage-Helfer: Query-Parameter und der optionale Cover-Katalog.
 */
trait ApiLookup
{
    /**
     * Lädt den Katalog erst beim ersten Lookup. Fehlt die Datei, bleibt der
     * Index leer; die gelernten Zuordnungen funktionieren weiter.
     */
    private function catalogNumber(string $isbn): ?int
    {
        if ($this->catalog === null
            && $this->catalogPath !== null
            && is_file($this->catalogPath)) {
            $this->catalog = new Catalog($this->catalogPath);
        }

        return $this->catalog?->numberFor($isbn);
    }

    /**
     * Liest einen Query-Parameter aus `QUERY_STRING`. `dispatch()` bekommt den
     * Pfad ohne Query, deshalb kommt der Wert aus den Server-Parametern.
     *
     * @param array<string, mixed> $server
     */
    private static function queryParameter(array $server, string $name): ?string
    {
        $query = (string) ($server['QUERY_STRING'] ?? '');

        if ($query === '') {
            return null;
        }

        $parameters = [];
        parse_str($query, $parameters);
        $value = $parameters[$name] ?? null;

        return is_string($value) ? $value : null;
    }
}
