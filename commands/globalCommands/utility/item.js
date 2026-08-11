// Implements item lookup, source search, and owner-bound message-replacing navigation.
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder,
} = require(`discord.js`);
const crypto = require(`node:crypto`);
const palData = require(`../../../data/palData.json`);
const { resolvedItemData } = require(`../../../utils/itemData.js`);
const { createItemSourceFilters } = require(`../../../utils/itemSourceFilters.js`);
const { createItemVariantIndex, normalizeItemName, schematicFamilyName } = require(`../../../utils/itemVariants.js`);
const { shouldHideItem } = require(`../../../utils/itemVisibility.js`);
const { replaceInteractionMessage } = require(`../../../utils/interactionNavigation.js`);
const paldeck = require(`./paldeck.js`);

const ITEMS = resolvedItemData().Items;
const ITEMS_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
const SEARCHABLE_ITEMS = ITEMS.filter(item => !shouldHideItem(item));
const ITEM_VARIANTS = createItemVariantIndex(SEARCHABLE_ITEMS);
const SOURCE_FILTERS = createItemSourceFilters(palData.Pals.filter(pal => !pal.hidden));
const SOURCE_FILTERS_BY_NAME = new Map(SOURCE_FILTERS.map(filter => [normalizeItemName(filter.label), filter]));
const SOURCE_SEARCHES = new Map();
const SOURCE_RESULTS_PER_PAGE = 20;
const SOURCE_SEARCH_TTL_MS = 15 * 60 * 1000;
const UNAUTHORIZED_CONTROL_MESSAGE = `I'm not your button, pal!`;

function uniqueAutocompleteItems() {
	const itemsByName = new Map();
	for (const item of SEARCHABLE_ITEMS) {
		const displayName = item.category === `Schematic` ? schematicFamilyName(item.name) : item.name;
		const key = normalizeItemName(displayName);
		const current = itemsByName.get(key);
		if (!current || item.rarityRank < current.rarityRank) {
			itemsByName.set(key, { displayName, item });
		}
	}
	return [...itemsByName.values()];
}

function itemAutocompleteChoices(input) {
	const needle = normalizeItemName(input);
	return uniqueAutocompleteItems().filter(entry => normalizeItemName(entry.displayName).includes(needle)).slice(0, 25)
		.map(entry => ({ name: entry.displayName, value: entry.displayName }));
}

function sourceAutocompleteChoices(input) {
	const needle = normalizeItemName(input);
	return SOURCE_FILTERS.filter(filter => normalizeItemName(filter.label).includes(needle)).slice(0, 25)
		.map(filter => ({ name: filter.label, value: filter.label }));
}

function rarityAutocompleteChoices(name, input) {
	const needle = normalizeItemName(input);
	return [...new Set(ITEM_VARIANTS.variants(name).map(item => item.rarity))]
		.filter(rarity => normalizeItemName(rarity).includes(needle))
		.map(rarity => ({ name: rarity, value: rarity }));
}

function sourceSearchPayload(state, requestedPage) {
	const totalPages = Math.max(1, Math.ceil(state.items.length / SOURCE_RESULTS_PER_PAGE));
	const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
	const pageItems = state.items.slice(page * SOURCE_RESULTS_PER_PAGE, (page + 1) * SOURCE_RESULTS_PER_PAGE);
	const description = pageItems.map(item => `• ${item.name} (${item.rarity})`).join(`\n`) || `No matching items.`;
	const embed = new EmbedBuilder().setTitle(`Items from ${state.source}`).setDescription(description)
		.setFooter({ text: totalPages > 1 ? `Page ${page + 1}/${totalPages} • ${state.items.length} items` : `${state.items.length} items` });
	const rows = [];
	if (pageItems.length) {
		rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
			.setCustomId(`item:searchselect:${state.id}:${page}:${state.ownerId}`)
			.setPlaceholder(`View an item`)
			.addOptions(pageItems.map(item => ({ label: item.name.slice(0, 100), description: item.rarity, value: item.id })))));
	}
	if (totalPages > 1) {
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`item:searchpage:${state.id}:${page - 1}:${state.ownerId}`).setLabel(`<`).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
			new ButtonBuilder().setCustomId(`item:searchpage:${state.id}:${page + 1}:${state.ownerId}`).setLabel(`>`).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1),
		));
	}
	return { embeds: [embed], components: rows, files: [] };
}

