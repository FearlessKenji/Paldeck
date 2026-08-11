const js = require(`@eslint/js`);

module.exports = [
	js.configs.recommended,

	{
		languageOptions: {
			ecmaVersion: `latest`,
			sourceType: `commonjs`,

			globals: {
				clearInterval: `readonly`,
				clearTimeout: `readonly`,
				console: `readonly`,
				fetch: `readonly`,
				module: `readonly`,
				process: `readonly`,
				require: `readonly`,
				setInterval: `readonly`,
				setTimeout: `readonly`,
				__dirname: `readonly`,
			},
		},

		rules: {
			// Rules
			'complexity': [`warn`, 15],
			'default-case': `warn`,
			'eqeqeq': [`error`, `always`],
			'no-async-promise-executor': `error`,
			'no-duplicate-imports': `error`,
			'no-else-return': `error`,
			'no-empty-function': `error`,
			'no-eval': `error`,
			'no-implicit-globals': `error`,
			'no-implied-eval': `error`,
			'no-lonely-if': `error`,
			'no-param-reassign': `error`,
			'no-promise-executor-return': `error`,
			'no-return-await': `error`,
			'no-undef': `error`,
			'no-unneeded-ternary': `error`,
			'no-unused-vars': [`error`, { argsIgnorePattern: `^_`, caughtErrorsIgnorePattern: `^_` }],
			'no-useless-catch': `error`,
			'no-useless-return': `error`,
			'no-var': `error`,
			'no-warning-comments': [`warn`, { terms: [`TODO`, `FIXME`, `HACK`], location: `anywhere` }],
			'prefer-const': `error`,
			'require-atomic-updates': `error`,

			// Debugging control
			'no-console': `off`,
			'no-shadow': [`error`, { allow: [`err`, `resolve`, `reject`] }],

			// Style
			'arrow-spacing': [`error`, { before: true, after: true }],
			'brace-style': [`error`, `1tbs`, { allowSingleLine: true }],
			'comma-dangle': [`error`, `always-multiline`],
			'comma-spacing': [`error`, { before: false, after: true }],
			'comma-style': [`error`, `last`],
			'curly': [`error`, `all`],
			'dot-location': [`error`, `property`],
			'indent': [`error`, `tab`],
			'keyword-spacing': [`error`],
			'linebreak-style': [`error`, `unix`],
			'max-depth': [`warn`, 4],
			// Long prose and URLs cannot be wrapped without changing their runtime value; enforce width on code structure.
			'max-len': [`warn`, {
				code: 140,
				ignoreComments: true,
				ignoreStrings: true,
				ignoreTemplateLiterals: true,
				ignoreUrls: true,
			}],
			'max-lines': [`warn`, { max: 600, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': [`warn`, { max: 100, skipBlankLines: true, skipComments: true }],
			'max-nested-callbacks': [`warn`, 3],
			'max-params': [`warn`, 4],
			'max-statements': [`warn`, 40],
			'max-statements-per-line': [`error`, { max: 1 }],
			'multiline-ternary': [`error`, `always-multiline`],
			'no-multi-spaces': `error`,
			'no-multiple-empty-lines': [`error`, { max: 1, maxEOF: 0 }],
			'no-trailing-spaces': `error`,
			'object-curly-spacing': [`error`, `always`],
			'operator-linebreak': [`error`, `after`],
			'quotes': [`error`, `backtick`, { avoidEscape: true }],
			'semi': [`error`, `always`],
			'space-before-blocks': `error`,
			'space-before-function-paren': [
				`error`,
				{
					anonymous: `never`,
					named: `never`,
					asyncArrow: `always`,
				},
			],

			'space-in-parens': [`error`, `never`],
			'space-infix-ops': `error`,
			'spaced-comment': [`error`, `always`],
			'template-curly-spacing': [`error`, `never`],
			'yoda': `error`,

		},
	},
];
