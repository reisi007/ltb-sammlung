import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/ltb-sammlung/",
  plugins: [react(), lingui({ macroTransform: true }), tailwindcss()],
});