function storeSourceSearch(ownerId, source, items) {
	const id = crypto.randomUUID();
	const state = { id, ownerId, source, items };
	SOURCE_SEARCHES.set(id, state);
	const timeout = setTimeout(() => SOURCE_SEARCHES.delete(id), SOURCE_SEARCH_TTL_MS);
	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}
	return state;
}

function backRow(itemId, ownerId) {
	return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`item:back:${itemId}:${ownerId}`)
		.setLabel(`Back`).setStyle(ButtonStyle.Secondary));
}

function appendBack(payload, itemId, ownerId) {
	return { ...payload, components: [...(payload.components || []), backRow(itemId, ownerId)] };
}

async function handleSourceAction(interaction, item, action) {
	if (!item) {
		await interaction.reply({ content: `That item is no longer available.`, flags: MessageFlags.Ephemeral });
		return;
	}
	const payload = paldeck.buildSourceDetailsResponse(item, Number(interaction.customId.split(`:`)[3]) || 0, action === `sources`);
	if (action === `sourcepage`) {
		await interaction.update(payload);
	} else {
		await interaction.reply(payload);
	}
}

const MERCHANT_ACTIONS = {
	merchants: {
		property: `merchantLocations`, emptyMessage: `No fixed merchant locations are available for this item.`,
		buildResponse: paldeck.buildMerchantResponse,
	},
	medalmerchants: {
		property: `medalMerchants`, emptyMessage: `No fixed Medal Merchant locations are available for this item.`,
		buildResponse: paldeck.buildMedalMerchantResponse,
	},
	bountymerchants: {
		property: `bountyMerchants`, emptyMessage: `No fixed merchant locations are available for this item.`,
		buildResponse: paldeck.buildBountyMerchantResponse,
	},
	arenamerchant: {
		property: `arenaMerchant`, emptyMessage: `No fixed merchant locations are available for this item.`,
		buildResponse: paldeck.buildArenaMerchantResponse,
	},
};

async function handleMerchantAction(interaction, item, ownerId, action) {
	const merchantAction = MERCHANT_ACTIONS[action];
	if (!item?.[merchantAction.property]?.entries?.length) {
		await interaction.reply({ content: merchantAction.emptyMessage, flags: MessageFlags.Ephemeral });
		return;
	}
	await replaceInteractionMessage(interaction, appendBack(merchantAction.buildResponse(item), item.id, ownerId));
}

const ITEM_ACTIONS = new Set([
	`back`, `drops`, `related`, `searchback`, `searchpage`, ...Object.keys(MERCHANT_ACTIONS), `sources`, `sourcepage`,
]);

