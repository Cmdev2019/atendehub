// B-103 (L-14 / B-47): lint do frontend. Antes, o JS/JSX do produto passava
// sem nenhuma verificação estática (a API já tinha o seu, em apps/api).
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'coverage/**', 'apps/**', 'node_modules/**', 'docs/**', 'scripts/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Componentes usam createElement (h) — sem JSX transform, sem prop-types
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // console.log ia para o navegador do cliente em produção (B-47)
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/setupTests.js', '**/__mocks__/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.jest, ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];
