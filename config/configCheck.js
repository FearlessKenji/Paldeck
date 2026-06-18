const path = require(`node:path`);
const fs = require(`node:fs`);
const dotenv = require(`dotenv`);
const { info, error } = require(`../utils/writeLog.js`);

dotenv.config({ path: path.join(__dirname, `..`, `.env`), quiet: true });

const configPath = path.join(__dirname, `config.json`);
const CONFIG_EXIT_CODE = 78;

info(`Validating config files...`);

function fatal(message) {
	error(`[FATAL] ${message}`);
	process.exit(CONFIG_EXIT_CODE);
}

function isEmpty(value) {
	return (
		value === undefined ||
		value === null ||
		(typeof value === `string` && value.trim() === ``)
	);
}

const REQUIRED_ENV = [
	`TOKEN`,
	`clientId`,
];

const missingEnv = REQUIRED_ENV.filter(key => isEmpty(process.env[key]));

if (missingEnv.length) {
	fatal(
		`.env is missing required fields:\n` +
		missingEnv.map(k => `  - ${k}`).join(`\n`),
	);
}

if (!fs.existsSync(configPath)) {
	fatal(
		`Missing config.json\n` +
		`Copy config/blank.json to config/config.json and fill in required fields.`,
	);
}

let config;

try {
	config = JSON.parse(fs.readFileSync(configPath, `utf8`));
} catch (err) {
	fatal(
		`config.json is not valid JSON:\n` +
		err.message,
	);
}

const REQUIRED_CONFIG = [
	`botOwner`,
	`guildId`,
];

const missingConfig = REQUIRED_CONFIG.filter(key => isEmpty(config[key]));

if (missingConfig.length) {
	fatal(
		`config.json is invalid\n\nMissing required fields:\n` +
		missingConfig.map(k => `  - ${k}`).join(`\n`),
	);
}

info(`Configuration files validated.`);

module.exports = config;
