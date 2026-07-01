const { Events, MessageFlags } = require(`discord.js`);
const { error } = require(`../utils/writeLog.js`);

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
				error(`There was an error while executing a command.`, err);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: `There was an error while executing this command!`, flags: MessageFlags.Ephemeral });
				} else {
					await interaction.reply({ content: `There was an error while executing this command!`, flags: MessageFlags.Ephemeral });
				}
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
				error(`There was an error while handling a button.`, err);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: `There was an error while handling this button!`, flags: MessageFlags.Ephemeral });
				} else {
					await interaction.reply({ content: `There was an error while handling this button!`, flags: MessageFlags.Ephemeral });
				}
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
				error(`There was an error while running autocomplete.`, err);
			}
		}
	},
};
