#!/usr/bin/env node

// Applies only deterministic item-master and recipe-table corrections from a decoded installed-game snapshot.
/* eslint-disable max-statements-per-line -- fixed game-table fields and CLI guards are intentionally compact. */
const fs = require(`node:fs`);
const crypto = require(`node:crypto`);
const os = require(`node:os`);
const path = require(`node:path`);
const availabilityManifest = require(`../data/itemAvailability.json`);
const curatedTreasureMapSources = require(`../data/curatedTreasureMapSources.json`);
const curatedSlabFragmentSources = require(`../data/curatedSlabFragmentSources.json`);
const curatedSchematicSources = require(`../data/curatedSchematicSources.json`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);
const { steamBuildId } = require(`../utils/itemAvailabilityAudit.js`);

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

function recipesByProduct(snapshot, itemByGameId) {
	const recipes = new Map();
	const levels = technologyLevels(snapshot);
	const malformed = [];
	for (const entry of tableEntries(snapshot, `recipes`)) {
		const row = entry.Value;
		const productId = normalizedId(row.Product_Id);
		if (!productId || productId === `none`) {continue;}
		const ingredients = [];
		for (let index = 1; index <= 5; index += 1) {
			const rawId = String(row[`Material${index}_Id`] || ``);
			const id = normalizedId(rawId);
			const quantity = Number(row[`Material${index}_Count`] || 0);
			if (id === `none` && quantity > 0) {
				malformed.push({ row: entry.Key, slot: index, quantity });
				continue;
			}
			if (!id || id === `none` || quantity <= 0) {continue;}
			const ingredient = itemByGameId.get(id);
			ingredients.push({
				name: ingredient?.name || rawId,
				code: ingredient?.code || `Items/${rawId}`,
				quantity: String(quantity),
			});
		}
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

function installedAcquisitionSources(snapshot) {
	const byItem = new Map();
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
	for (const entry of tableEntries(snapshot, `shopCreate`)) {
		// Fixed settlement inventories are represented by merchantLocations; test/vagrant tables are deliberately excluded.
		const special = SPECIAL_SHOPS[entry.Key];
		const procedural = PROCEDURAL_SHOPS.find(([pattern]) => pattern.test(entry.Key));
		if (!special && !procedural) {continue;}
		const type = special?.type || procedural[1];
		for (const product of entry.Value.productDataArray || []) {
			const itemId = normalizedId(product.StaticItemId);
			const sources = byItem.get(itemId) || new Map();
			const locations = sources.get(type) || new Map();
			const outputQuantity = Number(product.ProductNum || 1);
			const price = Number(product.OverridePrice || 0);
			const location = type;
			locations.set(location, {
				location,
				...(outputQuantity !== 1 ? { quantity: String(outputQuantity) } : {}),
				...(special && price > 0 ? { cost: `${price.toLocaleString(`en-US`)} ${special.currency}` } : {}),
				// Keep authoritative table provenance for audits without exposing it on player-facing cards.
				shopIds: [...new Set([...(locations.get(location)?.shopIds || []), entry.Key])],
			});
			sources.set(type, locations);
			byItem.set(itemId, sources);
		}
	}
	// Raid success tables are authoritative for special guaranteed and percentage rewards.
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
	// The marker signature prevents general and weapons merchant sets from accidentally sharing an output PNG.
	const signature = crypto.createHash(`sha256`).update(JSON.stringify(locations.mapSources)).digest(`hex`).slice(0, 10);
	locations.map = `data/item-maps/merchant-locations-${signature}.png`;
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

function applyTreasureMapLoot(itemData, lootByItem) {
	for (const item of itemData.Items) {
		if (lootByItem.has(normalizedId(rawGameId(item))) || !item.acquisition) {continue;}
		item.acquisition.sources = (item.acquisition.sources || []).filter(source => source.type !== `Treasure Maps`);
		for (const mapSources of [item.acquisition.mapSources, ...(item.acquisition.mapSources?.maps || [])]) {
			if (!mapSources?.markers) {continue;}
			mapSources.markers = mapSources.markers.filter(marker =>
				marker.legendType !== `Treasure Map` && !/^Treasure Map \d Sources$/u.test(marker.label || ``));
		}
		if (/\/treasure-map-loot-[^/]+-sources\.png$/u.test(item.acquisition.map || ``) &&
			!item.acquisition.mapSources?.markers?.length) {
			delete item.acquisition.map;
			delete item.acquisition.mapSources;
		}
		if (!item.acquisition.sources.length && !item.acquisition.map && !item.acquisition.note) {delete item.acquisition;}
	}
	const itemById = new Map(itemData.Items.map(item => [normalizedId(rawGameId(item)), item]));
	const treasureMapItems = new Map(Object.keys(TREASURE_MAP_RARITIES).map(field => [field, itemById.get(normalizedId(field))]));
	let changed = 0;
	for (const [id, drops] of lootByItem) {
		const item = itemById.get(id);
		if (!item) {continue;}
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
		if (markers.length) {
			const signature = fields.sort().map(field => TREASURE_MAP_RARITIES[field].toLowerCase()).join(`-`);
			item.acquisition.map ||= `data/item-maps/treasure-map-loot-${signature}-sources.png`;
			const mapSources = palpagosMapSources(item.acquisition);
			mapSources.markers = [
				...(mapSources.markers || []).filter(marker =>
					marker.legendType !== `Treasure Map` && !/^Treasure Map \d Sources$/u.test(marker.label || ``)),
				...markers,
			];
		}
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

function applyTreasureChestGrades(itemData, snapshot) {
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
	for (const item of itemData.Items) {
		const fields = grades.get(normalizedId(rawGameId(item)));
		if (!fields) {
			if (Number(item.properties?.bLegalInGame ?? 0) === 0 && item.acquisition) {
				item.acquisition.sources = (item.acquisition.sources || []).filter(source => source.type !== `Treasure`);
				if (item.acquisition.mapSources?.markers) {
					item.acquisition.mapSources.markers = item.acquisition.mapSources.markers.filter(marker =>
						(marker.legendType || marker.type) !== `Treasure`);
				}
				if (!item.acquisition.sources.length) {delete item.acquisition;}
			}
			continue;
		}
		let treasureSource = item.acquisition?.sources?.find(source => source.type === `Treasure`);
		const existingEntries = treasureSource?.entries || [];
		const findExistingEntry = lotteryField => existingEntries.find(entry => {
			const normalizedLocation = normalizedId(entry.lotteryField || entry.location).replaceAll(/[^a-z0-9]/gu, ``);
			return normalizedId(lotteryField).replaceAll(/[^a-z0-9]/gu, ``) === normalizedLocation;
		});
		const mappedChestFields = new Set();
		for (const mapSources of [item.acquisition?.mapSources, ...(item.acquisition?.mapSources?.maps || [])]) {
			for (const marker of mapSources?.markers || []) {
				if ((marker.legendType || marker.type) !== `Treasure`) {continue;}
				for (const lotteryField of marker.lotteryFields || []) {mappedChestFields.add(lotteryField);}
				const selector = marker.href !== undefined ? marker.href : marker.Spawn;
				for (const value of Array.isArray(selector) ? selector : [selector].filter(Boolean)) {
					mappedChestFields.add(fields.has(value) ? value : TREASURE_MARKER_FIELD_ALIASES[value]);
				}
			}
		}
		// Rebuild from decoded chest fields while keeping camps, expeditions, fishing, drops, and other lotteries separate.
		const isChestLotteryField = lotteryField =>
			/^(?:Grass|Forest|Desert|Volcano|Snow|Sakurajima|DarkIsland|SkyIsland|Yakushima)\d{2}$/iu.test(lotteryField) ||
			/^(?:DarkIsland|Sakurajima|SkyIsland|Yakushima|WorldTree)_Treasure$/iu.test(lotteryField);
		const decodedChestFields = new Set([...mappedChestFields, ...fields.keys()].filter(isChestLotteryField));
		const entries = [...decodedChestFields].filter(lotteryField => fields.has(lotteryField)).sort().flatMap(lotteryField => {
			const fieldGrades = fields.get(lotteryField);
			const existing = findExistingEntry(lotteryField);
			return [...fieldGrades].sort((left, right) => left - right).map(grade => ({
				...(existing || { location: lotteryField, probability: `varies` }),
				location: lotteryField, chestTier: CHEST_TIER_NAMES[grade], lotteryField,
			}));
		});
		if (entries.length) {
			item.acquisition ||= { sources: [] };
			item.acquisition.sources ||= [];
			if (!treasureSource) {
				treasureSource = { type: `Treasure`, entries: [] };
				item.acquisition.sources.push(treasureSource);
			}
			treasureSource.entries = entries;
		} else if (treasureSource) {
			item.acquisition.sources = item.acquisition.sources.filter(source => source !== treasureSource);
		}
		if (item.acquisition && !item.acquisition.sources?.length && !item.acquisition.map && !item.acquisition.note) {
			delete item.acquisition;
		}
		for (const mapSources of [item.acquisition?.mapSources, ...(item.acquisition?.mapSources?.maps || [])]) {
			if (!mapSources?.markers) {continue;}
			mapSources.markers = mapSources.markers.flatMap(marker => {
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
			});
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

function applyCuratedMapRules(item, id) {
	const maps = {
		money: {
			map: `gold-coin-sources.png`,
			markers: [
				{ type: `Junk`, href: [`Junk_DarkIsland`, `Junk_Dessert`, `Junk_Forest`, `Junk_Grass1`, `Junk_Grass2`, `Junk_Sakurajima`, `Junk_SkyIsland`, `Junk_Snow`, `Junk_Volcano`] },
				{ type: `Treasure`, href: [`DarkIsland_Treasure`, `Desert01`, `Forest01`, `Grass01`, `Sakurajima_Treasure`, `SkyIsland_Treasure`, `Snow01`, `Volcano01`] },
			],
			unpinnedSources: [`Salvage Rank1`],
		},
		medicines: {
			map: `medical-supplies-sources.png`,
			markers: [{ type: `Treasure`, href: [`Desert01`, `Forest01`, `Grass01`, `Sakurajima_Treasure`, `Snow01`, `Volcano01`] }],
			unpinnedSources: [`Salvage Rank1`],
		},
		expboost_03: {
			map: `training-manual-l-sources.png`,
			markers: [
				{ type: `Treasure`, href: [`DarkIsland_Treasure`, `Desert01`, `Desert02`, `Forest01`, `Forest02`, `Sakurajima_Treasure`, `SkyIsland_Treasure`, `Snow01`, `Volcano01`, `Volcano02`] },
				{ type: `Treasure Element`, href: [`Treasure_Element_Desert`, `Treasure_Element_Forest`, `Treasure_Element_Sakurajima`] },
			],
			unpinnedSources: [`Salvage Rank1`, `Salvage Rank2`, `Ancient Relics`],
		},
		fishingbait_2: {
			map: `high-quality-bait-sources.png`,
			markers: [
				{ type: `Junk`, href: [`Junk_DarkIsland`, `Junk_Dessert`, `Junk_Forest`, `Junk_Sakurajima`, `Junk_Snow`, `Junk_Volcano`] },
				{ type: `Treasure`, href: [`DarkIsland_Treasure`, `Desert01`, `Sakurajima_Treasure`, `Snow01`, `Volcano01`] },
			],
			unpinnedSources: [`Salvage Rank2`],
		},
	};
	const definition = maps[id];
	if (definition) {
		item.acquisition.map = `data/item-maps/${definition.map}`;
		item.acquisition.mapSources = {
			map: `palpagos`, markers: definition.markers, unpinnedSources: definition.unpinnedSources,
		};
	}
	if (id === `blueprint_musket_4` && item.acquisition?.mapSources?.markers) {
		item.acquisition.mapSources.markers = item.acquisition.mapSources.markers.filter(marker => marker.type !== `Supply`);
		item.acquisition.mapSources.unpinnedSources = [...new Set([...(item.acquisition.mapSources.unpinnedSources || []), `Supply`])];
	}
}

function hasPlaceholderText(item) {
	const description = String(item.description || ``).trim();
	const name = String(item.name || ``).trim();
	return !description || /^\[WIP\]/iu.test(description) || /^[a-z]{2}[_ ]text/iu.test(description) ||
		name === `-` || description === `-`;
}

function restoreReviewedVisibility(items, manifest) {
	const unavailable = new Set(manifest.items.filter(decision =>
		[`unused`, `unreleased`, `superseded`].includes(decision.status),
	).map(decision => decision.id));
	for (const item of items) {
		if (unavailable.has(item.id) || hasPlaceholderText(item) ||
			(item.category === `Schematic` && Number(item.properties?.bLegalInGame ?? 0) === 0)) {
			item.searchable = false;
		} else {
			delete item.searchable;
		}
	}
}

function main() {
	const snapshot = loadSnapshot();
	// Clone each resolved row separately so shared acquisition presets cannot leak mutations between otherwise unrelated items.
	const resolved = resolvedItemData();
	const itemData = { ...resolved, Items: resolved.Items.map(item => JSON.parse(JSON.stringify(item))) };
	for (const item of itemData.Items) {
		delete item.acquisitionRef;
		delete item.merchantLocationsRef;
		delete item.bountyMerchants;
		delete item.arenaMerchant;
	}
	const itemByGameId = new Map(itemData.Items.map(item => [normalizedId(rawGameId(item)), item]));
	const gameItemRows = new Map(tableEntries(snapshot, `items`).map(entry => [normalizedId(entry.Key), entry.Value]));
	const gameRecipes = recipesByProduct(snapshot, itemByGameId);
	const shopItemIds = gameShopItemIds(snapshot);
	const installedSources = installedAcquisitionSources(snapshot);
	const treasureLoot = treasureMapLoot(snapshot);
	let legalityChanges = 0;
	let acquisitionChanges = 0;
	let merchantRemovals = 0;
	let recipeChanges = 0;
	for (const item of itemData.Items) {
		const id = normalizedId(rawGameId(item));
		const gameItem = gameItemRows.get(id);
		if (gameItem && gameItem.bLegalInGame !== undefined) {
			const legal = gameItem.bLegalInGame ? 1 : 0;
			if (Number(item.properties?.bLegalInGame ?? 0) !== legal) {
				legalityChanges += 1;
			}
			item.properties.bLegalInGame = legal;
		}
		const recipes = gameRecipes.recipes.get(id) || [];
		if (JSON.stringify(item.recipes || []) !== JSON.stringify(recipes)) {recipeChanges += 1;}
		item.recipes = recipes;
		if (item.merchantLocations && !shopItemIds.has(id)) {
			delete item.merchantLocations;
			delete item.merchantLocationsRef;
			merchantRemovals += 1;
		}
		const sourceLessLegalSchematic = item.category === `Schematic` &&
			Number(item.properties?.bLegalInGame ?? 0) === 1 && !item.acquisition?.sources?.length;
		const sources = installedSources.get(id);
		if (mergeInstalledSources(item, sources, !sourceLessLegalSchematic)) {acquisitionChanges += 1;}
		applyFixedSpecialShopLocations(item, sources);
		normalizeFixedMerchantMapPresentation(item);
		applyCuratedMapRules(item, id);
	}
	const treasureMapLootChanges = applyTreasureMapLoot(itemData, treasureLoot);
	// Treasure Map items need the physical game-backed sources of the maps themselves, not their possible destinations.
	applyCuratedAcquisitionSources(itemData);
	normalizeItemMapPresentation(itemData);
	applyTreasureChestGrades(itemData, snapshot);

	const manifest = JSON.parse(JSON.stringify(availabilityManifest));
	manifest.items = manifest.items.filter(decision => !String(decision.reason).startsWith(`Installed build `));
	for (const item of itemData.Items.filter(value => value.category === `Schematic` && Number(value.properties?.bLegalInGame ?? 0) === 0)) {
		const reasonPrefix = `Game-disabled schematic definition`;
		let decision = manifest.items.find(value => value.id === item.id);
		if (!decision) {
			decision = { id: item.id, status: `unused`, reason: ``, allowedEvidence: [] };
			manifest.items.push(decision);
		}
		if (String(decision.reason).startsWith(reasonPrefix) || !decision.reason) {
			decision.status = `unused`;
			decision.reason = `${reasonPrefix} in installed build ${snapshot.buildId}.`;
			decision.allowedEvidence = [
				item.recipes?.length && `recipe`, item.droppedBy?.length && `Pal drop`,
				item.acquisition?.sources?.length && `acquisition source`, item.merchantLocations && `merchant`,
			].filter(Boolean);
		}
	}
	manifest.items.sort((left, right) => left.id.localeCompare(right.id));
	manifest.game.buildId = String(snapshot.buildId);
	manifest.verifiedAt = new Date().toISOString().slice(0, 10);
	restoreReviewedVisibility(itemData.Items, manifest);

	console.log(`Installed-game sync for build ${snapshot.buildId}:`);
	console.log(`- Recipe records changed: ${recipeChanges}`);
	console.log(`- Legality flags changed: ${legalityChanges}`);
	console.log(`- Acquisition records changed: ${acquisitionChanges}`);
	console.log(`- Treasure Map loot records synchronized: ${treasureMapLootChanges}`);
	console.log(`- Unsupported local merchant records removed: ${merchantRemovals}`);
	console.log(`- Malformed game material slots ignored: ${gameRecipes.malformed.length}`);
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
