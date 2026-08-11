#!/usr/bin/env node

// Applies only deterministic item-master and recipe-table corrections from a decoded installed-game snapshot.
/* eslint-disable max-statements-per-line -- fixed game-table fields and CLI guards are intentionally compact. */
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const availabilityManifest = require(`../data/itemAvailability.json`);
const curatedTreasureMapSources = require(`../data/curatedTreasureMapSources.json`);
const curatedSlabFragmentSources = require(`../data/curatedSlabFragmentSources.json`);
const curatedSchematicSources = require(`../data/curatedSchematicSources.json`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);
const { applyTowerBossSources } = require(`../utils/towerBossSources.js`);
const { removeIndirectTreasureMapMarkers } = require(`../utils/itemMapSources.js`);
const { steamBuildId } = require(`../utils/itemAvailabilityAudit.js`);
const {
	applyCuratedMapRules, clonedResolvedItemData, installedAvailabilityManifest, printSyncReport, restoreReviewedVisibility,
	treasureMarkerSelectors,
} = require(`./lib/item-sync-presentation.js`);

const ROOT = path.resolve(__dirname, `..`);
const ITEM_DATA_PATH = path.join(ROOT, `data`, `itemData.json`);
const AVAILABILITY_PATH = path.join(ROOT, `data`, `itemAvailability.json`);
const RELIC_NAMES = {
	WorldTreeRelic_01: `Decayed Ancient Relic`, WorldTreeRelic_02: `Dormant Ancient Relic`,
	WorldTreeRelic_03: `Gorgeous Ancient Relic`, WorldTreeRelic_04: `Glowing Ancient Relic`,
	WorldTreeRelic_05: `Glistening Ancient Relic`,
};
const SPECIAL_SHOPS = {
	Medal_Shop_1: { type: `Medal Merchants`, currency: `Dog Coins`, locationProperty: `medalMerchants` },
	Bounty_Shop_1: { type: `Bounty Shop`, currency: `Successful Bounty Tokens`, locationProperty: `bountyMerchants` },
	Arena_Shop_1: { type: `Arena Merchant`, currency: `Battle Tickets`, locationProperty: `arenaMerchant` },
};
const PROCEDURAL_SHOPS = [
	[/^Caravan_Shop_/u, `Caravan Merchants`],
	[/^Dungeon_Shop_/u, `Dungeon Merchant`],
	[/^Wander_Shop_/u, `Wandering Merchants`],
];

function writeFileWithRetry(target, contents) {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		try {
			fs.writeFileSync(target, contents);
			return;
		} catch (error) {
			if (attempt === 11) {throw error;}
			// Local card hosting can briefly hold JSON files open on Windows while a refresh is in progress.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
		}
	}
}
const FIXED_SPECIAL_SHOP_LOCATIONS = {
	medalMerchants: {
		entries: [`Desolate Church`, `Sea Breeze Archipelago`, `Marsh Island`, `Forgotten Island`],
		map: `data/item-maps/medal-merchants.png`, marker: { type: `NPC`, id: `MedalTrader`, label: `Medal Merchants` },
	},
	bountyMerchants: {
		entries: [`PIDF Bounty Officer (Lv. 13)`, `PIDF Bounty Officer (Lv. 39)`, `PIDF Bounty Officer (Lv. 45)`],
		map: `data/item-maps/bounty-merchants.png`, marker: { type: `NPC`, id: `BountyTrader`, label: `Bounty Officers` },
	},
	arenaMerchant: {
		entries: [`Arena Merchant`], map: `data/item-maps/arena-merchant.png`, marker: { type: `NPC`, id: `ArenaShop`, label: `Arena Merchant` },
	},
};
const RAID_NAMES = {
	PalSummon_NightLady: `Bellanoir`, PalSummon_NightLady_Dark: `Bellanoir Libero`,
	PalSummon_NightLady_Dark_2: `Bellanoir Libero (Ultra)`, PalSummon_KingBahamut_Dragon: `Blazamut Ryu`,
	PalSummon_KingBahamut_Dragon_2: `Blazamut Ryu (Ultra)`, PalSummon_DarkMechaDragon: `Xenolord`,
	PalSummon_DarkMechaDragon_2: `Xenolord (Ultra)`, PalSummon_YakushimaBoss002: `Moon Lord`,
	PalSummon_YakushimaBoss002_2: `[Master] Moon Lord`, PalSummon_LegendDeer: `Hartalis`,
	PalSummon_LegendDeer_2: `Hartalis (Ultra)`,
};
const CURATED_RAID_REWARDS = new Set([
	`headequip001_purple`, `headequip041`, `headequip044`, `headequip046`, `yakushimaheadequip005`,
	`palsummon_yakushimaboss002_2`, `blueprint_yakushimaboss002_relic`,
]);
const TREASURE_MAP_RARITIES = {
	TreasureMap01: `Common`, TreasureMap02: `Uncommon`, TreasureMap03: `Rare`,
	TreasureMap04: `Epic`, TreasureMap05: `Legendary`,
};
const TREASURE_MARKER_FIELD_ALIASES = {
	DarkIsland_Treasure: `DarkIsland02`, Sakurajima_Treasure: `Sakurajima02`, SkyIsland_Treasure: `SkyIsland02`,
};
const CHEST_TIER_NAMES = {
	1: `Regular Chests`, 2: `Bronze Key Chests`, 3: `Purple Chests`, 4: `Silver Chests`, 5: `Gold Chests`, 6: `Gold Key Chests`,
};

