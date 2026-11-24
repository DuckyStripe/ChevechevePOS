import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.expo/**', 'ios/**', 'android/**', 'dist/**', 'node_modules/**', 'plugins/**', 'expo-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'no-console': 'error',
      'no-eval': 'error',
    },
  },
  reactHooks.configs.flat['recommended-latest'],
  // La regla del compilador de React solo avisa de memoizaciones manuales; aquí no se usa el compilador.
  { rules: { 'react-hooks/preserve-manual-memoization': 'off' } },
  // `process` llega como any (tipos de react-native y de Node a la vez) en la configuración de compilación.
  {
    files: ['app.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  { files: ['eslint.config.mjs'], ...tseslint.configs.disableTypeChecked },
);
