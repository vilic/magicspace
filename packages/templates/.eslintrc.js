module.exports = {
  extends: ['plugin:@magicspace/default', 'prettier'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@magicspace/scoped-modules': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
  },
};