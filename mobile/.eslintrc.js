module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/frontend/**', '../frontend/**', '../../frontend/**'],
            message: 'Do not import desktop (frontend) code into mobile.',
          },
          {
            group: ['react-dom', 'react-dom/*', 'plotly.js*', 'electron', 'electron/*'],
            message: 'Desktop-only packages are not allowed in mobile.',
          },
        ],
      },
    ],
  },
};
