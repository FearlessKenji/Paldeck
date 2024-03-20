const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Returns command usage parameters.'),

	async execute(interaction) {
		await interaction.reply({ content: '## Using the Paldeck:\n- Name\n - Enter the name of the pal to be searched for.\n - One name only.\n- Number\n - Enter the paldeck number you wish to look up.\n - One number only.\n- Element\n - Enter the element you wish to look for.\n - Returns a list of pals.\n - Mix with Suitability and Rarity to narrow search.\n - One element only.\n- Suitability\n - Enter the work suitability you wish to look for.\n - Returns a list.\n - You can add a number to specify tier.\n - Mix with Element and Rarity to narrow search.\n - One suitability only.\n- Rarity\n - Enter the rarity you wish to search for.\n - Returns a list of pals. Mix with Element and Suitability to narrow search.\n - One rarity only.', ephemeral: true });
	},
};