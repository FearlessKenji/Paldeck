const { guildId } = require(`./config/configCheck.js`);
const { REST, Routes } = require(`discord.js`);
const path = require(`node:path`);
const { loadCommandData } = require(`./utils/commandLoader.js`);

const token = process.env.TOKEN;
const clientId = process.env.clientId;
const commandsPath = path.join(__dirname, `commands`, `guildCommands`);
const commands = loadCommandData(commandsPath, { warn: console.warn });
const rest = new REST().setToken(token);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} guild application (/) commands.`);

		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} guild application (/) commands.`);
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
})();
