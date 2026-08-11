const { assert, readJson, requireFresh, serializeDiscordPayload } = require(`./item-shared.js`);

function createItemSmokeContext() {
	const itemCommand = requireFresh(`commands`, `globalCommands`, `utility`, `item.js`);
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const { resolvedItemData } = requireFresh(`utils`, `itemData.js`);
	const itemData = resolvedItemData();
	const availabilityManifest = readJson(`data`, `itemAvailability.json`);
	return { availabilityManifest, itemCommand, itemData, paldeck };
}

function validateDirectItemCommandSchema(itemCommand) {
	const commandOptions = itemCommand.data.toJSON().options;
	assert(commandOptions.some(option => option.name === `name` && option.type === 3), `/item should expose name as a direct option.`);
	assert(commandOptions.some(option => option.name === `source` && option.type === 3), `/item should expose source as a direct option.`);
	assert(commandOptions.every(option => ![`lookup`, `search`].includes(option.name)), `/item should not use lookup or search subcommands.`);
}

function validateNonPalBossSource(context) {
	const legendaryMeowmere = context.itemData.Items.find(item => item.name === `Legendary Meowmere`);
	const payload = context.paldeck.buildItemResponse(legendaryMeowmere, null, `item-owner`);
	const serialized = serializeDiscordPayload(payload);
	assert(serialized.includes(`Moon Lord: 22.22%`), `Legendary Meowmere should name Moon Lord as its source.`);
	assert(!serialized.includes(`Pal Drops: 22.22%`), `Non-Pal bosses should not be summarized as Pal Drops.`);
	assert(
		!payload.components.flatMap(row => row.components).some(component => component.data.label === `View Dropping Pals`),
		`Items dropped only by non-Pal bosses should not offer View Dropping Pals.`,
	);
}

async function validateItemAutocomplete(context) {
	const { itemCommand } = context;
	let choices = [];
	let itemPayload = null;
	validateDirectItemCommandSchema(itemCommand);
	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `wool` } : `wool` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(choices.some(choice => choice.name === `Wool` && choice.value === `Wool`), `/item autocomplete should show only the plain Wool name.`);
	assert(choices.every(choice => !choice.name.includes(` — `)), `/item autocomplete should not show rarity or category labels.`);

	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `effigy` } : `effigy` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(choices.some(choice => choice.name === `Lifmunk Effigy`), `/item autocomplete should include obtainable Effigies.`);
	assert(choices.some(choice => choice.name === `Yakumo Effigy`), `/item autocomplete should include current Effigy variants.`);

	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `ballistic` } : `ballistic` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(!choices.some(choice => choice.name === `Ballistic Shield`), `/item autocomplete should hide WIP items.`);

	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `ultra slab fragment` } : `ultra slab fragment` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(!choices.some(choice => /\(Ultra\) Slab Fragment$/i.test(choice.name)), `/item autocomplete should hide unused Ultra slab fragment definitions.`);

	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `journals` } : `journals` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(
		[`Palpagos Journals`, `World Tree Journals`].every(name => choices.some(choice => choice.name === name)),
		`/item autocomplete should expose both curated journal collections.`,
	);
	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `bjorn seligsson` } : `bjorn seligsson` },
		respond: payload => {choices = payload;},
	});
	assert(choices.some(choice => choice.name === `Bjorn Seligsson's Diary - 1`), `/item autocomplete should expose individual journals.`);
	await itemCommand.autocomplete({
		options: { getFocused: metadata => metadata ? { name: `name`, value: `assault rifle schematic` } : `assault rifle schematic` },
		respond: payload => {choices = payload;},
	});
	assert(choices.some(choice => choice.name === `Assault Rifle Schematic`) &&
		!choices.some(choice => /Assault Rifle Schematic \d/u.test(choice.name)),
	`Schematic autocomplete should show one rarity-selected family instead of numbered tiers.`);
	await itemCommand.autocomplete({
		options: {
			getFocused: () => ({ name: `rarity`, value: `` }),
			getString: () => `Assault Rifle Schematic`,
		},
		respond: payload => {choices = payload;},
	});
	assert(choices.map(choice => choice.value).join() === `Uncommon,Rare,Epic,Legendary`,
		`Rarity autocomplete should offer only variants that exist for the selected schematic family.`);
	let schematicPayload = null;
	await itemCommand.execute({
		options: {
			getString: name => ({ name: `Assault Rifle Schematic`, rarity: `Legendary` })[name] || null,
		},
		reply: payload => {schematicPayload = payload;},
		user: { id: `item-owner` },
	});
	assert(serializeDiscordPayload(schematicPayload).includes(`Assault Rifle Schematic 4`),
		`Rarity should resolve the exact numbered schematic variant.`);

	await itemCommand.execute({
		options: {
			getString: name => name === `name` ? `Wool` : null,
		},
		reply: payload => {
			itemPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			itemPayload = payload;
		},
		user: { id: `item-owner` },
	});

	const serializedItem = serializeDiscordPayload(itemPayload);
	const dropButton = itemPayload?.components?.[0]?.components?.[0];

	assert(serializedItem.includes(`Wool`), `/item should send the selected item embed.`);
	assert(serializedItem.includes(`Rarity: Common`), `/item should default to the lowest available rarity.`);
	assert(!serializedItem.includes(`Dropped By`), `/item should not list dropping Pals in the item embed.`);
	assert(dropButton?.data?.label === `View Dropping Pals`, `Droppable items should include a View Dropping Pals button.`);
	assert(!serializedItem.includes(`Back to Pal`), `Direct /item lookups should not include Back to Pal navigation.`);
	validateNonPalBossSource(context);
	return dropButton;
}

