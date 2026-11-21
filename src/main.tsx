import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@lingui/react";
import App from "./App";
import { detectLocale, i18n, loadCatalog } from "./i18n";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Das Root-Element #root wurde nicht gefunden.");
}

const initialLocale = detectLocale();

await loadCatalog(initialLocale);

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App initialLocale={initialLocale} />
    </I18nProvider>
  </StrictMode>,
);
