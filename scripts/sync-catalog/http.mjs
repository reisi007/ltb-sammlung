import {
  API_URL,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from "./constants.mjs";

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

export function apiUrl(parameters) {
  const url = new URL(API_URL);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export async function fetchJson(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const waitMs = 750 * 2 ** attempt;
        console.info(
          `${label}: Versuch ${attempt + 1} fehlgeschlagen (${errorMessage(error)}), ` +
            `neuer Versuch in ${waitMs} ms.`,
        );
        await sleep(waitMs);
      }
    }
  }

  throw new Error(`${label}: Abruf fehlgeschlagen (${errorMessage(lastError)}).`);
}

export async function urlExists(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": USER_AGENT },
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchHtml(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "text/html",
          "user-agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const waitMs = 750 * 2 ** attempt;
        console.info(
          `${label}: Versuch ${attempt + 1} fehlgeschlagen (${errorMessage(error)}), ` +
            `neuer Versuch in ${waitMs} ms.`,
        );
        await sleep(waitMs);
      }
    }
  }

  throw new Error(`${label}: ${errorMessage(lastError)}`);
}

/** Wie fetchHtml, aber 404 bedeutet "Reihe endet hier" statt Fehler. */
export async function fetchHtmlOrNull(url, label) {
  try {
    return await fetchHtml(url, label);
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 404")) {
      return null;
    }

    throw error;
  }
}
