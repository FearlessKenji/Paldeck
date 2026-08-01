// Starts the bot with isolated test credentials without redeploying its Discord commands.
const { activateTestEnvironment } = require(`./utils/testEnvironment.js`);

try {
	activateTestEnvironment();
} catch (err) {
	console.error(err.message);
	process.exit(78);
}

console.log(`Starting the test bot.`);
require(`./index.js`);
