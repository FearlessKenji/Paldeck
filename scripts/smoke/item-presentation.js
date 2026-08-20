const { assert, fs, itemSourcePresentation, path, resolveProject, serializeDiscordPayload, sourceText } = require(`./item-shared.js`);

function createCoreItemFixtures(context) {
	const { itemData, paldeck } = context;
	const assaultRifle = itemData.Items.find(item => item.name === `Assault Rifle` && item.rarity === `Common`);

	const rifleAmmo = itemData.Items.find(item => item.name === `Rifle Ammo`);

	const attackPendant = itemData.Items.find(item => item.name === `Attack Pendant`);

	const memoryWipingMedicine = itemData.Items.find(item => item.name === `Memory Wiping Medicine`);

	const bellanoirFragment = itemData.Items.find(item => item.name === `Bellanoir's Slab Fragment`);

	const epicTreasureMap = itemData.Items.find(item => item.name === `Treasure Map` && item.rarity === `Epic`);

	const serializedRifle = serializeDiscordPayload(paldeck.buildItemResponse(assaultRifle, null, `item-owner`));

	const rifleAmmoFields = paldeck.buildItemResponse(rifleAmmo, null, `item-owner`).embeds[0].toJSON().fields;

	const accessoryResponse = paldeck.buildItemResponse(attackPendant, null, `item-owner`);

	const serializedAccessory = serializeDiscordPayload(accessoryResponse);

	const serializedMedicine = serializeDiscordPayload(paldeck.buildItemResponse(memoryWipingMedicine, null, `item-owner`));

	const ancientWeapon = itemData.Items.find(item => item.name === `Mechanical Bow` && item.rarity === `Common`);

	const ancientIngot = itemData.Items.find(item => item.name === `Paloxite Ingot`);

	const ancientFood = itemData.Items.find(item => item.name === `Special Cake`);

	const serializedAncientWeapon = serializeDiscordPayload(paldeck.buildItemResponse(ancientWeapon, null, `item-owner`));

	const serializedAncientIngot = serializeDiscordPayload(paldeck.buildItemResponse(ancientIngot, null, `item-owner`));

	const serializedAncientFood = serializeDiscordPayload(paldeck.buildItemResponse(ancientFood, null, `item-owner`));

	const accessoryEffect = accessoryResponse.embeds[0].toJSON().fields.find(field => field.name === `Accessory Effect:`);

	const fragmentResponse = paldeck.buildItemResponse(bellanoirFragment, null, `item-owner`);

	const serializedFragment = serializeDiscordPayload(fragmentResponse);

	const epicTreasureMapResponse = paldeck.buildItemResponse(epicTreasureMap, null, `item-owner`);

	const serializedEpicTreasureMap = serializeDiscordPayload(epicTreasureMapResponse);

	const serializedSlab = serializeDiscordPayload(paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Xenolord Slab`), null, `item-owner`));

	const ominousEggResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ominous Egg`), null, `item-owner`);

	const peachResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Kinship Peach`), null, `item-owner`);

	const treasureMapResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Treasure Map`), null, `item-owner`);

	const ruinSchematicResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Pelt Armor Schematic 3`), null, `item-owner`);

	const musketSchematic3 = itemData.Items.find(item => item.name === `Musket Schematic 3`);

	const musketSchematic3Response = paldeck.buildItemResponse(musketSchematic3, null, `item-owner`);

	const ancientBoneResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Bone`), null, `item-owner`);

	const ancientBarkResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Bark`), null, `item-owner`);

	const ancientLavaResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Lava`), null, `item-owner`);

	const dogCoinResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Dog Coin`), null, `item-owner`);

	const singleSalvageResponse = paldeck.buildItemResponse(
		itemData.Items.find(item => item.name === `Beginner Fishing Rod (Gumoss) Schematic`),
		null,
		`item-owner`,
	);
	return {
		assaultRifle, rifleAmmo, attackPendant, memoryWipingMedicine, bellanoirFragment,
		epicTreasureMap, serializedRifle, rifleAmmoFields, accessoryResponse, serializedAccessory,
		serializedMedicine, ancientWeapon, ancientIngot, ancientFood, serializedAncientWeapon,
		serializedAncientIngot, serializedAncientFood, accessoryEffect, fragmentResponse, serializedFragment,
		epicTreasureMapResponse, serializedEpicTreasureMap, serializedSlab, ominousEggResponse, peachResponse,
		treasureMapResponse, ruinSchematicResponse, musketSchematic3, musketSchematic3Response, ancientBoneResponse,
		ancientBarkResponse, ancientLavaResponse, dogCoinResponse, singleSalvageResponse,
	};
}

function createMappedItemFixtures(context, coreFixtures) {
	const { itemData, paldeck } = context;
	const ancientSphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Sphere`), null, `item-owner`);

	const solSphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Sol Sphere`), null, `item-owner`);

	const coalResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Coal`), null, `item-owner`);

	const effigyResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Lifmunk Effigy`), null, `item-owner`);

	const bountyResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Successful Bounty Token`), null, `item-owner`);

	const keySphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Key Sphere of Envy`), null, `item-owner`);

	const skillFruitResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ground Skill Fruit: Sand Tornado`), null, `item-owner`);

	const relicResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Glistening Ancient Relic`), null, `item-owner`);

	const journalResponses = [`Palpagos Journals`, `World Tree Journals`]
		.map(name => paldeck.buildItemResponse(itemData.Items.find(item => item.name === name), null, `item-owner`));

	const individualJournalResponses = [`Bjorn Seligsson's Diary - 1`, `Ancient Recorder`]
		.map(name => paldeck.buildItemResponse(itemData.Items.find(item => item.name === name), null, `item-owner`));

	const serializedOminousEgg = serializeDiscordPayload(coreFixtures.ominousEggResponse);

	const serializedPeach = serializeDiscordPayload(coreFixtures.peachResponse);

	const serializedRuinSchematic = serializeDiscordPayload(coreFixtures.ruinSchematicResponse);

	const serializedAncientBone = serializeDiscordPayload(coreFixtures.ancientBoneResponse);

	const serializedAncientBark = serializeDiscordPayload(coreFixtures.ancientBarkResponse);

	const serializedAncientLava = serializeDiscordPayload(coreFixtures.ancientLavaResponse);

	const serializedDogCoin = serializeDiscordPayload(coreFixtures.dogCoinResponse);

	const serializedSingleSalvage = serializeDiscordPayload(coreFixtures.singleSalvageResponse);

	const serializedAncientArmorSchematic = serializeDiscordPayload(paldeck.buildItemResponse(
		itemData.Items.find(item => item.name === `Lightweight Ancient Armor Schematic 3`),
		null,
		`item-owner`,
	));

	const legendaryAncientArmorResponse = paldeck.buildItemResponse(
		itemData.Items.find(item => item.name === `Lightweight Ancient Armor` && item.rarity === `Legendary`),
		null,
		`item-owner`,
	);

	const uncommonAncientArmorResponse = paldeck.buildItemResponse(
		itemData.Items.find(item => item.name === `Lightweight Ancient Armor` && item.rarity === `Uncommon`),
		null,
		`item-owner`,
	);

	const serializedAncientSphere = serializeDiscordPayload(ancientSphereResponse);

	const serializedSolSphere = serializeDiscordPayload(solSphereResponse);

	const slabItems = itemData.Items.filter(item => /\bSlab(?: Fragment)?$/i.test(item.name));

	const obtainableSlabItems = slabItems.filter(item => !/\(Ultra\) Slab Fragment$/i.test(item.name));

	const unusedUltraFragments = slabItems.filter(item => /\(Ultra\) Slab Fragment$/i.test(item.name));
	return {
		ancientSphereResponse, solSphereResponse, coalResponse, effigyResponse, bountyResponse,
		keySphereResponse, skillFruitResponse, relicResponse, journalResponses, individualJournalResponses,
		serializedOminousEgg, serializedPeach, serializedRuinSchematic, serializedAncientBone, serializedAncientBark,
		serializedAncientLava, serializedDogCoin, serializedSingleSalvage, serializedAncientArmorSchematic, legendaryAncientArmorResponse,
		uncommonAncientArmorResponse, serializedAncientSphere, serializedSolSphere, slabItems, obtainableSlabItems,
		unusedUltraFragments,
	};
}

