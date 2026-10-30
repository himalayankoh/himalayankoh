import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'react/no-unescaped-entities': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'prefer-const': 'warn',
      'prefer-rest-params': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
    // next-env.d.ts is auto-generated and rewritten by Next.js itself on
    // every dev/build run — it's not meant to be hand-edited or linted.
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'dist/**', '.freebuff/**', 'scratch/**'],
  },
];

export default eslintConfig;