module.exports = {
	data: new SlashCommandBuilder().setName(`item`).setDescription(`Look up or search Palworld items.`)
		.addStringOption(option => option.setName(`name`).setDescription(`Item to look up.`).setAutocomplete(true))
		.addStringOption(option => option.setName(`rarity`).setDescription(`Exact item rarity.`).setAutocomplete(true))
		.addStringOption(option => option.setName(`source`).setDescription(`Find items by acquisition source.`).setAutocomplete(true)),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		const name = typeof focused === `object` ? focused.name : `name`;
		const value = typeof focused === `object` ? focused.value : focused;
		if (name === `source`) {
			await interaction.respond(sourceAutocompleteChoices(value));
			return;
		}
		if (name === `rarity`) {
			await interaction.respond(rarityAutocompleteChoices(interaction.options.getString(`name`), value));
			return;
		}
		await interaction.respond(itemAutocompleteChoices(value));
	},

	async execute(interaction) {
		const name = interaction.options.getString(`name`);
		const rarity = interaction.options.getString(`rarity`);
		const source = interaction.options.getString(`source`);
		if (Boolean(name) === Boolean(source)) {
			await interaction.reply({ content: `Choose either an item name or a source.`, flags: MessageFlags.Ephemeral });
			return;
		}
		if (rarity && !name) {
			await interaction.reply({ content: `Rarity can only be used with an item name.`, flags: MessageFlags.Ephemeral });
			return;
		}
		if (source) {
			const filter = SOURCE_FILTERS_BY_NAME.get(normalizeItemName(source));
			if (!filter) {
				await interaction.reply({ content: `Choose a source from autocomplete.`, flags: MessageFlags.Ephemeral });
				return;
			}
			const items = SEARCHABLE_ITEMS.filter(filter.matches)
				.sort((left, right) => left.name.localeCompare(right.name) || left.rarityRank - right.rarityRank);
			await interaction.reply(sourceSearchPayload(storeSourceSearch(interaction.user.id, filter.label, items), 0));
			return;
		}
		const item = ITEM_VARIANTS.find(name, rarity);
		if (!item) {
			const message = rarity ? `That item is not available at ${rarity} rarity.` : `Nothing found.`;
			await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
			return;
		}
		await interaction.reply(paldeck.buildItemResponse(item, null, interaction.user.id));
	},

	async handleButton(interaction) {
		const [, action, targetId, ownerOrPage, originOrOwner] = interaction.customId.split(`:`);
		if (!ITEM_ACTIONS.has(action)) {
			await interaction.reply({ content: `Unknown item action.`, flags: MessageFlags.Ephemeral });
			return;
		}
		if ([`sources`, `sourcepage`].includes(action)) {
			await handleSourceAction(interaction, ITEMS_BY_ID.get(targetId), action);
			return;
		}
		const ownerId = [`searchpage`, `searchback`].includes(action) ? originOrOwner : ownerOrPage;
		if (ownerId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}
		if ([`searchpage`, `searchback`].includes(action)) {
			const state = SOURCE_SEARCHES.get(targetId);
			if (!state) {
				await interaction.reply({ content: `This search has expired.`, flags: MessageFlags.Ephemeral });
				return;
			}
			await replaceInteractionMessage(interaction, sourceSearchPayload(state, ownerOrPage));
			return;
		}
		const item = ITEMS_BY_ID.get(targetId);
		if (!item) {
			await interaction.reply({ content: `That item is no longer available.`, flags: MessageFlags.Ephemeral });
			return;
		}
		if (action === `back`) {
			await replaceInteractionMessage(interaction, paldeck.buildItemResponse(item, null, ownerId));
			return;
		}
		if (action === `related`) {
			const previousItem = ITEM_VARIANTS.counterpart(item);
			await replaceInteractionMessage(interaction, paldeck.buildItemResponse(item, null, ownerId, previousItem?.id));
			return;
		}
		if (MERCHANT_ACTIONS[action]) {
			await handleMerchantAction(interaction, item, ownerId, action);
			return;
		}
		await paldeck.replyWithDroppingPals(interaction, item, originOrOwner ? decodeURIComponent(originOrOwner) : null, ownerId);
	},

	async handleSelectMenu(interaction) {
		const [, action, searchId, rawPage, ownerId] = interaction.customId.split(`:`);
		if (action !== `searchselect` || ownerId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}
		const state = SOURCE_SEARCHES.get(searchId);
		const item = state && ITEMS_BY_ID.get(interaction.values[0]);
		if (!item) {
			await interaction.reply({ content: `This search has expired.`, flags: MessageFlags.Ephemeral });
			return;
		}
		const payload = paldeck.buildItemResponse(item, null, ownerId);
		payload.components.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
			.setCustomId(`item:searchback:${searchId}:${rawPage}:${ownerId}`).setLabel(`Back`).setStyle(ButtonStyle.Secondary)));
		await replaceInteractionMessage(interaction, payload);
	},
};