function validateRecipeAndEquipmentPresentation(context, fixtures) {
	assert(fixtures.serializedRifle.includes(`Ammo Type:`) && fixtures.serializedRifle.includes(`Assault Rifle Ammo`), `Applicable weapons should show their ammo type.`);

	assert(fixtures.serializedRifle.includes(`Magazine Size`) && fixtures.serializedRifle.includes(`20`), `Applicable weapons should show magazine size in Stats.`);

	assert(fixtures.serializedRifle.includes(`Workbench:`) && fixtures.serializedRifle.includes(`Weapon Assembly Line`), `Crafted items should show only their minimum compatible workbench.`);

	assert(!fixtures.serializedRifle.includes(`Rank Max`) && !fixtures.serializedRifle.includes(`Compatible Workbenches`), `Workbench fields should omit derivation details and alternate stations.`);

	assert(fixtures.rifleAmmoFields.find(field => field.name === `Output Quantity:`)?.value === `10`, `Multi-output recipes should list their game-declared output quantity.`);

	assert(fixtures.rifleAmmoFields.find(field => field.name === `Tech Level:`)?.value === `36`, `Technology requirements should render in a dedicated Tech Level field.`);

	assert(!fixtures.rifleAmmoFields.find(field => field.name === `Crafting Materials:`)?.value.includes(`Technology Lv.`), `Crafting Materials should contain ingredients only.`);

	assert(fixtures.accessoryEffect?.value === `Attack Up Lv. 3`, `Accessories should show their localized effect in the dedicated field.`);

	assert(!fixtures.serializedAccessory.includes(`Stats:`), `Accessory Effect should replace the generic Stats field.`);

	assert(!fixtures.serializedMedicine.includes(`Medicine Effect:`), `Medicine Effect should be omitted when it duplicates the description.`);

	assert(fixtures.serializedAncientWeapon.includes(`Workbench:`) && fixtures.serializedAncientWeapon.includes(`Ancient Workbench`), `Rank-ten recipes should use the Ancient Workbench.`);

	assert(fixtures.serializedAncientIngot.includes(`Workbench:`) && fixtures.serializedAncientIngot.includes(`Ancient Furnace`), `Rank-seven ingot recipes should use the Ancient Furnace.`);

	assert(fixtures.serializedAncientFood.includes(`Workbench:`) && fixtures.serializedAncientFood.includes(`Ancient Kitchen`), `Rank-five cooked-food recipes should use the Ancient Kitchen.`);

	assert(fixtures.obtainableSlabItems.length === 14 && fixtures.obtainableSlabItems.every(item => item.acquisition), `All 14 obtainable slabs and fragments should embed acquisition data.`);

	assert(
		fixtures.unusedUltraFragments.length === 4 &&
		fixtures.unusedUltraFragments.every(item => item.searchable === false && !item.acquisition),
		`Unused Ultra fragment definitions should remain hidden and have no acquisition data.`,
	);

	assert(fixtures.serializedFragment.includes(`Sources:`) && fixtures.serializedFragment.includes(`Regular Chests`), `Slab fragments should render their game-matched chest tier.`);

	assert(!fixtures.serializedFragment.includes(`**Regular Chests**`), `Source categories should remain plain text within the Sources field.`);

	assert(!fixtures.serializedFragment.includes(`Source —`), `Item acquisition field names should not repeat Source with an em dash.`);
}

