const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);

// Kept local to database encryption so database-only scripts do not need to
// load the broader secret-management module.
function parseDotEnvContent(content) {
	const values = {};
	const lines = String(content || ``).split(/\r?\n/u);

	for (const line of lines) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith(`#`)) {
			continue;
		}

		const equalsIndex = trimmed.indexOf(`=`);

		if (equalsIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, equalsIndex).trim();
		let value = trimmed.slice(equalsIndex + 1).trim();

		if (value.startsWith(`"`) && value.endsWith(`"`)) {
			try {
				value = JSON.parse(value);
			} catch {
				value = value.slice(1, -1);
			}
		} else if (value.startsWith(`'`) && value.endsWith(`'`)) {
			value = value.slice(1, -1);
		}

		values[key] = value;
	}

	return values;
}

// Historical preparation labels remain accepted while HachiGen migrates an
// older environment into the current encrypted runtime state.
function isDatabaseProtectionEnabled(value) {
	return [`1`, `on`, `true`, `yes`, `prepared`, `key-ready`, `encrypted`, `runtime`, `active`]
		.includes(String(value || ``).trim().toLowerCase());
}

function isEncryptedDatabaseRuntimeEnabled(value) {
	return [`encrypted`, `runtime`, `active`].includes(String(value || ``).trim().toLowerCase());
}

function resolveKeyFilePath(value, cwd = process.cwd()) {
	const raw = String(value || ``).trim();

	if (!raw) {
		return ``;
	}

	if (raw === `~`) {
		return process.env.HOME || process.env.USERPROFILE || os.homedir() || raw;
	}

	if (raw.startsWith(`~/`) || raw.startsWith(`~\\`)) {
		return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir() || `.`, raw.slice(2));
	}

	return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

// File pointers keep raw database keys out of .env while direct values remain
// supported for isolated child processes and compatible existing installs.
function readDatabaseKeyFromEnv(env = process.env, cwd = process.cwd()) {
	const directKey = String(env.PALDECK_DB_KEY || ``).trim();

	if (directKey) {
		return {
			key: directKey,
			source: `direct`,
		};
	}

	const keyFilePath = resolveKeyFilePath(env.PALDECK_DB_KEY_FILE, cwd);

	if (!keyFilePath) {
		return {
			key: ``,
			source: `none`,
		};
	}

	return {
		key: fs.readFileSync(keyFilePath, `utf8`).trim(),
		keyFilePath,
		source: `file`,
	};
}

function readDatabaseKeyFromEnvFile(envPath = path.resolve(`.env`), baseEnv = process.env, cwd = process.cwd()) {
	const parsedEnv = fs.existsSync(envPath) ? parseDotEnvContent(fs.readFileSync(envPath, `utf8`)) : {};
	return readDatabaseKeyFromEnv({
		...parsedEnv,
		// Explicit process values let HachiGen isolate a testing key from the
		// production repository environment for one child process.
		...baseEnv,
	}, cwd);
}

module.exports = {
	isDatabaseProtectionEnabled,
	isEncryptedDatabaseRuntimeEnabled,
	parseDotEnvContent,
	readDatabaseKeyFromEnv,
	readDatabaseKeyFromEnvFile,
	resolveKeyFilePath,
};
