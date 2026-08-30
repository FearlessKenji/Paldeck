const { assert, itemSourcePresentation, path, readJson, serializeDiscordPayload } = require(`./item-shared.js`);

function validateEmbedLimits(item, response) {
	for (const embed of response.embeds.map(value => value.toJSON())) {
		const fields = embed.fields || [];
		const totalLength = (embed.title?.length || 0) + (embed.description?.length || 0) +
			fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
		assert((embed.title?.length || 0) <= 256 && (embed.description?.length || 0) <= 4096 && fields.length <= 25 &&
			fields.every(field => field.name.length <= 256 && field.value.length <= 1024) && totalLength <= 6000,
		`${item.name} exceeds a Discord embed limit.`);
	}
}

function validateSourceDetailPages(item, paldeck, response) {
	const hasSourceDetails = response.components.flatMap(row => row.components)
		.some(component => component.data.label === `Source Details`);
	if (!hasSourceDetails) {
		return;
	}
	for (let page = 0; page < 50; page += 1) {
		const details = paldeck.buildSourceDetailsResponse(item, page);
		const description = details.embeds[0].toJSON().description || ``;
		assert(description.split(`\n`).length <= 17, `${item.name} Source Details page ${page + 1} is too long for mobile.`);
		assert(!/\b(?:Viking\d+|DarkIsland|SkyIsland|technology-book pool|Oilrig(?: Large)? 0?\d)\b|_/iu.test(description),
			`${item.name} Source Details exposes an internal game identifier.`);
		const hasNext = details.components.flatMap(row => row.components).some(component => component.data.label === `Next`);
		if (!hasNext) {
			break;
		}
	}
}

function validateAllItemEmbeds(itemData, paldeck) {
	for (const item of itemData.Items) {
		const response = paldeck.buildItemResponse(item, null, `embed-audit`);
		validateEmbedLimits(item, response);
		validateSourceDetailPages(item, paldeck, response);
	}
}

function validateJournalCollections(fixtures) {
	for (const [index, response] of fixtures.journalResponses.entries()) {
		const payload = serializeDiscordPayload(response);
		const expectedLocation = index ? `Fixed Locations (World Tree) ×1: 9 locations` : `Fixed Locations (Palpagos) ×1: 55 locations`;
		assert(
			payload.includes(`Category:`) && payload.includes(`Collectible`) &&
			payload.includes(`Sources:`) && payload.includes(expectedLocation) &&
			!payload.includes(`N/A`) && !payload.includes(`Weight:`) &&
			!payload.includes(`Maximum Stack:`) && !payload.includes(`Buy Price:`) &&
			!payload.includes(`Sell Price:`) && response.files.length === 2,
			`${index ? `World Tree` : `Palpagos`} Journals should omit inventory-only fields and include a map.`,
		);
	}
}

// The cross-product intentionally audits every item against both special regional chest families.
// eslint-disable-next-line complexity
function validateRegionalChestItem(item, regionalChestRules, chestGrades) {
	for (const [pool, map, location, matchesMarker] of regionalChestRules) {
		if (!item.acquisition?.lootPools?.some(entry => entry.pool === pool)) {
			continue;
		}
		const treasure = item.acquisition.sources?.find(source => source.type === `Treasure`);
		const panels = item.acquisition.mapSources?.maps || (item.acquisition.mapSources?.map ? [item.acquisition.mapSources] : []);
		assert(treasure?.entries.some(entry => entry.location === location), `${item.name} should derive its ${pool} source.`);
		const marker = panels.find(panel => panel.map === map)?.markers?.find(matchesMarker);
		assert(!item.acquisition.map || marker, `${item.name} should derive its ${pool} map markers.`);
		const tier = treasure?.entries.find(entry => entry.lotteryField === pool)?.chestTier;
		assert(!marker || !tier || marker.treasureGrade === chestGrades[tier],
			`${item.name} ${pool} marker should use its ${tier} presentation.`);
	}
}

