const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require(`discord.js`);

const HELP_COLOR = 0xFFD700;

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`help`)
		.setDescription(`Returns command usage parameters.`),

	async execute(interaction) {
		const embed = new EmbedBuilder()
			.setTitle(`Paldeck Help`)
			.setColor(HELP_COLOR)
			.setDescription(`Look up Pals and items, search the Paldeck, or calculate breeding results.`)
			.addFields(
				{
					name: `Pal Lookups`,
					value: [
						`\`/paldeck name\` — Look up one Pal by name.`,
						`\`/paldeck number\` — Look up a Paldeck number.`,
						`\`/paldeck search\` — Combine Drops, Farmable, Element, Rarity, and comma-separated Suitability filters. Tiers such as \`Medicine 4\` and \`Mining 2\` are supported.`,
						`Use **Look Up Drops** to browse a Pal's items and **Back to Pal** to return.`,
					].join(`\n`),
				},
				{
					name: `Item Lookups`,
					value: [
						`\`/item name:<name> rarity:<rarity>\` — Look up an item; rarity selects schematic and equipment variants.`,
						`\`/item source:<source>\` — Browse items from a player-facing source such as Gold Chests, Towers, or Fishing.`,
						`**View Dropping Pals** opens Paldeck results when drop sources are available.`,
						`**Source Chances** explains meaningful location-dependent probability differences when available.`,
						`Controls belong to the person who started the lookup; resulting item cards remain public.`,
					].join(`\n`),
				},
				{
					name: `Breeding`,
					value: [
						`\`/breed result\` — Calculate the child from two parents.`,
						`\`/breed parents\` — List parent pairs for a child.`,
						`\`/breed partner\` — Find partners for a parent and desired child.`,
					].join(`\n`),
				},
				{
					name: `Support and Feedback`,
					value: [
						`\`/suggest\` — Send feedback or suggest a feature.`,
						`[Join the Discord](https://discord.gg/FBBnC3jCFa)`,
						`[Support the dev on Ko-fi](https://ko-fi.com/fearlesskenji)`,
					].join(`\n`),
				},
			);

		await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	},
};
