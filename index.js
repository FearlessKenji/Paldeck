const { Client, Collection, GatewayIntentBits, ActivityType, Events } = require(`discord.js`);
const { initCrashHandlers, startLogCleanup, stopLogCleanup, warn, info, error } = require(`./utils/writeLog.js`);
const { CronJob } = require(`cron`);
const path = require(`node:path`);
const fs = require(`node:fs`);
const { loadCommandCollection } = require(`./utils/commandLoader.js`);
const { dbInit } = require(`./database/dbInit.js`);

initCrashHandlers();
startLogCleanup({ runImmediately: true });
require(`./config/configCheck.js`);

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, `commands`);
loadCommandCollection(client.commands, foldersPath, { warn });

// Event handler
const eventsPath = path.join(__dirname, `events`);
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(`.js`));

async function executeEvent(event, args) {
	try {
		await event.execute(...args);
	} catch (err) {
		error(`There was an error while running the ${event.name} event.`, err);
	}
}

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => executeEvent(event, args));
	} else {
		client.on(event.name, (...args) => executeEvent(event, args));
	}
}

function setStatus() {
	if (!client.user) {
		return;
	}

	client.user.setActivity({
		type: ActivityType.Playing,
		name: `with pals in ${client.guilds.cache.size} servers`,
	});
}

const updateStatus = new CronJob(`*/10 * * * *`, setStatus);

client.once(Events.ClientReady, () => {
	setStatus();
	updateStatus.start();
});

let shuttingDown = false;

function shutdown() {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	info(`Stopping bot...`);
	updateStatus.stop();
	stopLogCleanup();
	client.destroy();
	process.exit(0);
}

async function start() {
	try {
		await dbInit();
		await client.login(process.env.TOKEN);
	} catch (err) {
		error(`Failed to start Paldeck.`, err);
		updateStatus.stop();
		stopLogCleanup();
		client.destroy();
		process.exit(1);
	}
}

start();

process.on(`SIGINT`, shutdown);
process.on(`SIGTERM`, shutdown);
process.on(`SIGUSR2`, shutdown);
