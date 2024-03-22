const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Returns command usage parameters.'),

	async execute(interaction) {
		await interaction.reply({ content: `## Using the Paldeck:\n
		- Name\n - Enter the name of the pal to be searched for.\n - Returns a single pal.\n - One name only.
		- Number\n - Enter the paldeck number you wish to look up.\n - Returns a single pal.\n - One number only.
		- Drops\n - Enter the item that drops from the pal you wish to look up.\n - Returns a list of pals.\n - Combine criteria to narrow search.\n - One drop item only.
		- Element\n - Enter the element you wish to look for.\n - Returns a list of pals.\n - Combine criteria to narrow search.\n - One element only.
		- Suitability\n - Enter the work suitability you wish to look for.\n - Returns a list of pals.\n - You can add a number to specify tier.\n - Combine criteria to narrow search.\n - One suitability only.
		- Rarity\n - Enter the rarity you wish to search for.\n - Returns a list of pals.\n - Combine criteria to narrow search.\n - One rarity only.`, ephemeral: true });
	},
};