function validateRegionalChestSources(itemData) {
	const regionalChestRules = [
		[`SkyIsland_Treasure`, `palpagos`, `76 Sunreach chest locations`, marker => marker.href === `SkyIsland_Treasure`],
		[`WorldTree_Treasure`, `worldtree`, `38 World Tree chest locations`, marker => marker.locationSet === `worldTreeTreasureChests`],
	];
	const chestGrades = {
		"Regular Chests": 1, "Bronze Key Chests": 2, "Purple Chests": 3,
		"Silver Chests": 4, "Gold Chests": 5, "Gold Key Chests": 6,
	};
	for (const item of itemData.Items) {
		validateRegionalChestItem(item, regionalChestRules, chestGrades);
	}
	const journalEntries = itemData.Items.filter(item => item.journalEntry);
	assert(
		journalEntries.length === 64 &&
		journalEntries.filter(item => item.journalEntry.region === `palpagos`).length === 55 &&
		journalEntries.filter(item => item.journalEntry.region === `worldtree`).length === 9,
		`All 64 individual journals should remain searchable with the expected regional split.`,
	);
}

function validateIndividualJournals(itemData, fixtures) {
	for (const [index, response] of fixtures.individualJournalResponses.entries()) {
		const payload = serializeDiscordPayload(response);
		const expectedItem = itemData.Items.find(item => item.name === (index ? `Ancient Recorder` : `Bjorn Seligsson's Diary - 1`));
		assert(
			payload.includes(`Category:`) && payload.includes(`Collectible`) && payload.includes(`Sources:`) &&
			payload.includes(index ? `Fixed Location (World Tree)` : `Fixed Location (Palpagos)`) &&
			!payload.includes(`N/A`) && !payload.includes(`Weight:`) && !payload.includes(`Maximum Stack:`) &&
			!payload.includes(`Buy Price:`) && !payload.includes(`Sell Price:`) && response.files.length === 2 &&
			response.embeds[0].toJSON().thumbnail?.url === `attachment://${path.basename(expectedItem.iconUrl)}`,
			`${index ? `World Tree` : `Palpagos`} individual journal should omit inventory fields and include its single-location map.`,
		);
	}
}

function validateGeneralRegionalMaps(context, fixtures) {
	const { itemData, paldeck } = context;
	validateAllItemEmbeds(itemData, paldeck);
	validateJournalCollections(fixtures);
	validateRegionalChestSources(itemData);
	validateIndividualJournals(itemData, fixtures);
}

