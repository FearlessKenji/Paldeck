// Builds item-card navigation rows and optional detached map embeds.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require(`discord.js`);
const { searchablePalDrops } = require(`./itemDropSources.js`);

const SPECIAL_MERCHANT_BUTTONS = [
	[`medalMerchants`, `medalmerchants`, `Medal Merchants`],
	[`bountyMerchants`, `bountymerchants`, `Bounty Officers`],
	[`arenaMerchant`, `arenamerchant`, `Arena Merchant`],
];

function standardButton(customId, label) {
	return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary);
}

function addItemActions(addButton, { item, pal, ownerId, relatedItem }) {
	const add = (condition, action, label) => {
		if (!condition) {
			return;
		}
		const originPal = action === `drops` && pal ? encodeURIComponent(pal.number) : ``;
		addButton(standardButton(`item:${action}:${item.id}:${ownerId}:${originPal}`, label));
	};
	add(searchablePalDrops(item).length && ownerId, `drops`, `View Dropping Pals`);
	if (relatedItem && ownerId) {
		const label = item.category === `Schematic` ? `View Item` : `View Schematic`;
		addButton(standardButton(`item:related:${relatedItem.id}:${ownerId}`, label));
	}
	add(item.merchantLocations?.entries?.length && ownerId, `merchants`, `Merchant Locations`);
	for (const [property, action, label] of SPECIAL_MERCHANT_BUTTONS) {
		add(item[property]?.entries?.length && ownerId, action, label);
	}
}

function addNavigationActions(addButton, { item, pal, ownerId, backItemId, hasSourceDetails }) {
	if (pal && ownerId) {
		addButton(standardButton(`paldeck:back:${encodeURIComponent(pal.number)}:${ownerId}`, `Back to Pal`));
	}
	if (backItemId && ownerId) {
		addButton(standardButton(`item:back:${backItemId}:${ownerId}`, `Back`));
	}
	if (hasSourceDetails) {
		addButton(standardButton(`item:sources:${item.id}:0`, `Source Chances`));
	}
}

function itemControlRows({ item, pal, ownerId, hasSourceDetails, relatedItem, backItemId }) {
	const rows = [];
	let row = new ActionRowBuilder();
	const addButton = button => {
		if (row.components.length === 5) {
			rows.push(row);
			row = new ActionRowBuilder();
		}
		row.addComponents(button);
	};
	addItemActions(addButton, { item, pal, ownerId, relatedItem });
	addNavigationActions(addButton, { item, pal, ownerId, backItemId, hasSourceDetails });
	if (row.components.length) {
		rows.push(row);
	}
	return rows;
}

function itemResponseEmbeds({ item, pal, thumbnailUrl, mapUrl, buildItemEmbed, rarityColors }) {
	const separateMap = Boolean(mapUrl);
	const embeds = [buildItemEmbed(item, pal, thumbnailUrl, separateMap ? null : mapUrl)];
	if (separateMap) {
		// Preview a detached map embed so its dimensions cannot constrain the information card layout.
		embeds.push(new EmbedBuilder().setImage(mapUrl).setColor(rarityColors[item.rarity] || rarityColors.Common));
	}
	return embeds;
}

module.exports = { itemControlRows, itemResponseEmbeds };