async function validateDroppingPalLookup(itemCommand, dropButton) {
	let resultsPayload = null;
	let unauthorizedPayload = null;
	await itemCommand.handleButton({
		customId: dropButton.data.custom_id,
		update: payload => {
			resultsPayload = payload;
		},
		user: { id: `item-owner` },
	});

	const serializedResults = serializeDiscordPayload(resultsPayload);

	assert(resultsPayload?.embeds?.length, `View Dropping Pals should send a Paldeck search embed.`);
	assert(serializedResults.includes(`Lamball`), `Wool's dropping-Pal results should include Lamball.`);
	assert(/Drops:\s+Wool/.test(serializedResults), `Dropping-Pal results should identify the selected item filter.`);

	await itemCommand.handleButton({
		customId: dropButton.data.custom_id,
		reply: payload => {
			unauthorizedPayload = payload;
		},
		user: { id: `someone-else` },
	});
	assert(unauthorizedPayload?.content === `I'm not your button, pal!`, `Unauthorized item controls should use the requested response.`);
}

async function validateItemSourceSearch(context) {
	const { itemCommand } = context;
	let choices = [];
	let searchPayload = null;
	await itemCommand.autocomplete({
		options: { getFocused: () => ({ name: `source`, value: `gold chests` }) },
		respond: payload => {choices = payload;},
	});
	assert(choices.some(choice => choice.value === `Gold Chests`), `Source autocomplete should include exact player-facing chest types.`);
	await itemCommand.execute({
		options: { getString: name => name === `source` ? `Gold Chests` : null },
		reply: payload => {searchPayload = payload;},
		user: { id: `item-owner` },
	});
	assert(serializeDiscordPayload(searchPayload).includes(`Items from Gold Chests`) && searchPayload.components[0].components[0].options.length,
		`/item source should return deduplicated selectable items for a normalized source.`);
	const select = searchPayload.components[0].components[0];
	let selectedPayload = null;
	await itemCommand.handleSelectMenu({
		customId: select.data.custom_id,
		values: [select.options[0].data.value],
		update: payload => {selectedPayload = payload;},
		user: { id: `item-owner` },
	});
	const back = selectedPayload.components.flatMap(row => row.components).find(component => component.data.label === `Back`);
	assert(back, `Items opened from a source search should include Back navigation.`);
	let restoredPayload = null;
	await itemCommand.handleButton({
		customId: back.data.custom_id,
		update: payload => {restoredPayload = payload;},
		user: { id: `item-owner` },
	});
	assert(serializeDiscordPayload(restoredPayload).includes(`Items from Gold Chests`), `Back should restore the source search in place.`);
}

async function validateSchematicNavigation(context) {
	const { itemCommand, itemData, paldeck } = context;
	const armor = itemData.Items.find(item => item.name === `Lightweight Ancient Armor` && item.rarity === `Legendary`);
	const armorPayload = paldeck.buildItemResponse(armor, null, `item-owner`);
	const schematicButton = armorPayload.components.flatMap(row => row.components)
		.find(component => component.data.label === `View Schematic`);
	assert(schematicButton, `Equipment with an exact-rarity schematic should include View Schematic.`);
	let schematicPayload = null;
	await itemCommand.handleButton({
		customId: schematicButton.data.custom_id,
		update: payload => {schematicPayload = payload;},
		user: { id: `item-owner` },
	});
	const serializedSchematic = serializeDiscordPayload(schematicPayload);
	assert(serializedSchematic.includes(`Lightweight Ancient Armor Schematic 4`) && serializedSchematic.includes(`View Item`),
		`View Schematic should open the exact-rarity schematic and expose the reverse relationship.`);
	assert(schematicPayload.components.flatMap(row => row.components).some(component => component.data.label === `Back`),
		`Related-item navigation should include Back.`);
}