function validateSpecialRegionalMaps(context, fixtures) {
	const { itemData, paldeck } = context;
	const serializedEffigy = serializeDiscordPayload(fixtures.effigyResponse);

	const serializedBounty = serializeDiscordPayload(fixtures.bountyResponse);

	const serializedRelic = serializeDiscordPayload(fixtures.relicResponse);

	const mappedStandardSpheres = [
		`Pal Sphere`, `Mega Sphere`, `Giga Sphere`, `Hyper Sphere`, `Ultra Sphere`, `Legendary Sphere`, `Ultimate Sphere`,
	].map(name => itemData.Items.find(item => item.name === name));

	assert(
		mappedStandardSpheres.every(item => item?.acquisition?.map && item.acquisition.sources?.length),
		`Every standard regional Sphere should include verified acquisition sources and a map.`,
	);

	for (const sphere of mappedStandardSpheres) {
		const markerTypes = sphere.acquisition.mapSources.markers.map(marker => marker.type);
		assert(
			!markerTypes.some(type => type === `Supply` || /^Salvage Rank/u.test(type)),
			`${sphere.name} should list Supply Drops and Salvage textually without mapping them.`,
		);
	}

	const correctedSchematicMaps = itemData.Items.filter(item =>
		[`Grenade Launcher Schematic 1`, `Grenade Launcher Schematic 2`, `Grenade Launcher Schematic 3`, `Grenade Launcher Schematic 4`, `Beginner Fishing Rod (Gumoss) Schematic`].includes(item.name),
	);

	assert(
		correctedSchematicMaps.every(item => item.acquisition?.map && item.acquisition.mapSources?.map === `palpagos` &&
			item.acquisition.mapSources.markers?.length && item.acquisition.mapSources.unpinnedSources?.length),
		`Corrected schematic cards should map fixed sources and disclose intentionally unpinned source types.`,
	);

	assert(
		correctedSchematicMaps.every(item => !item.acquisition.mapSources.markers.some(marker =>
			marker.type === `Supply` || /^Salvage Rank/u.test(marker.type))),
		`Supply Drops and Salvage must remain textual instead of receiving map pins.`,
	);

	assert(
		correctedSchematicMaps.every(item => paldeck.buildItemResponse(item, null, `corrected-map-owner`).files.length === 2),
		`Every corrected schematic card should attach its thumbnail and source map.`,
	);

	const gumossRodSchematic = correctedSchematicMaps.find(item => item.name === `Beginner Fishing Rod (Gumoss) Schematic`);

	assert(
		gumossRodSchematic.acquisition.mapSources.markers.some(marker => marker.type === `Fishing Spot`) &&
		gumossRodSchematic.acquisition.mapSources.markers.some(marker => marker.type === `Rare Fishing Spot`) &&
		itemSourcePresentation({ type: `Fishing Spot` }).color === `#0ea5e9` &&
		itemSourcePresentation({ type: `Rare Fishing Spot` }).color === `#22d3ee` &&
		gumossRodSchematic.acquisition.mapSources.unpinnedSources?.join() === `Fishing Ponds,Salvage Rank1`,
		`The Gumoss fishing-rod schematic should map eligible natural fishing spots while leaving buildable ponds and salvage unpinned.`,
	);

	const fishingSpotItems = itemData.Items.filter(item =>
		(item.acquisition?.lootPools || []).some(pool => /_Fishing$/u.test(pool.pool)));
	assert(
		fishingSpotItems.every(item => (item.acquisition.mapSources?.maps || [item.acquisition.mapSources])
			.filter(Boolean).some(panel => (panel.markers || []).some(marker => marker.type === `Fishing Spot` || marker.type === `Rare Fishing Spot`))),
		`Every item obtainable from a natural fishing spot should include eligible fishing-spot markers on its map.`,
	);

	const elementalChestItems = itemData.Items.filter(item =>
		(item.acquisition?.lootPools || []).some(pool => pool.category === `Elemental Chests`));
	assert(
		elementalChestItems.every(item => {
			const pools = item.acquisition.lootPools.filter(pool => pool.category === `Elemental Chests`);
			const panels = item.acquisition.mapSources?.maps || [item.acquisition.mapSources];
			const markers = panels.filter(Boolean).flatMap(panel => panel.markers || []);
			const mappedRegions = new Set(markers.filter(marker => marker.type === `Treasure Element`)
				.flatMap(marker => (Array.isArray(marker.href) ? marker.href : [marker.href]).map(href =>
					href?.replace(/^Treasure_Element_/u, ``) || {
						sunreachElementalTreasureChests: `SkyIsland`,
						worldTreeElementalTreasureChests: `WorldTree`,
					}[marker.locationSet])));
			const mapped = pools.every(pool => {
				const region = pool.pool.match(/^(.+?)_(?:Electric|Fire|Water)Treasure$/u)?.[1];
				return mappedRegions.has(region);
			});
			return mapped;
		}),
		`Every elemental-chest source should use its coordinate-backed elemental chest pins.`,
	);

	const oilRigLegendType = pool => {
		if (pool.pool.includes(`_Large_`)) {
			return `Southwest Oil Rig`;
		}
		if (pool.pool.includes(`_Mini_`)) {
			return `Small Oil Rig`;
		}
		return `East Oil Rig`;
	};
	const oilRigItems = itemData.Items.filter(item =>
		(item.acquisition?.lootPools || []).some(pool => pool.category === `Oil Rigs`));
	assert(
		oilRigItems.length === 278 && oilRigItems.every(item => {
			const expected = new Set(item.acquisition.lootPools.filter(pool => pool.category === `Oil Rigs`).map(oilRigLegendType));
			const markers = (item.acquisition.mapSources?.maps || [item.acquisition.mapSources]).filter(Boolean)
				.flatMap(panel => panel.markers || []);
			return [...expected].every(type => markers.some(marker => marker.legendType === type)) &&
				!markers.some(marker => marker.type === `Oilrig Treasure Goal` && !marker.legendType);
		}),
		`All 278 Oil Rig item cards should use specific Small, East, or Southwest map-pin rules.`,
	);

	return { serializedBounty, serializedEffigy, serializedRelic };
}

