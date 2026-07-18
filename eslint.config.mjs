import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['archive/**', 'dist/**', 'coverage/**', 'data/**', 'packages/**', 'examples/**/*.js', 'overlays/**/*.js', 'wizard/**/*.js', 'prototypes/**/*.js', 'eslint.config.mjs', 'tools/clean.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
