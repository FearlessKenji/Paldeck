// Require the necessary discord.js classes
const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');
const { writeLog } = require('./modules/writeLog.js');
const config = require('./config.json');
const { CronJob } = require('cron');
const path = require('node:path');
const fs = require('node:fs');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandDirectory = fs.readdirSync(foldersPath);

for (const commandFolder of commandDirectory) {
	const scopeFolders = path.join(foldersPath, commandFolder);
	const scopePath = fs.readdirSync(scopeFolders);
	for (const folder of scopePath) {
		const commandsPath = path.join(scopeFolders, folder);
		const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);
			const command = require(filePath);
			// Set a new item in the Collection with the key as the command name and the value as the exported module
			if ('data' in command && 'execute' in command) {
				client.commands.set(command.data.name, command);
			}
			else {
				console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
			}
		}
	}
}

// Event handler
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	}
	else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

const updateStatus = new CronJob('*/10 * * * *', async function () {
	client.user.setActivity({
		type: ActivityType.Custom,
		name: 'customstatus',
		state: `Catching pals in ${client.guilds.cache.size} servers.`, // Customize this to your desired status message
	});
});


// Catch errors
process.on('uncaughtException', function (err) {
	console.error(writeLog('Caught exception: ', err));
});

// Update status periodically
updateStatus.start();

// Log in to Discord with your client's token
client.login(config.token);