function validateAcquisitionAndPerkPresentation(context, fixtures) {
	const { itemData } = context;
	const epicTreasureMapSources = fixtures.epicTreasureMapResponse.embeds[0].toJSON().fields.find(field => field.name === `Sources:`)?.value;

	assert(
		[`Enemy Camps`, `Dungeons`, `Gold Chests`]
			.every(value => epicTreasureMapSources?.includes(value)) && !epicTreasureMapSources?.includes(`Treasure Chests`),
		`Epic Treasure Map sources should use broad camp and dungeon wording with specific chest tiers.`,
	);

	assert(!fixtures.serializedEpicTreasureMap.includes(`Enemy Camps Desert`), `Broad Enemy Camps labels should replace unreadable region lists.`);

	for (const name of [
		`Bellanoir's Slab Fragment`, `Bellanoir Libero's Slab Fragment`, `Blazamut Ryu Slab Fragment`,
		`Xenolord Slab Fragment`, `Hartalis Slab Fragment`,
	]) {
		const item = itemData.Items.find(value => value.name === name);
		assert(item.acquisition.mapSources.markers.some(marker => marker.type === `Enemy Camp`), `${name} should map its eligible enemy camps.`);
		assert(item.acquisition.mapSources.markers.some(marker => marker.type === `Dungeon`), `${name} should map its eligible dungeon entrances.`);
	}

	assert(fixtures.serializedSlab.includes(`Workbench:`) && fixtures.serializedSlab.includes(`Primitive Workbench`), `Rank-one general recipes should show Primitive Workbench.`);

	assert(
		fixtures.serializedAncientArmorSchematic.includes(`Schematic Recipe (Drafting Table):`) && !fixtures.serializedAncientArmorSchematic.includes(`Workbench:`),
		`Schematic combination recipes should identify the Drafting Table without a separate Workbench field.`,
	);

	assert(fixtures.serializedAncientArmorSchematic.includes(`Lightweight Ancient Armor Schematic 2 ×5`), `Schematic combination recipes should remain visible.`);

	assert(!fixtures.serializedAncientArmorSchematic.includes(`Paloxite Ingot ×52`), `Equipment-upgrade recipes should not be mixed into schematic cards.`);

	const legendaryAncientArmorEmbed = fixtures.legendaryAncientArmorResponse.embeds[0].toJSON();

	const ancientArmorPerks = legendaryAncientArmorEmbed.fields.find(field => field.name === `Perks:`)?.value;

	assert(
		ancientArmorPerks === `Cold Resistance Lv. 2\nHeat Resistance Lv. 2\nMax Carrying Capacity Lv. 4\nAttack Up (S) Lv. 4`,
		`Equipment bonuses should render together in a dedicated Perks field.`,
	);

	assert(!legendaryAncientArmorEmbed.description.includes(`Resistance Lv.`), `Equipment perks should not remain mixed into descriptions.`);

	for (const response of [fixtures.legendaryAncientArmorResponse, fixtures.uncommonAncientArmorResponse]) {
		assert(
			response.embeds[0].toJSON().fields.some(field => field.name === `Workbench:` && field.value === `Ancient Workbench`),
			`Schematic-unlocked Ancient equipment should show its game-declared Ancient Workbench even when PalDB omitted the recipe.`,
		);
	}
}

