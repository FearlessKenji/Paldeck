const { MessageFlags, SlashCommandBuilder } = require(`discord.js`);
const itemFile = require(`../../../data/itemData.json`);
const paldeck = require(`./paldeck.js`);

const ITEMS = itemFile.Items;
const ITEMS_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
const SEARCHABLE_ITEMS = ITEMS.filter(item =>
	item.properties?.bLegalInGame !== 0 && !/^\s*\[WIP\]/i.test(item.description || ``),
);
const UNAUTHORIZED_CONTROL_MESSAGE = `I'm not your button, pal!`;
const RARITY_CHOICES = [`Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`]
	.map(rarity => ({ name: rarity, value: rarity }));

function normalizeText(value) {
	return String(value || ``).trim().toLowerCase();
}

function uniqueItemsByName() {
	const itemsByName = new Map();

	for (const item of SEARCHABLE_ITEMS) {
		const key = normalizeText(item.name);
		const current = itemsByName.get(key);

		if (!current || item.rarityRank < current.rarityRank) {
			itemsByName.set(key, item);
		}
	}

	return [...itemsByName.values()];
}

function autocompleteChoices(input) {
	const needle = normalizeText(input);

	return uniqueItemsByName()
		.filter(item => normalizeText(item.name).includes(needle))
		.slice(0, 25)
		.map(item => ({ name: item.name, value: item.name }));
}

function findItem(name, rarity) {
	const matches = SEARCHABLE_ITEMS
		.filter(item => normalizeText(item.name) === normalizeText(name))
		.sort((first, second) => first.rarityRank - second.rarityRank);

	return matches.find(item => item.rarity === rarity) || matches[0];
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`item`)
		.setDescription(`Look up a Palworld item.`)
		.addStringOption(option =>
			option
				.setName(`name`)
				.setDescription(`Item to look up.`)
				.setAutocomplete(true)
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName(`rarity`)
				.setDescription(`Preferred item rarity; falls back to the basic item when unavailable.`)
				.addChoices(...RARITY_CHOICES)),

	async autocomplete(interaction) {
		await interaction.respond(autocompleteChoices(interaction.options.getFocused()));
	},

	async execute(interaction) {
		const item = findItem(
			interaction.options.getString(`name`),
			interaction.options.getString(`rarity`),
		);

		if (!item) {
			await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply(paldeck.buildItemResponse(item, null, interaction.user.id));
	},

	async handleButton(interaction) {
		const [, action, itemId, ownerId, rawOriginPal] = interaction.customId.split(`:`);

		if (action !== `drops`) {
			await interaction.reply({ content: `Unknown item action.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (ownerId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		const item = ITEMS_BY_ID.get(itemId);

		if (!item || !(item.droppedBy || []).length) {
			await interaction.reply({ content: `No dropping Pals are available for this item.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await paldeck.replyWithDroppingPals(
			interaction,
			item,
			rawOriginPal ? decodeURIComponent(rawOriginPal) : null,
			ownerId,
		);
	},
};
