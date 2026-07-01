const { SlashCommandBuilder, EmbedBuilder } = require(`discord.js`);
const { Channels, Suggestions } = require(`../../../database/dbObjects.js`);

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`suggest`)
		.setDescription(`Suggest a feature!`)
		.addStringOption(option =>
			option
				.setName(`idea`)
				.setDescription(`Please be as specific as possible, especially if reporting a problem.`)
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
			author_id: interaction.user.id,
			guild_id: interaction.guildId,
			guild_name: interaction.guild?.name || null,
			channel_id: interaction.channelId,
			channel_name: interaction.channel?.name || null,
			accepted: false,
		});

		const sourceParts = [
			interaction.guild?.name ? `Server: ${interaction.guild.name}` : null,
			interaction.channel?.name ? `Channel: #${interaction.channel.name}` : null,
		].filter(Boolean);

		const suggestion = new EmbedBuilder()
			.setAuthor({ name: `Suggestion number ${savedSuggestion.id}` })
			.setColor([255, 255, 255])
			.setTitle(`${interaction.user.username}'s suggestion:`)
			.setDescription(idea)
			.setFooter({ text: sourceParts.join(` | `) || `Direct message or unknown source` });

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