async function validateMerchantItemControls(context) {
	const { itemCommand, itemData, paldeck } = context;
	const merchantItem = itemData.Items.find(item => item.name === `Ground Skill Fruit: Sand Tornado` && item.merchantLocations);
	const merchantItemResponse = paldeck.buildItemResponse(merchantItem, null, `item-owner`);
	const merchantButton = merchantItemResponse.components[0].components.find(component => component.data.label === `Merchant Locations`);
	let merchantPayload = null;
	assert(merchantButton, `Items sold by fixed merchants should include a Merchant Locations button.`);
	await itemCommand.handleButton({
		customId: merchantButton.data.custom_id,
		update: payload => {
			merchantPayload = payload;
		},
		user: { id: `item-owner` },
	});
	assert(merchantPayload?.flags === undefined, `Merchant-location responses should remain visible in the channel.`);
	assert(serializeDiscordPayload(merchantPayload).includes(`Wandering Merchant`), `Merchant-location responses should name the applicable merchant type.`);
	assert(merchantPayload.files.length === 2, `Merchant-location responses should attach the item thumbnail and merchant map.`);
	assert(merchantPayload.components.flatMap(row => row.components).some(component => component.data.label === `Back`),
		`Merchant-location responses should include Back navigation.`);
	const bone = itemData.Items.find(item => item.name === `Bone`);
	const boneSources = serializeDiscordPayload(paldeck.buildItemResponse(bone, null, `item-owner`));
	assert(boneSources.includes(`Wandering Merchant`), `Bone should identify its fixed general merchant type.`);
	assert(!/Caravan Merchants|Dungeon Merchant/u.test(boneSources), `Fixed merchant items should suppress redundant procedural merchant categories.`);

	const dogCoin = itemData.Items.find(item => item.name === `Dog Coin`);
	const dogCoinResponseWithButtons = paldeck.buildItemResponse(dogCoin, null, `item-owner`);
	const medalMerchantButton = dogCoinResponseWithButtons.components[0].components.find(component => component.data.label === `Medal Merchants`);
	let medalMerchantPayload = null;
	assert(medalMerchantButton, `Dog Coin should include a Medal Merchants button.`);
	await itemCommand.handleButton({
		customId: medalMerchantButton.data.custom_id,
		update: payload => { medalMerchantPayload = payload; },
		user: { id: `item-owner` },
	});
	assert(medalMerchantPayload?.flags === undefined, `Medal Merchant locations should remain visible in the channel.`);
	assert(
		serializeDiscordPayload(medalMerchantPayload).includes(`Desolate Church`) && medalMerchantPayload.files.length === 2,
		`Medal Merchant responses should name fixed locations and attach the item thumbnail and map.`,
	);

	for (const shopTest of [
		{ source: `Bounty Shop`, button: `Bounty Officers`, currency: `Successful Bounty Tokens` },
		{ source: `Arena Merchant`, button: `Arena Merchant`, currency: `Battle Tickets` },
	]) {
		const shopItem = itemData.Items.find(item => item.acquisition?.sources?.some(source => source.type === shopTest.source));
		const response = paldeck.buildItemResponse(shopItem, null, `item-owner`);
		const serialized = serializeDiscordPayload(response);
		const button = response.components[0]?.components.find(component => component.data.label === shopTest.button);
		assert(button && serialized.includes(shopTest.currency), `${shopTest.source} products should show their currency and location button.`);
		assert(!/_(?:Shop|SHOP)_\d+/u.test(serialized), `${shopTest.source} cards must not expose internal shop-table identifiers.`);
		let locationPayload = null;
		const update = payload => {
			locationPayload = payload;
		};
		await itemCommand.handleButton({ customId: button.data.custom_id, update, user: { id: `item-owner` } });
		const locationEmbed = locationPayload.embeds[0].toJSON();
		assert(locationEmbed.title === shopTest.button && !locationEmbed.description &&
			locationEmbed.image && locationPayload.files.length === 2,
		`${shopTest.source} location responses should use a concise map-only embed.`);
	}
	for (const type of [`Caravan Merchants`, `Dungeon Merchant`, `Wandering Merchants`]) {
		const item = itemData.Items.find(value =>
			!value.merchantLocations && value.acquisition?.sources?.some(source => source.type === type));
		const serialized = serializeDiscordPayload(paldeck.buildItemResponse(item, null, `item-owner`));
		assert(serialized.includes(type) && !/_(?:Shop|SHOP)_\d+/u.test(serialized), `${type} must remain readable and hide internal table IDs.`);
	}
	assert(dogCoin.recipes.length === 0, `Medal Merchant purchases must not appear as Dog Coin crafting recipes.`);
}

module.exports = {
	createItemSmokeContext, validateItemAutocomplete, validateDroppingPalLookup, validateItemSourceSearch,
	validateMerchantItemControls, validateSchematicNavigation,
};
