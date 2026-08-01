// Maps required test credentials onto the standard runtime variables without exposing production secrets.
const path = require(`node:path`);
const dotenv = require(`dotenv`);

function activateTestEnvironment() {
	dotenv.config({ path: path.join(__dirname, `..`, `.env`), quiet: true });

	const missing = [`testTOKEN`, `testID`].filter(key => !process.env[key]?.trim());

	if (missing.length) {
		throw new Error(`.env is missing required test fields: ${missing.join(`, `)}`);
	}

	// Keep test entry points isolated even when production credentials are also loaded.
	process.env.TOKEN = process.env.testTOKEN;
	process.env.clientId = process.env.testID;
	process.env.PALDECK_TEST_MODE = `true`;
}

module.exports = {
	activateTestEnvironment,
};