function validateRegionalItemMaps(context, fixtures) {
	const locationData = readJson(`data`, `installedLocationData.json`);
	const locationClasses = Object.entries(locationData.classes || {});
	assert(
		locationData.buildId === `24575825` && locationData.packageFailures === 0 && locationClasses.length === 154 &&
		locationClasses.reduce((count, [, actors]) => count + actors.length, 0) === 47515 &&
		locationData.classes.BP_PalMapObjectSpawner_Treasure_Element_SkyIsland_C.length === 8 &&
		locationData.classes.BP_PalMapObjectSpawner_Treasure_WorldTree_C.length === 38,
		`Installed location data should retain the complete build-keyed placed-actor extraction.`,
	);
	validateGeneralRegionalMaps(context, fixtures);
	return validateSpecialRegionalMaps(context, fixtures);
}

function validateTreasureMapSourceCards(context) {
	const { itemData, paldeck } = context;
	const legendaryTreasureMap = itemData.Items.find(item => item.code === `Items/TreasureMap05`);

	const legendaryTreasureMapSources = paldeck.buildItemResponse(legendaryTreasureMap, null, `item-owner`)
		.embeds[0].toJSON().fields.find(field => field.name === `Sources:`)?.value;

	assert(
		[`Dungeons ×1: 10.101%`, `Enemy Camps ×1: up to 100%`, `Salvage ×1: 0.118%`, `Gold Chests ×1`]
			.every(value => legendaryTreasureMapSources.includes(value)) &&
			!/_|Viking\d|technology-book/iu.test(legendaryTreasureMapSources),
		`Legendary Treasure Map sources should retain exact chances without exposing internal pool identifiers.`,
	);

	const tieredTreasureMaps = itemData.Items.filter(item => /^Items\/TreasureMap0[1-4]$/u.test(item.code));

	assert(
		tieredTreasureMaps.length === 4 && tieredTreasureMaps.every(item =>
			/^data\/item-maps\/[a-z0-9-]+\.png$/u.test(item.acquisition?.map || ``) &&
			item.acquisition.mapSources.markers.some(marker => marker.type === `Treasure`) &&
			item.acquisition.mapSources.markers.some(marker => marker.type === `Enemy Camp`) &&
			item.acquisition.mapSources.markers.some(marker => marker.type === `Dungeon`)),
		`Treasure Maps 1-4 should use tier-specific acquisition-source maps rather than the shared destination map.`,
	);

	assert(
		/^data\/item-maps\/[a-z0-9-]+\.png$/u.test(legendaryTreasureMap?.acquisition?.map || ``) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => marker.RewardName === `Sakurajima1`) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => Array.isArray(marker.RewardName) && marker.RewardName.includes(`SeaBase_Yamijima_1`)) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => marker.Spawn === `DarkIsland02`) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => marker.Spawn === `SkyIsland_Treasure`) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => marker.RewardName === `Viking1`) &&
		legendaryTreasureMap.acquisition.mapSources.markers.some(marker => marker.type === `Dungeon` && marker.item === `Feybreak Cavern`) &&
		legendaryTreasureMap.acquisition.mapSources.unpinnedSources?.join() === `Salvage Rank2`,
		`The Legendary Treasure Map should map every coordinate-backed loot pool while leaving only salvage unpinned.`,
	);
}

function validateTreasureMapLootCards(itemData) {
	const treasureMapLoot = itemData.Items.filter(item => item.acquisition?.sources?.some(source => source.type === `Treasure Maps`));

	assert(
		treasureMapLoot.length === 245 && treasureMapLoot.every(item =>
			item.acquisition.sources.find(source => source.type === `Treasure Maps`).entries.every(entry =>
				/^(?:Common|Uncommon|Rare|Epic|Legendary) Treasure Map$/u.test(entry.location) &&
				/^\d+(?:\.\d+)?%$/u.test(entry.probability)) &&
			[
				...(item.acquisition.mapSources?.markers || []),
				...(item.acquisition.mapSources?.maps || []).flatMap(source => source.markers || []),
			]
				.every(marker => marker.legendType !== `Treasure Map`)),
		`Treasure Map loot cards should retain exact probabilities without mapping the source of the intermediary map.`,
	);
}

