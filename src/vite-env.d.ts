/// <reference types="vite/client" />

declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}

/** Wird in vite.config.ts aus der package.json gesetzt. */
declare const __APP_VERSION__: string;
