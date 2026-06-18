const { spawnSync } = require(`node:child_process`);
const path = require(`node:path`);

process.env.ESLINT_USE_FLAT_CONFIG = `true`;

const eslintRoot = path.dirname(require.resolve(`eslint/package.json`));
const eslintBin = path.join(eslintRoot, `bin`, `eslint.js`);
const result = spawnSync(
	process.execPath,
	[eslintBin, `--config`, `./config/eslint.config.js`, `.`],
	{ stdio: `inherit` },
);

process.exit(result.status ?? 1);
