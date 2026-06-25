import globals from "globals";

/**
 * Flat ESLint config. The app source in `src/` is authored as classic browser
 * scripts (IIFEs attaching to a global `MTT` namespace, also exporting via
 * `module.exports` for the test runner), so it gets both browser and node
 * globals. Tests and tooling are ESM running under Node + Vitest.
 */
export default [
  {
    ignores: ["node_modules/**", "coverage/**", "**/*.min.js"],
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "writable",
        globalThis: "readonly",
        MTT: "writable",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      "no-var": "error",
      "prefer-const": "warn",
      eqeqeq: ["warn", "smart"],
    },
  },
  {
    files: ["test/**/*.js", "scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
    },
  },
];
