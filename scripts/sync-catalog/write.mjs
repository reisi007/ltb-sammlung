import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Schreibt den Katalog atomar über eine temporäre Datei. */
export async function writeCatalog(outputFile, catalog) {
  const temporaryFile = `${outputFile}.tmp`;

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(
    temporaryFile,
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryFile, outputFile);
}
