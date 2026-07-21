/* Configuration ESLint (format « flat », v9+).
   Lancement : npm run lint  */
export default [
  {
    files: ["app.js", "js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",          // scripts classiques, portée globale partagée
      globals: {
        window: "readonly", document: "readonly", localStorage: "readonly",
        navigator: "readonly", console: "readonly", firebase: "readonly",
        XLSX: "readonly", Blob: "readonly", URL: "readonly", FileReader: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", confirm: "readonly",
        btoa: "readonly", atob: "readonly", Uint8Array: "readonly",
        Store: "readonly", createCarousel: "readonly",
        mergeEntries: "readonly", mergeOverrides: "readonly", mergeDeleted: "readonly",
        mergeFavorites: "readonly", mergeActivity: "readonly",
        normalizeDeleted: "readonly", isDeletedIn: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],   // plus de catch muet
      "eqeqeq": ["warn", "smart"],
      "no-var": "error",
      "prefer-const": "warn",
      "max-lines-per-function": ["warn", { max: 60, skipComments: true }]
    }
  }
];
