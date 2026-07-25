const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Deliberately left off: entity.service.ts still has ~55 `any` usages on
      // methods handling a parish/school/seminary union shape that need a real
      // discriminated-union design, not a mechanical fix — see CLAUDE.md/plan
      // notes. Turning this on now would flag all of them as new lint errors.
      '@typescript-eslint/no-explicit-any': 'off',
      // This codebase already uses a leading underscore to mark intentionally
      // unused destructured values/params (e.g. `_m`, `_id`) — recognize that
      // convention instead of flagging it.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