function validateCoreItemPresentation(context, fixtures) {
	validateRecipeAndEquipmentPresentation(context, fixtures);
	validateAcquisitionAndPerkPresentation(context, fixtures);
}

function validateWorkbenchPresentation(context, fixtures) {
	const { itemData, paldeck } = context;
	const workbenchItems = itemData.Items.filter(item =>
		item.searchable !== false && !/^\s*\[WIP\]/i.test(item.description || ``),
	);

	const itemByCode = new Map(workbenchItems.map(item => [item.code, item]));

	const schematicEquipmentCodes = new Set(workbenchItems
		.filter(item => item.category === `Schematic` && item.code?.includes(`/Blueprint_`))
		.map(item => item.code.replace(`/Blueprint_`, `/`))
		.filter(code => itemByCode.has(code)));

	for (const code of schematicEquipmentCodes) {
		const fields = paldeck.buildItemResponse(itemByCode.get(code), null, `schematic-equipment-owner`).embeds[0].toJSON().fields || [];
		const workbench = fields.find(field => field.name === `Workbench:`)?.value;
		assert(workbench && !/^(?:the\b|['"])/iu.test(workbench), `${code}: schematic-unlocked equipment should show a normalized game-declared workbench.`);
	}

	assert(
		fixtures.serializedFragment.includes(`Dungeon Chests ×1: up to 66.667%`) &&
		fixtures.serializedFragment.includes(`Treasure Chests (No. 1 Wildlife Sanctuary) ×1: 50%`) &&
		!fixtures.serializedFragment.includes(`Dungeon Chests (Forest)`),
		`Slab sources should summarize regional dungeons while retaining the distinct Wildlife Sanctuary pathway.`,
	);

	assert(
		fixtures.fragmentResponse.embeds[1].toJSON().image?.url === `attachment://${path.basename(fixtures.bellanoirFragment.acquisition.map)}` &&
		!fixtures.fragmentResponse.embeds[0].toJSON().image,
		`Mapped slab items should use the acquisition map as the embed image.`,
	);

	assert(fixtures.fragmentResponse.files.length === 2, `Mapped slab items should attach both the item thumbnail and acquisition map.`);
}

function validateFixedSourcePresentation(context, fixtures) {
	const fixedLocationCases = [
		[`Ominous Egg`, fixtures.serializedOminousEgg, `Egg Spawns (World Tree) ×1: 30 locations`],
		[`Kinship Peach`, fixtures.serializedPeach, `Fixed Locations (Palpagos) ×1: 22 locations`],
		[`Ancient Bone`, fixtures.serializedAncientBone, `Fixed Locations (Palpagos) ×1: 10 locations`],
		[`Ancient Bark`, fixtures.serializedAncientBark, `Fixed Locations (Palpagos) ×1: 10 locations`],
		[`Ancient Lava`, fixtures.serializedAncientLava, `Fixed Locations (Palpagos) ×1: 10 locations`],
	];

	for (const [name, payload, expected] of fixedLocationCases) {
		assert(payload.includes(expected), `${name} should show its verified fixed-location count.`);
	}

	assert(fixtures.serializedRuinSchematic.includes(`Sources:`) && fixtures.serializedRuinSchematic.includes(`Ancient Ruin`), `Ancient Ruin schematics should show their fixed source.`);

	const musketSources = fixtures.musketSchematic3Response.embeds[0].toJSON().fields.find(field => field.name === `Sources:`)?.value;

	assert(
		[`Ancient Ruin`, `Supply Drops`, `Silver Chests`, `Purple Chests`, `Treasure Maps (Common) ×1: 1.282%`]
			.every(value => musketSources?.includes(value)) && !musketSources?.includes(`Fixed location`),
		`Musket Schematic 3 should show concise direct and Treasure Map sources without a Fixed location placeholder.`,
	);

	assert(
		[`Ancient Ruin`, `Treasure`].every(type => [
			...(fixtures.musketSchematic3.acquisition.mapSources.markers || []),
			...(fixtures.musketSchematic3.acquisition.mapSources.maps || []).flatMap(panel => panel.markers || []),
		].some(marker => marker.type === type)) &&
		![...(fixtures.musketSchematic3.acquisition.mapSources.markers || []),
			...(fixtures.musketSchematic3.acquisition.mapSources.maps || []).flatMap(panel => panel.markers || [])]
			.some(marker => marker.type === `Supply`) &&
		fixtures.musketSchematic3.acquisition.mapSources.unpinnedSources?.includes(`Supply`),
		`Musket Schematic 3 should keep Supply Drops textual while mapping its ruin and treasure chests.`,
	);

	const sourceSummaryCases = [
		[`Dog Coin`, fixtures.serializedDogCoin, [`Sources:`, `Junk`, `Salvage`, `Elemental Chests`, `Oil Rigs`, `Expeditions`], [`Salvage Rank`]],
		[`Single-source salvage item`, fixtures.serializedSingleSalvage, [`Sources:`, `Salvage`], [`Salvage Rank`]],
		[`Ancient Sphere`, fixtures.serializedAncientSphere, [`Sources:`, `Fishing`, `Junk`, `Purple Chests`, `Regular Chests`, `Expeditions`, `Ground Spawns`], [`World Tree Fishing:`, `Treasure Chests`]],
	];

	for (const [name, payload, included, excluded] of sourceSummaryCases) {
		assert(included.every(value => payload.includes(value)) && excluded.every(value => !payload.includes(value)), `${name} should use canonical player-facing source names.`);
	}
}

function validateWorkbenchAndFixedSources(context, fixtures) {
	validateWorkbenchPresentation(context, fixtures);
	validateFixedSourcePresentation(context, fixtures);
}

// This integration-style assertion intentionally covers the interacting source compaction branches.
// eslint-disable-next-line complexity
function validateItemSourceSummaries(context, fixtures) {
	const { itemData } = context;
	assert(fixtures.ancientSphereResponse.files.length === 2, `Ancient Sphere should attach its combined Sunreach and World Tree source map.`);

	assert(
		fixtures.serializedSolSphere.includes(`Sources:`) &&
		fixtures.serializedSolSphere.includes(`Junk`) &&
		fixtures.serializedSolSphere.includes(`Supply Drops`) &&
		fixtures.serializedSolSphere.includes(`Regular Chests`) &&
		fixtures.solSphereResponse.files.length === 2,
		`Sol Sphere should include its Sky Island loot sources and map.`,
	);

	assert(serializeDiscordPayload(fixtures.coalResponse).includes(`Resource Nodes (Palpagos) ×1: 553 locations`), `Coal should combine normal resource nodes and clusters with its pickup quantity.`);

	const oreSources = sourceText(itemData.Items.find(item => item.name === `Ore`)?.acquisition);

	assert(oreSources.includes(`Expeditions ×10–80: 100%`) && oreSources.includes(`Ground Spawns ×1–5: up to 15.218%`),
		`Repeated regional loot rows should collapse into concise quantities and one maximum probability.`);

	assert(oreSources.split(`\n`).length === 3, `Ore should render one line per acquisition method.`);

	const holyWater = itemData.Items.find(item => item.name === `World Tree Holy Water`);
	const aquaticKit = itemData.Items.find(item => item.name === `Aquatic Construction Kit`);
	const jetragonGear = itemData.Items.find(item => item.name === `Jetragon's Missile Launcher`);
	const psychoGravity = itemData.Items.find(item => item.name === `Dark Skill Fruit: Psycho Gravity`);
	assert(holyWater.stats.weight === 0.1, `World Tree Holy Water should use its v1.0.3 weight.`);
	assert(aquaticKit.stats.rank === 2 && aquaticKit.recipes.some(recipe => recipe.requirement === `Technology Lv. 23`),
		`Aquatic Construction Kit should use its v1.0.3 rank and technology recipe.`);
	assert(jetragonGear.recipes.some(recipe => recipe.requirement === `Technology Lv. 70`),
		`Jetragon's Missile Launcher should unlock at its v1.0.3 technology level.`);
	assert(psychoGravity.properties.bLegalInGame === 1 && psychoGravity.searchable !== false,
		`Dark Skill Fruit: Psycho Gravity should remain searchable after its v1.0.3 legality fix.`);

	const holyWaterSources = sourceText(holyWater.acquisition, holyWater.merchantLocations, holyWater.droppedBy);

	assert(
		holyWaterSources.split(`\n`).filter(line => line.startsWith(`Pal Drops`)).length === 1 &&
		holyWaterSources.includes(`Pal Drops ×2–30: up to 100%`) &&
		holyWaterSources.includes(`Expeditions ×12–38: 100%`) &&
		holyWaterSources.includes(`Fishing ×9–71: 100%`) &&
		holyWaterSources.includes(`Fishing Ponds ×10–15: 100%`) &&
		holyWaterSources.includes(`Teafant Springs ×30: 100%`) &&
		!holyWaterSources.includes(`Ground Spawns`),
		`World Tree Holy Water should show every v1.0.3 acquisition pathway once.`,
	);

	assert(
		holyWater.acquisition.map === `data/item-maps/worldtree-teafant-springs.png` &&
		holyWater.acquisition.mapSources.markers.some(marker => marker.locationSet === `teafantSprings`) &&
		fs.existsSync(resolveProject(holyWater.acquisition.map)),
		`World Tree Holy Water should attach the repeatable three-spring World Tree map.`,
	);

	assert(
		itemSourcePresentation({ type: `Teafant Springs` }).color === `#ef4444` &&
		itemSourcePresentation({ type: `Teafant Springs` }).style === `special`,
		`Teafant Spring pins should use large red special-location pins with white outlines.`,
	);
	return holyWater;
}

async function validateSourceDetailsButton(context, fixtures, holyWater) {
	const { itemCommand, itemData, paldeck } = context;
	const advancedManual = itemData.Items.find(item => item.name === `Advanced Technical Manual`);

	const advancedManualResponse = paldeck.buildItemResponse(advancedManual, null, `original-owner`);

	const sourceDetailsButton = advancedManualResponse.components.flatMap(row => row.components)
		.find(component => component.data.label === `Source Chances`);

	assert(sourceDetailsButton, `Cards with location-dependent probabilities should include Source Chances.`);

	let sourceDetailsPayload = null;

	await itemCommand.handleButton({
		customId: sourceDetailsButton.data.custom_id,
		reply: payload => {sourceDetailsPayload = payload;},
		user: { id: `different-user` },
	});

	const serializedSourceDetails = serializeDiscordPayload(sourceDetailsPayload);

	assert(
		sourceDetailsPayload?.flags && serializedSourceDetails.includes(`Drop chances vary by location.`) &&
		serializedSourceDetails.includes(`Forest Enemy Camps: 33.82%`) &&
		serializedSourceDetails.includes(`Grasslands Enemy Camps: 36.38%`) &&
		sourceDetailsPayload.embeds.length === 1 && sourceDetailsPayload.files.length === 0 &&
		!serializedSourceDetails.includes(`Page 1 of 1`) &&
		!serializedSourceDetails.includes(`I'm not your button, pal!`),
		`Source Chances should be ephemeral, readable, and remain available to other users.`,
	);

	const holyWaterResponse = paldeck.buildItemResponse(holyWater, null, `item-owner`);

	assert(
		!holyWaterResponse.components.flatMap(row => row.components).some(component => component.data.label === `Source Chances`),
		`Items without location-dependent probability variation should not include Source Chances.`,
	);
}

async function validateItemSourceDetails(context, fixtures) {
	const holyWater = validateItemSourceSummaries(context, fixtures);
	await validateSourceDetailsButton(context, fixtures, holyWater);
}

module.exports = {
	createCoreItemFixtures, createMappedItemFixtures, validateCoreItemPresentation,
	validateItemSourceDetails, validateWorkbenchAndFixedSources,
};
