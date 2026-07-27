const { guildId } = require(`./config/configCheck.js`);
const { REST, Routes } = require(`discord.js`);
const path = require(`node:path`);
const { loadCommandData } = require(`./utils/commandLoader.js`);

const token = process.env.TOKEN;
const clientId = process.env.clientId;
const requestedNames = [...new Set(process.argv.slice(2).map(name => name.trim().toLowerCase()).filter(Boolean))];
const guildCommandsPath = path.join(__dirname, `commands`, `guildCommands`);
const globalCommandsPath = path.join(__dirname, `commands`, `globalCommands`);
const guildCommands = loadCommandData(guildCommandsPath, { warn: console.warn });
const globalCommands = loadCommandData(globalCommandsPath, { warn: console.warn });
const globalCommandsByName = new Map(globalCommands.map(command => [command.name, command]));

if (!requestedNames.length) {
	console.error(`Choose at least one global command to test. Example: npm run deploy:test -- item`);
	process.exitCode = 64;
} else {
	const unknownNames = requestedNames.filter(name => !globalCommandsByName.has(name));
	const guildNames = new Set(guildCommands.map(command => command.name));
	const conflictingNames = requestedNames.filter(name => guildNames.has(name));

	if (unknownNames.length) {
		console.error(`Unknown global command(s): ${unknownNames.join(`, `)}`);
		process.exitCode = 64;
	} else if (conflictingNames.length) {
		console.error(`Command name(s) already exist as guild commands: ${conflictingNames.join(`, `)}`);
		process.exitCode = 64;
	} else {
		const selectedGlobalCommands = requestedNames.map(name => globalCommandsByName.get(name));
		const commands = [...guildCommands, ...selectedGlobalCommands];
		const rest = new REST().setToken(token);

		(async () => {
			try {
				console.log(`Registering ${guildCommands.length} guild command(s) and ${selectedGlobalCommands.length} test global command(s) in guild ${guildId}.`);

				const data = await rest.put(
					Routes.applicationGuildCommands(clientId, guildId),
					{ body: commands },
				);

				console.log(`Successfully registered ${data.length} guild-scoped application command(s).`);
				console.log(`Run npm run deploy:guild after testing to remove the temporary global-command copies.`);
			} catch (err) {
				console.error(err);
				process.exitCode = 1;
			}
		})();
	}
}
