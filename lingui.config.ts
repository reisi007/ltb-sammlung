const config = {
  sourceLocale: "de",
  locales: ["de", "en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
  compileNamespace: "es",
};

export default config;
