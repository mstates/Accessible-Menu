import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier/flat";

const noItalics = (fix) => `No italics on diner pages (D-39). ${fix}`;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Rules only. eslint-config-next already registers the jsx-a11y plugin,
    // and registering the same plugin twice is an error.
    files: ["**/*.tsx"],
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: ["src/copy/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='em'], JSXOpeningElement[name.name='i']",
          message: noItalics(
            "Use <strong> for allergen words and plain text everywhere else.",
          ),
        },
        {
          selector: "Literal[value=/(^|\\s)italic(\\s|$)/]",
          message: noItalics("Remove the italic utility class."),
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s)italic(\\s|$)/]",
          message: noItalics("Remove the italic utility class."),
        },
        {
          selector:
            "Property[key.name='fontStyle'], Property[key.value='font-style']",
          message: noItalics("Do not set a font style."),
        },
      ],
    },
  },
  {
    // Module rule 6: user-facing strings live in src/copy. Components hold
    // no literal copy. Punctuation and digits are allowed as JSX text.
    files: ["app/**/*.tsx", "src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          allowedStrings: [
            ".",
            ",",
            ":",
            ";",
            "!",
            "?",
            "(",
            ")",
            "/",
            "|",
            "&",
            "-",
            "·",
            "*",
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    ".next-local/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
