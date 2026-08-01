// Registers commands to the isolated test guild using only the dedicated test application credentials.
const { activateTestEnvironment } = require(`./utils/testEnvironment.js`);

try {
	activateTestEnvironment();
} catch (err) {
	console.error(err.message);
	process.exit(78);
}

const { guildId } = require(`./config/configCheck.js`);
const { REST, Routes } = require(`discord.js`);
const path = require(`node:path`);
const { loadCommandData } = require(`./utils/commandLoader.js`);

const token = process.env.TOKEN;
const clientId = process.env.clientId;
const requestedNames = [...new Set(process.argv.slice(2).map(name => name.trim().toLowerCase()).filter(Boolean))];
const deployAll = !requestedNames.length || (requestedNames.length === 1 && requestedNames[0] === `--all`);
const guildCommandsPath = path.join(__dirname, `commands`, `guildCommands`);
const globalCommandsPath = path.join(__dirname, `commands`, `globalCommands`);
const guildCommands = loadCommandData(guildCommandsPath, { warn: console.warn });
const globalCommands = loadCommandData(globalCommandsPath, { serverOnly: true, warn: console.warn });
const globalCommandsByName = new Map(globalCommands.map(command => [command.name, command]));

{
	const selectedNames = deployAll ? [...globalCommandsByName.keys()] : requestedNames;
	const unknownNames = selectedNames.filter(name => !globalCommandsByName.has(name));
	const guildNames = new Set(guildCommands.map(command => command.name));
	const conflictingNames = selectedNames.filter(name => guildNames.has(name));

	if (unknownNames.length) {
		console.error(`Unknown global command(s): ${unknownNames.join(`, `)}`);
		process.exitCode = 64;
	} else if (conflictingNames.length) {
		console.error(`Command name(s) already exist as guild commands: ${conflictingNames.join(`, `)}`);
		process.exitCode = 64;
	} else {
		const selectedGlobalCommands = selectedNames.map(name => globalCommandsByName.get(name));
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
				if (!deployAll) {
					console.log(`Run npm run deploy:test to replace the focused selection with the complete test command set.`);
				}
			} catch (err) {
				console.error(err);
				process.exitCode = 1;
			}
		})();
	}
}
