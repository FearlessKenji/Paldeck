const { SlashCommandBuilder, MessageFlags } = require(`discord.js`);

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`help`)
		.setDescription(`Returns command usage parameters.`),

	async execute(interaction) {
		await interaction.reply({ content: `## Using the Paldeck:\n
		- Name\n - Enter the name of the pal to be searched for.\n - One name only.
		- Number\n - Enter the paldeck number you wish to look up.\n - One number only.
### Combine the following criteria to narrow search:\n
		- Drops\n - Enter the item that drops from the pals you wish to look up.
		- Element\n - Enter the element you wish to look for.
		- Suitability\n - Enter the work suitability you wish to look for.\n - You can add numbers to specify tiers (Medicine 4, Mining 2).
		- Rarity\n - Enter the rarity you wish to search for.
### Breeding:

		- /breed result\n - Enter two parents to calculate their child.
		- /breed parents\n - Enter a child to list parent pairs.
		- /breed partner\n - Enter one parent and a desired child to list matching partners.
### Support/Feedback:\n
		- [Join the Discord](https://discord.gg/FBBnC3jCFa)`, flags: MessageFlags.Ephemeral });
	},
};
