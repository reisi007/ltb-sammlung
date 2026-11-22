<?php

declare(strict_types=1);

/**
 * Routentabelle der JSON-API.
 *
 * Oeffentliche Auth-Routen stehen vor der Session-Pruefung; alle anderen
 * Routen brauchen ein gueltiges Cookie. Schreibende Routen pruefen zusaetzlich
 * den Origin.
 */
trait ApiRoutes
{
    /**
     * @param array<string, mixed> $server
     * @return array{status: int, payload: array<string, mixed>, headers: array<string, string>}
     */
    private function route(
        string $method,
        string $path,
        array $server,
        string $rawBody,
        int $contentLength
    ): array {
        if ($path === '/api/health') {
            return self::response(200, ['status' => 'ok']);
        }

        if (!str_starts_with($path, '/api/')) {
            throw new ValidationError(404, 'Unbekannte Route.');
        }

        // Oeffentliche Auth-Routen. /api/login|me|logout bleiben als Alias,
        // damit die vorhandene Login-Seite unveraendert funktioniert.
        if (($path === '/api/login' || $path === '/api/auth/login') && $method === 'POST') {
            return $this->login($server, $rawBody, $contentLength);
        }

        if (($path === '/api/me' || $path === '/api/auth/me') && $method === 'GET') {
            $user = $this->currentUser($server);

            return self::response(200, ['user' => $user]);
        }

        if ($path === '/api/auth/check' && $method === 'GET') {
            $user = $this->currentUser($server);

            return self::response(200, ['ok' => true, 'user' => $user]);
        }

        if (($path === '/api/logout' || $path === '/api/auth/logout') && $method === 'POST') {
            return $this->logout($server);
        }

        $user = $this->currentUser($server);

        if ($path === '/api/collection' && $method === 'GET') {
            $collection = $this->store->collection($user);
            $collection['meta']['user'] = $user;

            return self::response(200, $collection);
        }

        if ($path === '/api/lookup' && $method === 'GET') {
            $isbn = validate_isbn_query(self::queryParameter($server, 'isbn'));
            // Zuerst die gelernte Zuordnung des Benutzers, dann der Katalog.
            $number = $this->store->isbnMappings($user)[$isbn]
                ?? $this->catalogNumber($isbn);

            if ($number === null) {
                throw new ValidationError(
                    404,
                    'Diese ISBN ist keinem Band zugeordnet.'
                );
            }

            return self::response(200, ['isbn' => $isbn, 'number' => $number]);
        }

        if ($path === '/api/ltb' && $method === 'POST') {
            self::assertSameOrigin($server);
            $items = validate_add_body(self::readJsonBody($rawBody, $contentLength));
            $created = $this->store->addLtbRows($user, $items);

            return self::response(201, ['created' => count($created), 'rows' => $created]);
        }

        if ($path === '/api/ltb' && $method === 'PATCH') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $reference = validate_row_reference($body);
            $item = validate_item(
                ['number' => $reference['number'], 'containedIn' => $body['containedIn'] ?? null],
                0
            );

            if (!$this->store->updateLtbRow(
                $user,
                $reference['number'],
                $reference['occurrence'],
                $item['containedIn']
            )) {
                throw new ValidationError(404, 'Zeile nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/series' && $method === 'POST') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $name = validate_series_name($body['name'] ?? null);
            // Erst validieren, dann schreiben: ein 422 darf keine leere Reihe
            // hinterlassen.
            $numbers = array_key_exists('numbers', $body)
                ? validate_series_numbers($body['numbers'])
                : null;
            $name = $this->store->createSeries($user, $name);
            $added = 0;
            $skipped = 0;

            if ($numbers !== null) {
                $result = $this->store->addSeriesNumbers($user, $name, $numbers);
                $added = $result['added'];
                $skipped = $result['skipped'];
            }

            return self::response(201, [
                'name' => $name,
                'added' => $added,
                'skipped' => $skipped,
            ]);
        }

        if ($path === '/api/series/volume' && $method === 'POST') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $series = $this->store->findSeries(
                $user,
                validate_series_name($body['series'] ?? null)
            );

            if ($series === null) {
                throw new ValidationError(404, 'Sonderserie nicht gefunden.');
            }

            $result = $this->store->addSeriesNumbers(
                $user,
                $series,
                validate_series_numbers($body['numbers'] ?? null)
            );

            return self::response(201, [
                'series' => $series,
                'added' => $result['added'],
                'skipped' => $result['skipped'],
            ]);
        }

        if ($path === '/api/series/volume' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $series = $this->store->findSeries(
                $user,
                validate_series_name($body['series'] ?? null)
            );

            if ($series === null) {
                throw new ValidationError(404, 'Sonderserie nicht gefunden.');
            }

            $numbers = validate_series_numbers([$body['number'] ?? null]);

            if (!$this->store->removeSeriesNumber($user, $series, $numbers[0])) {
                throw new ValidationError(404, 'Band nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/isbn' && $method === 'PUT') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);
            $isbn = validate_isbn($body['isbn'] ?? null);
            $number = validate_item(['number' => $body['number'] ?? null], 0)['number'];
            $this->store->rememberIsbn($user, $isbn, $number);

            return self::response(200, [
                'ok' => true,
                'isbn' => $isbn,
                'number' => $number,
            ]);
        }

        if ($path === '/api/isbn' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $body = self::readJsonBody($rawBody, $contentLength);

            if (!$this->store->forgetIsbn($user, validate_isbn($body['isbn'] ?? null))) {
                throw new ValidationError(404, 'ISBN nicht zugeordnet.');
            }

            return self::response(200, ['ok' => true]);
        }

        if ($path === '/api/ltb' && $method === 'DELETE') {
            self::assertSameOrigin($server);
            $reference = validate_row_reference(
                self::readJsonBody($rawBody, $contentLength)
            );

            if (!$this->store->removeLtbRow(
                $user,
                $reference['number'],
                $reference['occurrence']
            )) {
                throw new ValidationError(404, 'Zeile nicht gefunden.');
            }

            return self::response(200, ['ok' => true]);
        }

        throw new ValidationError(404, 'Unbekannte Route.');
    }
}
