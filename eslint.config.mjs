import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // next/core-web-vitals já registra o plugin jsx-a11y (subset). Aplicamos o
  // conjunto recomendado COMPLETO de regras sobre esse plugin (sem redefini-lo).
  { rules: jsxA11y.flatConfigs.recommended.rules },
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
