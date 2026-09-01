import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/semi': 'off',
      'curly': 'warn',
      'eqeqeq': 'warn',
      'semi': 'off'
    }
  },
  {
    ignores: ['out/**', 'dist/**', '**/*.d.ts', 'node_modules/**']
  }
];
