const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Returns command usage parameters.'),

	async execute(interaction) {
		await interaction.reply({ content: `## Using the Paldeck:\n
		- Name\n - Enter the name of the pal to be searched for.\n - Returns a single pal.\n - One name only.
		- Number\n - Enter the paldeck number you wish to look up.\n - Returns a single pal.\n - One number only.
### Combine the following criteria to narrow search:\n
		- Drops\n - Enter the item that drops from the pal you wish to look up.\n - Returns a list of pals.
		- Element\n - Enter the element you wish to look for.\n - Returns a list of pals.
		- Suitability\n - Enter the work suitability you wish to look for.\n - Returns a list of pals.\n - You can add a number to specify tier.
		- Rarity\n - Enter the rarity you wish to search for.\n - Returns a list of pals.`, ephemeral: true });
	},
};