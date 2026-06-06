/** Desktop ESLint: block mobile / RN imports (run via npx eslint after adding eslint devDep or CI script). */
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/mobile/**', '../mobile/**', '../../mobile/**'],
              message: 'Do not import mobile (React Native) code into desktop.',
            },
            {
              group: ['react-native', 'react-native/*'],
              message: 'React Native is not allowed in desktop frontend.',
            },
          ],
        },
      ],
    },
  },
];
