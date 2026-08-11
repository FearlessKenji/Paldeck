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

function interactionHandler(interaction) {
	if (interaction.isChatInputCommand()) {
		return {
			commandName: interaction.commandName,
			handlerName: `execute`,
			missingMessage: `No command matching ${interaction.commandName} was found.`,
			errorContext: `There was an error while executing a command.`,
			userMessage: `There was an error while executing this command!`,
		};
	}
	if (interaction.isButton()) {
		return {
			commandName: interaction.customId.split(`:`)[0],
			handlerName: `handleButton`,
			missingMessage: `No button handler matching ${interaction.customId} was found.`,
			errorContext: `There was an error while handling a button.`,
			userMessage: `There was an error while handling this button!`,
		};
	}
	if (interaction.isStringSelectMenu()) {
		return {
			commandName: interaction.customId.split(`:`)[0],
			handlerName: `handleSelectMenu`,
			missingMessage: `No select-menu handler matching ${interaction.customId} was found.`,
			errorContext: `There was an error while handling a select menu.`,
			userMessage: `There was an error while handling this menu!`,
		};
	}
	if (interaction.isAutocomplete()) {
		return {
			commandName: interaction.commandName,
			handlerName: `autocomplete`,
			missingMessage: `No command matching ${interaction.commandName} was found.`,
			errorContext: `There was an error while running autocomplete.`,
		};
	}
	return null;
}

async function dispatchInteraction(interaction) {
	const route = interactionHandler(interaction);
	if (!route) {
		return;
	}
	const command = interaction.client.commands.get(route.commandName);
	if (!command?.[route.handlerName]) {
		error(route.missingMessage);
		return;
	}
	try {
		await command[route.handlerName](interaction);
	} catch (err) {
		if (route.handlerName === `autocomplete`) {
			if (!isUnknownInteraction(err)) {
				error(route.errorContext, err);
			}
			return;
		}
		await reportInteractionFailure(interaction, route.errorContext, route.userMessage, err);
	}
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		await dispatchInteraction(interaction);
	},
};
