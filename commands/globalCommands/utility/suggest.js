const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('suggest')
		.setDescription('Suggest a feature!')
		.addStringOption(option =>
			option
				.setName('idea')
				.setDescription('Your idea goes here.')
				.setRequired(true)),

	async execute(interaction) {
		const tempData = JSON.parse(fs.readFileSync('./config.json'));
		const channel = interaction.client.channels.cache.get('1221954020424421437');

		const suggestion = new EmbedBuilder()
			.setAuthor({ name: `Suggestion number ${tempData.count}` })
			.setColor([255, 255, 255])
			.setTitle(`${interaction.user.username}'s suggestion:`)
			.setDescription(interaction.options.getString('idea'));

		tempData.count++;

		fs.writeFileSync('./config.json', JSON.stringify(tempData, null, 2));

		await channel.send({ embeds: [suggestion] });
		await interaction.reply({ content: 'Suggestion sent!', ephemeral: true });
	},
};