function normalizedId(value) {
	return String(value || ``).toLowerCase();
}

function rawGameId(item) {
	return String(item.code || ``).split(`/`).at(-1);
}

function tableEntries(snapshot, name) {
	const table = snapshot.tables?.[name] || {};
	return Array.isArray(table) ? table : Object.entries(table).map(([Key, Value]) => ({ Key, Value }));
}

function decodedTableEntries(snapshot, suffix) {
	const match = Object.entries(snapshot.tables?._decodedTables || {}).find(([name]) => name.endsWith(suffix));
	return match ? Object.entries(match[1]).map(([Key, Value]) => ({ Key, Value })) : [];
}

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function installedBuildId() {
	const candidates = [
		optionValue(`--steam-manifest`), process.env.PALWORLD_STEAM_MANIFEST,
		String.raw`B:\SteamLibrary\steamapps\appmanifest_1623730.acf`,
		String.raw`C:\Program Files (x86)\Steam\steamapps\appmanifest_1623730.acf`,
	].filter(Boolean);
	const manifest = candidates.find(candidate => fs.existsSync(path.resolve(candidate)));
	return manifest ? steamBuildId(fs.readFileSync(path.resolve(manifest), `utf8`)) : null;
}

function loadSnapshot() {
	const buildId = installedBuildId();
	if (!buildId) {throw new Error(`Could not determine the installed Palworld build.`);}
	const target = optionValue(`--snapshot`) || path.join(
		process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`, `items-${buildId}.json`,
	);
	if (!fs.existsSync(target)) {throw new Error(`Decoded snapshot not found at ${target}; run audit:installed-game-data:refresh first.`);}
	const snapshot = JSON.parse(fs.readFileSync(target, `utf8`));
	if (String(snapshot.buildId) !== buildId) {throw new Error(`Snapshot build ${snapshot.buildId} does not match installed build ${buildId}.`);}
	return snapshot;
}

function technologyLevels(snapshot) {
	const levels = new Map();
	for (const entry of tableEntries(snapshot, `technology`)) {
		const level = Number(entry.Value.LevelCap || 0);
		for (const id of entry.Value.UnlockItemRecipes || []) {
			const key = normalizedId(id);
			if (level > 0 && (!levels.has(key) || level < levels.get(key))) {levels.set(key, level);}
		}
	}
	return levels;
}

function recipeIngredients(entry, itemByGameId, malformed) {
	const ingredients = [];
	for (let index = 1; index <= 5; index += 1) {
		const rawId = String(entry.Value[`Material${index}_Id`] || ``);
		const id = normalizedId(rawId);
		const quantity = Number(entry.Value[`Material${index}_Count`] || 0);
		if (id === `none` && quantity > 0) {
			malformed.push({ row: entry.Key, slot: index, quantity });
			continue;
		}
		if (!id || id === `none` || quantity <= 0) {continue;}
		const ingredient = itemByGameId.get(id);
		ingredients.push({
			name: ingredient?.name || rawId, code: ingredient?.code || `Items/${rawId}`, quantity: String(quantity),
		});
	}
	return ingredients;
}

function recipesByProduct(snapshot, itemByGameId) {
	const recipes = new Map();
	const levels = technologyLevels(snapshot);
	const malformed = [];
	for (const entry of tableEntries(snapshot, `recipes`)) {
		const row = entry.Value;
		const productId = normalizedId(row.Product_Id);
		if (!productId || productId === `none`) {continue;}
		const ingredients = recipeIngredients(entry, itemByGameId, malformed);
		if (!ingredients.length) {continue;}
		const recipe = { ingredients };
		const level = levels.get(productId);
		if (level) {recipe.requirement = `Technology Lv. ${level}`;}
		const outputQuantity = Number(row.Product_Count || 1);
		if (outputQuantity !== 1) {recipe.outputQuantity = outputQuantity;}
		const current = recipes.get(productId) || [];
		const signature = JSON.stringify(recipe);
		if (!current.some(value => JSON.stringify(value) === signature)) {current.push(recipe);}
		recipes.set(productId, current);
	}
	return { malformed, recipes };
}

function gameShopItemIds(snapshot) {
	return new Set(tableEntries(snapshot, `shopCreate`).flatMap(entry =>
		(entry.Value.productDataArray || []).map(product => normalizedId(product.StaticItemId)).filter(Boolean),
	));
}

function lotterySource(fieldName) {
	const relic = /^AncientRelicRecycler_(WorldTreeRelic_0[1-5])$/u.exec(fieldName);
	if (relic) {return { type: `Ancient Relics`, location: RELIC_NAMES[relic[1]] };}
	if (fieldName.startsWith(`EnemyCamp_`)) {return { type: `Enemy Camps`, location: `Enemy Camps` };}
	if (fieldName.startsWith(`Oilrig_`)) {return { type: `Oil Rigs`, location: fieldName.replaceAll(`_`, ` `) };}
	if (fieldName.includes(`FishPond`)) {return { type: `Fishing Ponds`, location: `Fishing Ponds` };}
	if (fieldName.includes(`Fishing`)) {return { type: `Fishing`, location: `Fishing` };}
	if (fieldName.startsWith(`TreasureMap`)) {
		return { type: `Treasure Maps`, location: fieldName.replace(/^TreasureMap0?/u, `Treasure Map `) };
	}
	return { type: `Treasure`, location: fieldName.replaceAll(`_`, ` `) };
}

function addLotterySources(snapshot, byItem) {
	for (const entry of tableEntries(snapshot, `itemLottery`)) {
		const itemId = normalizedId(entry.Value.StaticItemId);
		const fieldName = String(entry.Value.FieldName || ``);
		if (!itemId || itemId === `none` || !fieldName) {continue;}
		const source = lotterySource(fieldName);
		const sources = byItem.get(itemId) || new Map();
		const locations = sources.get(source.type) || new Set();
		locations.add(source.location);
		sources.set(source.type, locations);
		byItem.set(itemId, sources);
	}
}

function addShopSources(snapshot, byItem) {
	for (const entry of tableEntries(snapshot, `shopCreate`)) {
		const special = SPECIAL_SHOPS[entry.Key];
		const procedural = PROCEDURAL_SHOPS.find(([pattern]) => pattern.test(entry.Key));
		if (!special && !procedural) {continue;}
		addShopProducts(entry, special, procedural, byItem);
	}
}

function addShopProducts(entry, special, procedural, byItem) {
	const type = special?.type || procedural[1];
	for (const product of entry.Value.productDataArray || []) {
		const itemId = normalizedId(product.StaticItemId);
		const sources = byItem.get(itemId) || new Map();
		const locations = sources.get(type) || new Map();
		const quantity = Number(product.ProductNum || 1);
		const price = Number(product.OverridePrice || 0);
		locations.set(type, {
			location: type,
			...(quantity !== 1 ? { quantity: String(quantity) } : {}),
			...(special && price > 0 ? { cost: `${price.toLocaleString(`en-US`)} ${special.currency}` } : {}),
			shopIds: [...new Set([...(locations.get(type)?.shopIds || []), entry.Key])],
		});
		sources.set(type, locations);
		byItem.set(itemId, sources);
	}
}

function addRaidSources(snapshot, byItem) {
	for (const entry of tableEntries(snapshot, `raidBoss`)) {
		const level = Number(entry.Value.InfoList?.[0]?.Level || 0);
		const boss = RAID_NAMES[entry.Key] || entry.Key;
		for (const reward of entry.Value.SuccessItemList || []) {
			const itemId = normalizedId(reward.ItemName?.Key);
			if (!CURATED_RAID_REWARDS.has(itemId)) {continue;}
			const sources = byItem.get(itemId) || new Map();
			const locations = sources.get(`Summoning Altar`) || new Map();
			locations.set(`${boss}: Lvl ${level}`, {
				location: `${boss}: Lvl ${level}`,
				quantity: Number(reward.Min) === Number(reward.Max) ? String(reward.Min) : `${reward.Min}–${reward.Max}`,
				probability: `${reward.Rate}%`,
			});
			sources.set(`Summoning Altar`, locations);
			byItem.set(itemId, sources);
		}
	}
}

function installedAcquisitionSources(snapshot) {
	const byItem = new Map();
	addLotterySources(snapshot, byItem);
	// Fixed settlement inventories are represented by merchantLocations; test/vagrant tables are deliberately excluded.
	addShopSources(snapshot, byItem);
	// Raid success tables are authoritative for special guaranteed and percentage rewards.
	addRaidSources(snapshot, byItem);
	return byItem;
}

function applyFixedSpecialShopLocations(item, sources) {
	for (const [shopId, shop] of Object.entries(SPECIAL_SHOPS)) {
		if (!sources?.has(shop.type)) {continue;}
		const definition = FIXED_SPECIAL_SHOP_LOCATIONS[shop.locationProperty];
		item[shop.locationProperty] = {
			entries: definition.entries.map(merchant => ({ merchant })),
			map: definition.map,
			mapSources: { map: `palpagos`, markers: [definition.marker] },
			shopId,
		};
	}
}

function normalizeFixedMerchantMapPresentation(item) {
	const locations = item.merchantLocations;
	if (!locations?.mapSources?.markers?.length) {return;}
	for (const marker of locations.mapSources.markers) {
		const shop = String(marker.href || marker.shop || ``);
		// PalDB classifies both NPC variants as Wandering Merchant; legendType distinguishes their actual inventories.
		marker.type = `Wandering Merchant`;
		marker.legendType = /_Shop_2$/u.test(shop) ? `Weapons Merchant` : `Wandering Merchant`;
		delete marker.label;
	}
	// Shop identifiers keep distinct merchant inventories separate while leaving the asset name reviewable.
	const shops = locations.mapSources.markers
		.map(marker => String(marker.href || marker.shop || `unknown-shop`).toLowerCase().replace(/[^a-z0-9]+/gu, `-`))
		.sort()
		.join(`-and-`);
	locations.map = `data/item-maps/merchant-locations-${shops}.png`;
}

function formatProbability(value) {
	return `${Number(value.toFixed(3)).toString()}%`;
}

function treasureMapLoot(snapshot) {
	const fieldRows = new Map(decodedTableEntries(snapshot, `/DT_FieldLotteryNameDataTable`)
		.filter(entry => TREASURE_MAP_RARITIES[entry.Key]).map(entry => [entry.Key, entry.Value]));
	const rows = tableEntries(snapshot, `itemLottery`).filter(entry => TREASURE_MAP_RARITIES[entry.Value.FieldName]);
	const slotWeights = new Map();
	for (const entry of rows) {
		const key = `${entry.Value.FieldName}:${entry.Value.SlotNo}`;
		slotWeights.set(key, (slotWeights.get(key) || 0) + Number(entry.Value.WeightInSlot || 0));
	}
	const byItem = new Map();
	for (const entry of rows) {
		const row = entry.Value;
		const id = normalizedId(row.StaticItemId);
		const field = String(row.FieldName);
		const slot = Number(row.SlotNo);
		const total = slotWeights.get(`${field}:${slot}`) || 0;
		const activation = Number(fieldRows.get(field)?.[`ItemSlot${slot}_ProbabilityPercent`] || 0);
		if (!id || !total || !activation) {continue;}
		const current = byItem.get(id) || [];
		current.push({
			field, rarity: TREASURE_MAP_RARITIES[field],
			quantity: Number(row.MinNum) === Number(row.MaxNum) ? String(row.MinNum) : `${row.MinNum}–${row.MaxNum}`,
			probability: formatProbability(activation * Number(row.WeightInSlot || 0) / total),
		});
		byItem.set(id, current);
	}
	return byItem;
}

function treasureMapFilters(treasureMapItems, fields) {
	const filters = [];
	for (const field of fields) {
		const sourceItem = treasureMapItems.get(field);
		for (const marker of sourceItem?.acquisition?.mapSources?.markers || []) {
			filters.push({ ...marker, legendType: `Treasure Map`, label: `Treasure Maps` });
		}
	}
	return [...new Map(filters.map(filter => [JSON.stringify(filter), filter])).values()];
}

function palpagosMapSources(acquisition) {
	if (acquisition.mapSources?.maps) {
		let panel = acquisition.mapSources.maps.find(source => source.map === `palpagos`);
		if (!panel) {
			panel = { map: `palpagos`, markers: [] };
			acquisition.mapSources.maps.unshift(panel);
		}
		return panel;
	}
	acquisition.mapSources ||= { map: `palpagos`, markers: [] };
	return acquisition.mapSources;
}

function withoutTreasureMapMarkers(mapSources) {
	if (!mapSources?.markers) {return;}
	mapSources.markers = mapSources.markers.filter(marker =>
		marker.legendType !== `Treasure Map` && !/^Treasure Map \d Sources$/u.test(marker.label || ``));
}

function removeStaleTreasureMapLoot(item, lootByItem) {
	if (lootByItem.has(normalizedId(rawGameId(item))) || !item.acquisition) {return;}
	item.acquisition.sources = (item.acquisition.sources || []).filter(source => source.type !== `Treasure Maps`);
	for (const mapSources of [item.acquisition.mapSources, ...(item.acquisition.mapSources?.maps || [])]) {
		withoutTreasureMapMarkers(mapSources);
	}
	if (/\/treasure-map-loot-[^/]+-sources\.png$/u.test(item.acquisition.map || ``) &&
			!item.acquisition.mapSources?.markers?.length) {
		delete item.acquisition.map;
		delete item.acquisition.mapSources;
	}
	if (!item.acquisition.sources.length && !item.acquisition.map && !item.acquisition.note) {delete item.acquisition;}
}

function applyTreasureMapDrop(item, drops, treasureMapItems) {
	item.acquisition ||= { sources: [] };
	item.acquisition.sources ||= [];
	const source = {
		type: `Treasure Maps`, entries: drops.map(drop => ({
			location: `${drop.rarity} Treasure Map`, quantity: drop.quantity, probability: drop.probability,
		})),
	};
	const sourceIndex = item.acquisition.sources.findIndex(value => value.type === `Treasure Maps`);
	if (sourceIndex >= 0) {item.acquisition.sources[sourceIndex] = source;} else {item.acquisition.sources.push(source);}
	const fields = [...new Set(drops.map(drop => drop.field))];
	const markers = treasureMapFilters(treasureMapItems, fields);
	if (!markers.length) {return;}
	const signature = fields.sort().map(field => TREASURE_MAP_RARITIES[field].toLowerCase()).join(`-`);
	item.acquisition.map ||= `data/item-maps/treasure-map-loot-${signature}-sources.png`;
	const mapSources = palpagosMapSources(item.acquisition);
	mapSources.markers = [
		...(mapSources.markers || []).filter(marker =>
			marker.legendType !== `Treasure Map` && !/^Treasure Map \d Sources$/u.test(marker.label || ``)),
		...markers,
	];
}

function applyTreasureMapLoot(itemData, lootByItem) {
	for (const item of itemData.Items) {removeStaleTreasureMapLoot(item, lootByItem);}
	const itemById = new Map(itemData.Items.map(item => [normalizedId(rawGameId(item)), item]));
	const treasureMapItems = new Map(Object.keys(TREASURE_MAP_RARITIES).map(field => [field, itemById.get(normalizedId(field))]));
	let changed = 0;
	for (const [id, drops] of lootByItem) {
		const item = itemById.get(id);
		if (!item) {continue;}
		applyTreasureMapDrop(item, drops, treasureMapItems);
		changed += 1;
	}
	return changed;
}

function applyCuratedAcquisitionSources(itemData) {
	for (const item of itemData.Items) {
		const acquisition = curatedTreasureMapSources[item.id] || curatedSlabFragmentSources[item.id] || curatedSchematicSources[item.id];
		if (acquisition) {item.acquisition = JSON.parse(JSON.stringify(acquisition));}
	}
}

function normalizeItemMapPresentation(itemData) {
	const standardized = new Set([
		`Ancient Ruin`, `Enemy Camp`, `Treasure`, `Treasure Element`, `Oilrig Treasure Goal`,
		`Fishing Spot`, `Rare Fishing Spot`, `Treasure Map`, `Junk`, `Dungeon`,
	]);
	for (const item of itemData.Items) {
		for (const marker of item.acquisition?.mapSources?.markers || []) {
			if (marker.type === `Anti-Air Turret` && marker.RewardName === `Viking1`) {marker.legendType = `Enemy Camp`;}
			if (!standardized.has(marker.legendType || marker.type)) {continue;}
			delete marker.label;
			delete marker.color;
			delete marker.style;
		}
	}
}

function treasureGradesByItem(snapshot) {
	const grades = new Map();
	for (const entry of tableEntries(snapshot, `itemLottery`)) {
		const id = normalizedId(entry.Value.StaticItemId);
		const field = String(entry.Value.FieldName || ``);
		const grade = Number(String(entry.Value.TreasureBoxGrade || ``).match(/Grade(\d+)/u)?.[1] || 0);
		if (!id || !field || !grade) {continue;}
		const fields = grades.get(id) || new Map();
		const values = fields.get(field) || new Set();
		values.add(grade);
		fields.set(field, values);
		grades.set(id, fields);
	}
	return grades;
}

function removeUnavailableTreasureSource(item) {
	if (Number(item.properties?.bLegalInGame ?? 0) !== 0 || !item.acquisition) {return;}
	item.acquisition.sources = (item.acquisition.sources || []).filter(source => source.type !== `Treasure`);
	if (item.acquisition.mapSources?.markers) {
		item.acquisition.mapSources.markers = item.acquisition.mapSources.markers.filter(marker =>
			(marker.legendType || marker.type) !== `Treasure`);
	}
	if (!item.acquisition.sources.length) {delete item.acquisition;}
}

function mappedTreasureFields(item, fields) {
	const mappedFields = new Set();
	for (const mapSources of [item.acquisition?.mapSources, ...(item.acquisition?.mapSources?.maps || [])]) {
		for (const marker of mapSources?.markers || []) {
			if ((marker.legendType || marker.type) !== `Treasure`) {continue;}
			for (const lotteryField of marker.lotteryFields || []) {mappedFields.add(lotteryField);}
			for (const value of treasureMarkerSelectors(marker)) {
				mappedFields.add(fields.has(value) ? value : TREASURE_MARKER_FIELD_ALIASES[value]);
			}
		}
	}
	return mappedFields;
}

function treasureEntries(item, fields) {
	const source = item.acquisition?.sources?.find(value => value.type === `Treasure`);
	const existingEntries = source?.entries || [];
	const existingEntry = lotteryField => existingEntries.find(entry =>
		normalizedId(entry.lotteryField || entry.location).replaceAll(/[^a-z0-9]/gu, ``) ===
		normalizedId(lotteryField).replaceAll(/[^a-z0-9]/gu, ``));
	const isChestField = lotteryField =>
		/^(?:Grass|Forest|Desert|Volcano|Snow|Sakurajima|DarkIsland|SkyIsland|Yakushima)\d{2}$/iu.test(lotteryField) ||
		/^(?:DarkIsland|Sakurajima|SkyIsland|Yakushima|WorldTree)_Treasure$/iu.test(lotteryField);
	const decodedFields = new Set([...mappedTreasureFields(item, fields), ...fields.keys()].filter(isChestField));
	return [...decodedFields].filter(field => fields.has(field)).sort().flatMap(lotteryField =>
		[...fields.get(lotteryField)].sort((left, right) => left - right).map(grade => ({
			...(existingEntry(lotteryField) || { location: lotteryField, probability: `varies` }),
			location: lotteryField, chestTier: CHEST_TIER_NAMES[grade], lotteryField,
		})));
}

function replaceTreasureSource(item, entries) {
	const current = item.acquisition?.sources?.find(source => source.type === `Treasure`);
	if (!entries.length && current) {item.acquisition.sources = item.acquisition.sources.filter(source => source !== current);}
	if (entries.length) {
		item.acquisition ||= { sources: [] };
		item.acquisition.sources ||= [];
		if (current) {current.entries = entries;} else {item.acquisition.sources.push({ type: `Treasure`, entries });}
	}
	if (item.acquisition && !item.acquisition.sources?.length && !item.acquisition.map && !item.acquisition.note) {
		delete item.acquisition;
	}
}

function splitTreasureMarker(marker, fields) {
	if ((marker.legendType || marker.type) !== `Treasure`) {return marker;}
	const selector = marker.href !== undefined ? `href` : marker.Spawn !== undefined ? `Spawn` : null;
	if (!selector) {return marker;}
	const hrefs = Array.isArray(marker[selector]) ? marker[selector] : [marker[selector]].filter(Boolean);
	const grouped = new Map();
	for (const href of hrefs) {
		const lotteryField = fields.has(href) ? href : TREASURE_MARKER_FIELD_ALIASES[href];
		for (const grade of fields.get(lotteryField) || []) {
			const values = grouped.get(grade) || [];
			values.push({ href, lotteryField });
			grouped.set(grade, values);
		}
	}
	if (!grouped.size) {return marker;}
	return [...grouped].map(([treasureGrade, values]) => ({
		...marker,
		[selector]: values.length === 1 ? values[0].href : values.map(value => value.href),
		lotteryFields: [...new Set(values.map(value => value.lotteryField))], treasureGrade,
	}));
}

function applyTreasureChestGrades(itemData, snapshot) {
	const grades = treasureGradesByItem(snapshot);
	for (const item of itemData.Items) {
		const fields = grades.get(normalizedId(rawGameId(item)));
		if (!fields) {
			removeUnavailableTreasureSource(item);
			continue;
		}
		replaceTreasureSource(item, treasureEntries(item, fields));
		for (const mapSources of [item.acquisition?.mapSources, ...(item.acquisition?.mapSources?.maps || [])]) {
			if (!mapSources?.markers) {continue;}
			mapSources.markers = mapSources.markers.flatMap(marker => splitTreasureMarker(marker, fields));
		}
	}
}

function mergeInstalledSources(item, sources, onlyRelics) {
	if (!sources) {return false;}
	const shopTypes = new Set([
		...Object.values(SPECIAL_SHOPS).map(shop => shop.type), ...PROCEDURAL_SHOPS.map(([, type]) => type),
	]);
	const selected = [...sources].filter(([type]) =>
		!onlyRelics || [`Ancient Relics`, `Summoning Altar`].includes(type) || shopTypes.has(type));
	if (!selected.length) {return false;}
	item.acquisition ||= { sources: [] };
	item.acquisition.sources ||= [];
	let changed = false;
	for (const [type, locations] of selected) {
		let source = item.acquisition.sources.find(value => value.type === type);
		if (!source) {
			source = { type, entries: [] };
			item.acquisition.sources.push(source);
			changed = true;
		}
		for (const value of locations.values()) {
			const entry = typeof value === `string` ? { location: value } : value;
			if (!source.entries.some(current => current.location === entry.location)) {
				source.entries.push(entry);
				changed = true;
			}
		}
	}
	return changed;
}

function synchronizeLegalityAndRecipe(item, id, context, changes) {
	const gameItem = context.gameItemRows.get(id);
	if (gameItem?.bLegalInGame !== undefined) {
		const legal = gameItem.bLegalInGame ? 1 : 0;
		if (Number(item.properties?.bLegalInGame ?? 0) !== legal) {changes.legality = 1;}
		item.properties.bLegalInGame = legal;
	}
	const recipes = context.gameRecipes.recipes.get(id) || [];
	if (JSON.stringify(item.recipes || []) !== JSON.stringify(recipes)) {changes.recipe = 1;}
	item.recipes = recipes;
}

function synchronizeItem(item, context) {
	const id = normalizedId(rawGameId(item));
	const changes = { acquisition: 0, legality: 0, merchant: 0, recipe: 0 };
	synchronizeLegalityAndRecipe(item, id, context, changes);
	if (item.merchantLocations && !context.shopItemIds.has(id)) {
		delete item.merchantLocations;
		delete item.merchantLocationsRef;
		changes.merchant = 1;
	}
	const sourceLessLegalSchematic = item.category === `Schematic` &&
		Number(item.properties?.bLegalInGame ?? 0) === 1 && !item.acquisition?.sources?.length;
	const sources = context.installedSources.get(id);
	if (mergeInstalledSources(item, sources, !sourceLessLegalSchematic)) {changes.acquisition = 1;}
	applyFixedSpecialShopLocations(item, sources);
	normalizeFixedMerchantMapPresentation(item);
	applyCuratedMapRules(item, id);
	return changes;
}

function main() {
	const snapshot = loadSnapshot();
	// Clone each resolved row separately so shared acquisition presets cannot leak mutations between otherwise unrelated items.
	const itemData = clonedResolvedItemData(resolvedItemData());
	const itemByGameId = new Map(itemData.Items.map(item => [normalizedId(rawGameId(item)), item]));
	const gameItemRows = new Map(tableEntries(snapshot, `items`).map(entry => [normalizedId(entry.Key), entry.Value]));
	const gameRecipes = recipesByProduct(snapshot, itemByGameId);
	const shopItemIds = gameShopItemIds(snapshot);
	const installedSources = installedAcquisitionSources(snapshot);
	const treasureLoot = treasureMapLoot(snapshot);
	const changes = { acquisition: 0, legality: 0, merchant: 0, recipe: 0 };
	const context = { gameItemRows, gameRecipes, shopItemIds, installedSources };
	for (const item of itemData.Items) {
		const itemChanges = synchronizeItem(item, context);
		for (const [type, count] of Object.entries(itemChanges)) {changes[type] += count;}
	}
	changes.treasureMap = applyTreasureMapLoot(itemData, treasureLoot);
	// Treasure Map items need the physical game-backed sources of the maps themselves, not their possible destinations.
	applyCuratedAcquisitionSources(itemData);
	// Tower rewards live in boss Blueprint defaults that the decoded DataTable snapshot cannot currently expose.
	applyTowerBossSources(itemData);
	// Loot cards map their own physical sources; locations that merely yield a Treasure Map belong on that map's card.
	removeIndirectTreasureMapMarkers(itemData);
	normalizeItemMapPresentation(itemData);
	applyTreasureChestGrades(itemData, snapshot);

	const manifest = installedAvailabilityManifest(availabilityManifest, itemData.Items, snapshot);
	restoreReviewedVisibility(itemData.Items, manifest);

	printSyncReport(snapshot, changes, gameRecipes.malformed.length);
	if (!process.argv.includes(`--write`)) {
		console.log(`Dry run; files not written.`);
		return;
	}
	writeFileWithRetry(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
	writeFileWithRetry(AVAILABILITY_PATH, `${JSON.stringify(manifest, null, `\t`)}\n`);
	console.log(`Updated data/itemData.json and data/itemAvailability.json.`);
}

try {
	main();
} catch (error) {
	console.error(error.message || error);
	process.exitCode = 1;
}
