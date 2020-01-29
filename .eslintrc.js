module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
        'prettier/@typescript-eslint'
    ],
    rules: {
        'lines-between-class-members': ['error', 'always'],
        '@typescript-eslint/no-explicit-any': [0],
        '@typescript-eslint/ban-ts-ignore': [0],
        '@typescript-eslint/no-use-before-define': [0],
        'tsdoc/syntax': 'warn'
    }
};
