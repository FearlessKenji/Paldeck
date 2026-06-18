const { guildId } = require(`./config/configCheck.js`);
const { REST, Routes } = require(`discord.js`);

const token = process.env.TOKEN;
const clientId = process.env.clientId;
const rest = new REST().setToken(token);

(async () => {
	try {
		await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
		console.log(`Successfully deleted all guild commands.`);

		await rest.put(Routes.applicationCommands(clientId), { body: [] });
		console.log(`Successfully deleted all application commands.`);
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
})();
