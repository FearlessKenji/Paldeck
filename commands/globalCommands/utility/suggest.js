const { SlashCommandBuilder, EmbedBuilder } = require(`discord.js`);
const { Channels, Suggestions } = require(`../../../database/dbObjects.js`);

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`suggest`)
		.setDescription(`Suggest a feature!`)
		.addStringOption(option =>
			option
				.setName(`idea`)
				.setDescription(`Your idea goes here.`)
				.setMaxLength(1000)
				.setRequired(true)),

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });

		const idea = interaction.options.getString(`idea`);
		const suggestionChannel = await Channels.findOne({ where: { name: `Suggestions` } });

		if (!suggestionChannel) {
			await interaction.editReply(`Suggestions are not configured yet.`);
			return;
		}

		const channel = await interaction.client.channels.fetch(suggestionChannel.id).catch(() => null);

		if (!channel?.isTextBased()) {
			await interaction.editReply(`The suggestions channel could not be found.`);
			return;
		}

		const savedSuggestion = await Suggestions.create({
			suggestion: idea,
			author: `${interaction.user.username} (${interaction.user.id})`,
			accepted: false,
		});

		const suggestion = new EmbedBuilder()
			.setAuthor({ name: `Suggestion number ${savedSuggestion.id}` })
			.setColor([255, 255, 255])
			.setTitle(`${interaction.user.username}'s suggestion:`)
			.setDescription(idea);

		try {
			const message = await channel.send({ embeds: [suggestion] });

			await savedSuggestion.update({ suggestion_id: message.id });
			await interaction.editReply(`Suggestion sent!`);
		} catch (err) {
			await savedSuggestion.destroy();
			throw err;
		}
	},
};