function validateRegionalSummaryCards(regionalSummaries) {
	const { serializedBounty, serializedEffigy } = regionalSummaries;
	const generationRules = require(`../../data/mapGenerationRules.json`);
	assert(
		generationRules.schemaVersion === 1 && generationRules.naming.singleItemSuffix === `locations` &&
		generationRules.naming.sharedMapSuffix === `sources` &&
		itemSourcePresentation({ type: `Treasure Map` }).color === `#d4af37` &&
		itemSourcePresentation({ type: `Small Oil Rig` }).style === `outlined` &&
		itemSourcePresentation({ type: `East Oil Rig` }).style === `diamond` &&
		itemSourcePresentation({ type: `Southwest Oil Rig` }).style === `special` &&
		itemSourcePresentation({ type: `Ancient Ruin` }).style === `special` &&
		itemSourcePresentation({ type: `Ore Cluster` }).style === `special` &&
		itemSourcePresentation({ type: `Dungeon` }).style === `diamond`,
		`Item source maps should use the standardized Treasure Map, Oil Rig, and Dungeon presentation.`,
	);

	assert(
		serializedEffigy.includes(`Sources:`) &&
		serializedEffigy.includes(`Effigy Locations (Palpagos) ×1: 140 locations`) &&
		serializedEffigy.includes(`Effigy Locations (World Tree) ×1: 15 locations`),
		`Cross-map Effigy cards should use qualified counts for both map panels.`,
	);

	assert(
		serializedBounty.includes(`33 fixed targets`) && serializedBounty.includes(`Elder`),
		`Bounty Tokens should map fixed targets and disclose the unpinned Elder source.`,
	);
}

function validateTreasureMapItems(context, regionalSummaries) {
	validateTreasureMapSourceCards(context);
	validateTreasureMapLootCards(context.itemData);
	validateRegionalSummaryCards(regionalSummaries);
}

function validateTowerAndMappedItems(context, fixtures, regionalSummaries) {
	const { serializedRelic } = regionalSummaries;
	const expectedTowerReward = `Tower Boss (Zoe & Grizzbolt, Normal, first clear only) ×1: 100%`;

	assert(serializeDiscordPayload(fixtures.keySphereResponse).includes(expectedTowerReward),
		`Key Spheres should identify their guaranteed Normal first-clear tower reward.`);

	assert(serializeDiscordPayload(fixtures.skillFruitResponse).includes(`not guaranteed`), `Skill Fruit cards should disclose that regional tree drops are possible rather than guaranteed.`);

	assert(
		serializedRelic.includes(`Sources:`) && serializedRelic.includes(`Fishing`) && serializedRelic.includes(`Junk`),
		`World Tree pool items should summarize verified fishing and junk sources.`,
	);

	const mappedResponses = [
		fixtures.ominousEggResponse, fixtures.peachResponse, fixtures.treasureMapResponse,
		fixtures.ruinSchematicResponse, fixtures.ancientBoneResponse,
		fixtures.ancientBarkResponse, fixtures.ancientLavaResponse, fixtures.coalResponse, fixtures.effigyResponse, fixtures.bountyResponse,
		fixtures.keySphereResponse, fixtures.skillFruitResponse, fixtures.relicResponse,
		...fixtures.journalResponses, ...fixtures.individualJournalResponses,
	];

	for (const response of mappedResponses) {
		assert(response.files.length === 2 && !response.embeds[0].toJSON().image &&
			response.embeds[1].toJSON().image?.url?.startsWith(`attachment://`), `Limited-location item cards should attach their map in a separate embed.`);
	}
}

function validateTreasureAndTowerItems(context, fixtures, regionalSummaries) {
	validateTreasureMapItems(context, regionalSummaries);
	validateTowerAndMappedItems(context, fixtures, regionalSummaries);
}

module.exports = { validateRegionalItemMaps, validateTreasureAndTowerItems };
