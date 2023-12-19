/* eslint-env node */
module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2024: true,
  },
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
    // '@typescript-eslint/no-unused-vars': [
    //   'warn', // or "error"
    //   {
    //     argsIgnorePattern: '^_',
    //     varsIgnorePattern: '^_',
    //     caughtErrorsIgnorePattern: '^_',
    //   },
    // ],
  },
};
