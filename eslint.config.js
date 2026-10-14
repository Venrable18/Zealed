import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Privacy rule: app code must never log. Secrets, amounts, addresses and memo
      // contents must not end up in a console that extensions or screen shares can read.
      'no-console': 'error',
    },
  },
  {
    // Tooling and tests run outside the shipped app and may log.
    files: ['*.config.ts', 'tests/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Test fixtures index arrays they just built; `!` there is clearer than a runtime check.
    files: ['tests/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
])
