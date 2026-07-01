const { SlashCommandBuilder, MessageFlags } = require(`discord.js`);

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`vote`)
		.setDescription(`Vote for Paldeck.`),
	async execute(interaction) {
		try {
			await interaction.reply({ content: `https://top.gg/bot/1218928129628966963/vote` });
		} catch (error) {
			console.error(`Failed to update server settings:`, error);
			await interaction.reply({ content: `Failed to generate vote link.`, flags: MessageFlags.Ephemeral });
		}
	},
};
