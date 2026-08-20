const {
	UNAVAILABLE_ITEM_IDS, assert, itemDescriptionParts, needsAvailabilityReview,
	normalizeItemDescription, path, shouldHideItem,
} = require(`./item-shared.js`);
const implantPassives = require(`../../data/implantPassives.json`);

function validateItemDescriptions(context) {
	const { availabilityManifest, itemData } = context;
	const searchableItems = itemData.Items.filter(item =>
		item.searchable !== false && !/^\s*\[WIP\]/i.test(item.description || ``),
	);

	assert(
		itemData.Items.every(item => !item.acquisition?.mapSources?.maps ||
			new Set(item.acquisition.mapSources.maps.map(source => source.map)).size === item.acquisition.mapSources.maps.length),
		`Multi-panel item maps should contain at most one panel per physical region.`,
	);

	assert(searchableItems.every(item => String(item.description || ``).trim()), `Every searchable item should have a user-facing description.`);

	for (const item of searchableItems) {
		const description = normalizeItemDescription(item.description, { formatEffects: true });
		const parts = itemDescriptionParts(item.description);
		assert(
			!(/\s+[,.!?;:]|\s+'s\b|\b[A-Za-z]+ s\b|[ \t]{2,}/u.test(description)),
			`${item.name}: rendered description should not contain spacing or punctuation artifacts.`,
		);
		assert(
			parts.perks.every(perk => !parts.description.includes(perk)),
			`${item.name}: recognized perks should not remain in description prose.`,
		);
	}

	const descriptionCases = [
		[`Metal Axe`, `Logging Yield Up Lv. 1`],
		[`Metal Pickaxe`, `Mining Yield Up Lv. 1`],
		[`Attack Support Whistle`, `Pal Attack Up Lv. 3`],
		[`Defense Support Whistle`, `Pal Defense Up Lv. 3`],
		[`Growth Acceleration Bell`, `Pal EXP Up Lv. 3`],
	];

	for (const [name, perk] of descriptionCases) {
		const parts = itemDescriptionParts(itemData.Items.find(item => item.name === name).description);
		assert(parts.perks.includes(perk) && !/\b(?:Logging|Mining|Pal)$/u.test(parts.description), `${name}: full perk label should move out of description prose.`);
	}

	for (const name of [`Incendiary Grenade`, `Ice Grenade`, `Metal Spear`, `Refined Metal Spear`, `Refined Metal Axe`, `Helmet`]) {
		const item = itemData.Items.find(candidate => candidate.name === name);
		const description = itemDescriptionParts(item.description).description;
		assert(!/\bA (?:Incendiary|Ice)\b|\btip give\b|\bdurability has improved\b|\ba Eikthyrdeer\b/u.test(description), `${name}: confirmed localization grammar should be repaired at render time.`);
	}

	assert(itemData.Items.every(item => !String(item.description || ``).includes(`|`)), `Item descriptions should not expose upstream pipe delimiters.`);

	assert(
		itemData.Items.filter(item => /^[a-z]{2}[_ ]text$/iu.test(String(item.description || ``).trim())).every(item => item.searchable === false),
		`Placeholder localization records such as Silicon should remain hidden from lookup.`,
	);

	assert(UNAVAILABLE_ITEM_IDS.size === availabilityManifest.items.filter(item => [`unused`, `unreleased`, `superseded`].includes(item.status)).length,
		`The unavailable-item registry should include every versioned hidden definition.`);

	assert(
		itemData.Items
			.filter(item => /^blueprint-head(?:00[1-9]|01[0-7])-5$/u.test(item.id))
			.every(item => item.searchable === false),
		`All 17 localized but unimplemented legendary headwear blueprints should remain hidden from lookup.`,
	);

	assert(
		itemData.Items.filter(shouldHideItem).every(item => item.searchable === false),
		`Unreleased, superseded, WIP, and unresolved item definitions should remain hidden from lookup.`,
	);

	assert(
		!itemData.Items.some(needsAvailabilityReview),
		`A hidden item with finished localization and a real acquisition signal should require implementation review.`,
	);
	return searchableItems;
}

function validateSchematicRecipes(context, searchableItems) {
	const { itemData, paldeck } = context;
	let displayedSchematicCombinationCount = 0;

	const undisplayedSchematicCombinations = [];

	for (const item of searchableItems.filter(candidate => candidate.category === `Schematic`)) {
		const fields = paldeck.buildItemResponse(item, null, `schematic-owner`).embeds[0].toJSON().fields || [];
		const craftingText = fields.filter(field => field.name.startsWith(`Schematic Recipe`)).map(field => field.value).join(`\n`);
		if (/ Schematic(?: [1-4])? ×5/u.test(craftingText)) {
			displayedSchematicCombinationCount += 1;
		} else if (item.recipes.some(recipe => recipe.ingredients?.some(ingredient =>
			/ Schematic(?: [1-4])?$/u.test(ingredient.name) && Number(ingredient.quantity) === 5))) {
			undisplayedSchematicCombinations.push(item.name);
		}
		const unlockedItem = item.name.replace(/ Schematic(?: \d+)?$/u, ``);
		const equipmentRows = item.recipes.filter(recipe => recipe.ingredients?.some(ingredient => ingredient.name === unlockedItem));
		assert(
			!craftingText || fields.some(field => /^Schematic Recipes? \(Drafting Table\):$/u.test(field.name)),
			`${item.name}: every displayed schematic combination recipe should use the Drafting Table.`,
		);
		assert(
			equipmentRows.every(recipe => !recipe.ingredients.every(ingredient => craftingText.includes(`${ingredient.name} ×${ingredient.quantity}`))),
			`${item.name}: schematic cards should not include equipment-upgrade recipes.`,
		);
	}

	assert(
		displayedSchematicCombinationCount > 0 && !undisplayedSchematicCombinations.length,
		`Every searchable game-backed schematic combination should render; found ${displayedSchematicCombinationCount}; missing ${undisplayedSchematicCombinations.join(`, `)}.`,
	);

	const schematicCombinationExamples = [
		[`Lightweight Ancient Armor Schematic 1`, false],
		[`Lightweight Ancient Armor Schematic 2`, true],
		[`Excalibur Schematic 1`, true],
	];

	for (const [name, hasGameCombination] of schematicCombinationExamples) {
		const item = searchableItems.find(candidate => candidate.name === name);
		assert(item, `${name}: game-file schematic regression fixture should exist.`);
		const fields = paldeck.buildItemResponse(item, null, `schematic-tier-owner`).embeds[0].toJSON().fields || [];
		const lowerTier = item.name.replace(/ (\d)$/u, (_match, tier) => Number(tier) === 1 ? `` : ` ${Number(tier) - 1}`);
		const craftingText = fields.filter(field => field.name.startsWith(`Schematic Recipe`)).map(field => field.value).join(`\n`);
		assert(craftingText.includes(`${lowerTier} ×5`) === hasGameCombination, `${item.name}: combination availability should match the current game recipe table.`);
		assert(
			fields.some(field => /^Schematic Recipes? \(Drafting Table\):$/u.test(field.name)) === hasGameCombination &&
			!fields.some(field => field.name === `Workbench:`),
			`${item.name}: only game-backed schematic combinations should show the Drafting Table.`,
		);
	}

	assert(
		itemData.Items.filter(item => item.category === `Schematic` && Number(item.properties?.bLegalInGame ?? 0) === 0)
			.every(item => item.searchable === false),
		`Every game-disabled schematic should remain hidden from lookup.`,
	);
}

function validateAncientRelicSources(context) {
	const { itemData, paldeck } = context;
	const relicBackedItems = itemData.Items.filter(item => item.searchable !== false &&
		item.acquisition?.lootPools?.some(pool => /^AncientRelicRecycler_/u.test(pool.pool)));

	assert(
		relicBackedItems.length && relicBackedItems.every(item => item.acquisition.sources?.some(source => source.type === `Ancient Relics`)),
		`Every visible item backed by a decoded Ancient Relic recycler pool should identify that source.`,
	);

	const disposableEternalEngine = itemData.Items.find(item => item.code === `Items/PalPassiveSkillChange_Consumable_Stamina_Up_3`);
	const infiniteStamina = itemData.Items.find(item => item.code === `Items/PalPassiveSkillChange_Stamina_Up_1`);
	assert(
		disposableEternalEngine?.acquisition?.sources?.some(source => source.type === `Ancient Relics`) &&
		disposableEternalEngine.acquisition.lootPools?.length === 5,
		`Disposable Implant: Eternal Engine should retain all five decoded Ancient Relic pools.`,
	);
	assert(
		infiniteStamina?.acquisition?.sources?.some(source => source.type === `Arena Merchant`) &&
		!infiniteStamina.acquisition.sources.some(source => source.type === `Ancient Relics`),
		`Implant: Infinite Stamina should not inherit the similarly named disposable relic reward.`,
	);

	const ancientManual = itemData.Items.find(item => item.name === `Ancient Technical Manual`);

	const ancientManualSources = paldeck.buildItemResponse(ancientManual, null, `relic-probability-owner`)
		.embeds[0].toJSON().fields.find(field => field.name === `Sources:`)?.value;

	assert(
		[`Decayed Ancient Relic) ×1: 0.07%`, `Dormant Ancient Relic) ×1: 0.084%`,
			`Gorgeous Ancient Relic) ×1: 0.101%`, `Glowing Ancient Relic) ×1: 0.121%`,
			`Glistening Ancient Relic) ×1: 0.145%`].every(value => ancientManualSources?.includes(value)),
		`Ancient Technical Manual should show combined per-recycling chances for every Ancient Relic tier.`,
	);

	const lightweightLegendary = itemData.Items.find(item => item.name === `Lightweight Ancient Armor Schematic 4`);
	const lightweightSources = paldeck.buildItemResponse(lightweightLegendary, null, `relic-rounding-owner`)
		.embeds[0].toJSON().fields.find(field => field.name === `Sources:`)?.value;
	assert(
		lightweightSources?.includes(`Ancient Relic Recycler (Decayed Ancient Relic) ×1: <0.001%`),
		`Positive Ancient Relic chances below the normal precision should remain visible.`,
	);
}

function validatePalReverserMap(context) {
	const { itemData, paldeck } = context;
	const palReverser = itemData.Items.find(item => item.name === `Pal Reverser`);

	assert(
		palReverser.acquisition?.mapSources?.markers?.some(marker => marker.type === `Enemy Camp`) &&
		/^data\/item-maps\/[a-z0-9-]+\.png$/u.test(palReverser.acquisition.map),
		`Pal Reverser should map its decoded Enemy Camp availability.`,
	);

	const palReverserResponse = paldeck.buildItemResponse(palReverser, null, `pal-reverser-map-preview-owner`);

	assert(
		palReverserResponse.embeds.length === 2 &&
		!palReverserResponse.embeds[0].toJSON().image &&
		palReverserResponse.embeds[1].toJSON().image?.url === `attachment://${path.basename(palReverser.acquisition.map)}` &&
		!palReverserResponse.embeds[1].toJSON().title &&
		palReverserResponse.embeds[1].toJSON().color === palReverserResponse.embeds[0].toJSON().color,
		`Pal Reverser should preview its Enemy Camp map in a separate embed without constraining the item card.`,
	);
}

function validateCuratedRegionalSourceMaps(itemData) {
	for (const name of [`Gold Coin`, `Medical Supplies`, `Training Manual (L)`, `High Quality Bait`]) {
		const item = itemData.Items.find(candidate => candidate.name === name);
		const markers = [
			...(item.acquisition?.mapSources?.markers || []),
			...(item.acquisition?.mapSources?.maps || []).flatMap(source => source.markers || []),
		];
		assert(item.acquisition?.map && markers.length &&
			!markers.some(marker => /^Salvage/u.test(marker.type)), `${name}: regional source map should exclude broad salvage pools.`);
	}
}

function validateUnmappedSchematics(paldeck, searchableItems) {
	for (const item of searchableItems.filter(candidate => candidate.category === `Schematic` && !candidate.acquisition && !candidate.merchantLocations)) {
		const fields = paldeck.buildItemResponse(item, null, `schematic-source-owner`).embeds[0].toJSON().fields || [];
		assert(
			fields.some(field => field.name === `Sources:` && field.value === `No verified non-crafting source is recorded.`),
			`${item.name}: missing acquisition coverage should be disclosed without claiming the schematic is unobtainable.`,
		);
	}
}

function validateRelicAndSchematicMaps(context, searchableItems) {
	validateAncientRelicSources(context);
	validatePalReverserMap(context);
	validateCuratedRegionalSourceMaps(context.itemData);
	validateUnmappedSchematics(context.paldeck, searchableItems);
}

function validateImplantPassives(context) {
	const implants = context.itemData.Items.filter(item => item.searchable !== false &&
		[`ConsumePassiveSkillChange`, `Essential_PassiveSkillChange`].includes(item.properties?.typeB));
	assert(implants.length === Object.keys(implantPassives).length,
		`Every searchable implant should have exactly one installed passive mapping.`);
	for (const item of implants) {
		const passive = implantPassives[item.code.split(`/`).at(-1)];
		const fields = context.paldeck.buildItemResponse(item, null, `implant-passive-owner`).embeds[0].toJSON().fields || [];
		assert(passive && fields.some(field => field.name === `Granted Passive:` && field.value === passive),
			`${item.name}: item card should identify its granted passive.`);
	}
}

function validateSchematicAndRelicItems(context, searchableItems) {
	validateSchematicRecipes(context, searchableItems);
	validateRelicAndSchematicMaps(context, searchableItems);
	validateImplantPassives(context);
}

function requiresCardConsistencyCheck(item) {
	return (item.acquisition || (item.recipes || []).length > 1) &&
		!item.journalEntry && ![`palpagos-journals`, `world-tree-journals`].includes(item.id);
}

function validateSingleCardConsistency(paldeck, item) {
	const response = paldeck.buildItemResponse(item, null, `consistency-owner`);
	const fields = response.embeds[0].toJSON().fields || [];
	const leadingFields = fields.slice(0, 7).map(field => field.name);

	assert(
		JSON.stringify(leadingFields.slice(0, 6)) === JSON.stringify([
			`Category:`, `Weight:`, `\u200b`, `Buy Price:`, `Sell Price:`, `\u200b`,
		]) && !fields.some(field => field.name === `Maximum Stack:`) &&
			(!fields.some(field => field.name === `Ammo Type:`) || leadingFields[6] === `Ammo Type:`),
		`${item.name}: item summary fields should use the compact canonical order.`,
	);

	if (item.acquisition) {
		assert(
			fields.filter(field => field.name === `Sources:`).length === 1 &&
					!fields.some(field => field.name === `Source:` || field.name.includes(`Source —`)),
			`${item.name}: acquisition data should render in exactly one Sources field.`,
		);
		if (item.acquisition.map) {
			assert(
				response.embeds.length === 2 && !response.embeds[0].toJSON().image &&
					response.embeds[1].toJSON().image?.url === `attachment://${path.basename(item.acquisition.map)}` &&
					response.embeds[1].toJSON().color === response.embeds[0].toJSON().color,
				`${item.name}: mapped item cards should use a separate image-only embed with the matching rarity accent.`,
			);
		}
	}

	const unlockedItem = item.category === `Schematic` ? item.name.replace(/ Schematic(?: \d+)?$/u, ``) : null;
	const visibleRecipeCount = (item.recipes || []).filter(recipe =>
		!unlockedItem || !recipe.ingredients?.some(ingredient => ingredient.name === unlockedItem),
	).length;
	if (visibleRecipeCount > 1) {
		assert(
			fields.some(field => field.name === (item.category === `Schematic` ? `Schematic Recipes (Drafting Table):` : `Crafting Recipes:`)),
			`${item.name}: alternate recipes should render in a Crafting Recipes field.`,
		);
	}
}

function validateCardFieldConsistency(context, searchableItems) {
	for (const item of searchableItems.filter(requiresCardConsistencyCheck)) {
		validateSingleCardConsistency(context.paldeck, item);
	}
}

function validateJournalCardConsistency(context, searchableItems) {
	const { paldeck } = context;
	const journals = searchableItems.filter(item =>
		item.journalEntry || [`palpagos-journals`, `world-tree-journals`].includes(item.id),
	);

	assert(journals.length === 66, `All individual and collection journal cards should be covered.`);

	for (const journal of journals) {
		const fields = paldeck.buildItemResponse(journal, null, `journal-owner`).embeds[0].toJSON().fields || [];
		assert(
			JSON.stringify(fields.map(field => field.name)) === JSON.stringify([`Category:`, `Sources:`]),
			`${journal.name}: journal cards should omit inventory-only and spacer fields.`,
		);
		assert(
			!fields.find(field => field.name === `Sources:`)?.value.startsWith(`Locations\n`),
			`${journal.name}: Sources should omit the redundant Locations type label.`,
		);
	}
}

function validateItemCardConsistency(context, searchableItems) {
	validateCardFieldConsistency(context, searchableItems);
	validateJournalCardConsistency(context, searchableItems);
	for (const item of searchableItems) {
		const response = context.paldeck.buildItemResponse(item, null, `123456789012345678`);
		const controls = response.components.flatMap(row => row.components);
		assert(controls.every(control => !control.data.custom_id || control.data.custom_id.length <= 100),
			`${item.name}: item navigation custom IDs must fit Discord's 100-character limit.`);
		assert(response.components.every(row => row.components.length <= 5),
			`${item.name}: item navigation rows must fit Discord's five-component limit.`);
	}
}

module.exports = { validateItemDescriptions, validateSchematicAndRelicItems, validateItemCardConsistency };
