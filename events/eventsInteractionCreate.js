// Routes Discord interactions while treating expired acknowledgements as expected timing failures.
const { Events, MessageFlags } = require(`discord.js`);
const { error, warn } = require(`../utils/writeLog.js`);

const UNKNOWN_INTERACTION = 10062;

function isUnknownInteraction(err) {
	return err?.code === UNKNOWN_INTERACTION || err?.rawError?.code === UNKNOWN_INTERACTION;
}

function interactionDescription(interaction) {
	let type = `interaction`;

	if (interaction.isAutocomplete()) {
		type = `autocomplete`;
	} else if (interaction.isChatInputCommand()) {
		type = `command`;
	} else if (interaction.isButton()) {
		type = `button`;
	} else if (interaction.isStringSelectMenu()) {
		type = `select menu`;
	}

	const name = interaction.commandName || interaction.customId || `unknown`;
	const age = Date.now() - interaction.createdTimestamp;

	return `${type} ${name} (${age}ms old)`;
}

async function reportInteractionFailure(interaction, context, userMessage, err) {
	if (isUnknownInteraction(err)) {
		// Discord can invalidate superseded autocomplete requests; retrying an expired callback only creates another 10062.
		if (!interaction.isAutocomplete()) {
			warn(`Discord expired ${interactionDescription(interaction)} before Paldeck could acknowledge it.`);
		}
		return;
	}

	error(context, err);

	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: userMessage, flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: userMessage, flags: MessageFlags.Ephemeral });
		}
	} catch (responseErr) {
		if (isUnknownInteraction(responseErr)) {
			warn(`Discord expired ${interactionDescription(interaction)} while Paldeck was reporting an error.`);
			return;
		}
		error(`There was an error while reporting an interaction failure.`, responseErr);
	}
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {

			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (err) {
				await reportInteractionFailure(
					interaction,
					`There was an error while executing a command.`,
					`There was an error while executing this command!`,
					err,
				);
			}
		} else if (interaction.isButton()) {
			const [commandName] = interaction.customId.split(`:`);
			const command = interaction.client.commands.get(commandName);

			if (!command?.handleButton) {
				error(`No button handler matching ${interaction.customId} was found.`);
				return;
			}

			try {
				await command.handleButton(interaction);
			} catch (err) {
				await reportInteractionFailure(
					interaction,
					`There was an error while handling a button.`,
					`There was an error while handling this button!`,
					err,
				);
			}
		} else if (interaction.isStringSelectMenu()) {
			const [commandName] = interaction.customId.split(`:`);
			const command = interaction.client.commands.get(commandName);

			if (!command?.handleSelectMenu) {
				error(`No select-menu handler matching ${interaction.customId} was found.`);
				return;
			}

			try {
				await command.handleSelectMenu(interaction);
			} catch (err) {
				await reportInteractionFailure(
					interaction,
					`There was an error while handling a select menu.`,
					`There was an error while handling this menu!`,
					err,
				);
			}
		} else if (interaction.isAutocomplete()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.autocomplete(interaction);
			} catch (err) {
				if (!isUnknownInteraction(err)) {
					error(`There was an error while running autocomplete.`, err);
				}
			}
		}
	},
};
