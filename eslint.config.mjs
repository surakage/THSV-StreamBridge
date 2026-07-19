import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['archive/**', 'dist/**', 'coverage/**', 'data/**', 'packages/**', 'playwright-report/**', 'test-results/**', 'examples/**/*.js', 'overlays/**/*.js', 'wizard/**/*.js', 'prototypes/**/*.js', 'eslint.config.mjs', 'tools/clean.mjs', 'tools/run-browser-test-server.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['installer/*.mjs', 'launcher/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['installer/**/*.mjs', 'launcher/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { AbortSignal: 'readonly', fetch: 'readonly', process: 'readonly', setTimeout: 'readonly' },
    },
  },
);
