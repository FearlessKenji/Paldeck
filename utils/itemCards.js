/* eslint-disable max-len, max-statements-per-line -- compact lookup tables and Discord builder chains remain more readable together. */
// Builds consistent item, acquisition-map, and fixed-merchant Discord responses.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require(`discord.js`);
const { itemControlRows, itemResponseEmbeds } = require(`./itemCardControls.js`);
const { itemDescriptionParts } = require(`./itemDescription.js`);
const { nonPalDrops, searchablePalDrops } = require(`./itemDropSources.js`);
const { itemWorkbench } = require(`./itemWorkbench.js`);
const implantPassives = require(`../data/implantPassives.json`);

const ITEM_RARITY_COLORS = {
	Common: 0x9ca3af, Uncommon: 0x22c55e, Rare: 0x3b82f6, Epic: 0xa855f7, Legendary: 0xf59e0b,
};

// These are the schematic combination families present in build 24467282's authoritative recipe table.
const SCHEMATIC_COMBINATION_FAMILIES = new Set([
	`Blueprint_Bat3`, `Blueprint_Sword`, `Blueprint_Katana`, `Blueprint_BeamSword`, `Blueprint_SkyBeamSword`,
	`Blueprint_WeakerBow`, `Blueprint_BowGun`, `Blueprint_BowGun_Poison`, `Blueprint_BowGun_Fire`, `Blueprint_CompoundBow`,
	`Blueprint_SFBow`, `Blueprint_SkyBow`, `Blueprint_MakeshiftHandgun`, `Blueprint_HandGun_Default`, `Blueprint_OldRevolver`,
	`Blueprint_MakeshiftShotgun`, `Blueprint_DoubleBarrelShotgun`, `Blueprint_PumpActionShotgun`, `Blueprint_SemiAutoShotgun`,
	`Blueprint_EnergyShotgun`, `Blueprint_SkyShotgun`, `Blueprint_WidePenetrateShotgun`, `Blueprint_Musket`,
	`Blueprint_SingleShotRifle`, `Blueprint_SemiAutoRifle`, `Blueprint_MakeshiftAssaultRifle`, `Blueprint_AssaultRifle_Default`,
	`Blueprint_SkyAssaultRifle`, `Blueprint_ElectricArcAssaultRifle`, `Blueprint_MakeshiftSubmachineGun`,
	`Blueprint_SubmachineGun`, `Blueprint_SkySubmachineGun`, `Blueprint_Launcher_Default`, `Blueprint_LaserRifle`,
	`Blueprint_ChargeLaserRifle`, `Blueprint_OverheatRifle`, `Blueprint_FlameThrower`, `Blueprint_GatlingGun`,
	`Blueprint_LaserGatlingGun`, `Blueprint_GrenadeLauncher`, `Blueprint_SkyGrenadeLauncher`, `Blueprint_GuidedMissileLauncher`,
	`Blueprint_MultiGuidedMissileLauncher`, `Blueprint_EnergyRocketLauncher`, `Blueprint_BeamLauncher`, `Blueprint_DroneLauncher`,
	`Blueprint_YakushimaBlade004`, `Blueprint_YakushimaBlade002`, `Blueprint_YakushimaGun001`,
	`Blueprint_YakushimaLantern001`, `Blueprint_YakushimaBlade003`, `Blueprint_ClothArmor`, `Blueprint_ClothArmorHeat`,
	`Blueprint_ClothArmorCold`, `Blueprint_FurArmor`, `Blueprint_FurArmorHeat`, `Blueprint_FurArmorCold`,
	`Blueprint_CopperArmor`, `Blueprint_CopperArmorHeat`, `Blueprint_CopperArmorCold`, `Blueprint_IronArmor`,
	`Blueprint_IronArmorHeat`, `Blueprint_IronArmorCold`, `Blueprint_StealArmor`, `Blueprint_StealArmorHeat`,
	`Blueprint_StealArmorCold`, `Blueprint_PlasticArmor`, `Blueprint_PlasticArmorHeat`, `Blueprint_PlasticArmorCold`,
	`Blueprint_PlasticArmorWeight`, `Blueprint_SFArmor`, `Blueprint_SFArmorHeat`, `Blueprint_SFArmorCold`,
	`Blueprint_SFArmorWeight`, `Blueprint_AncientArmor`, `Blueprint_AncientArmorHeat`, `Blueprint_AncientArmorCold`,
	`Blueprint_AncientArmorWeight`, `Blueprint_YakushimaArmor001`, `Blueprint_FurHelmet`, `Blueprint_CopperHelmet`,
	`Blueprint_IronHelmet`, `Blueprint_StealHelmet`, `Blueprint_PlasticHelmet`, `Blueprint_SFHelmet`, `Blueprint_AncientHelmet`,
	`Blueprint_YakushimaHeadEquip001`, `Blueprint_YakushimaHeadEquip003`, `Blueprint_YakushimaHeadEquip002`,
	`Blueprint_YakushimaHeadEquip004`,
]);

// Only these newer families have a Common-to-Uncommon row; legacy quality chains start at Rare.
const TIER_ONE_SCHEMATIC_COMBINATIONS = new Set([
	`Blueprint_MultiGuidedMissileLauncher_2`,
	`Blueprint_YakushimaArmor001_2`,
	`Blueprint_YakushimaBlade002_2`,
	`Blueprint_YakushimaBlade003_2`,
	`Blueprint_YakushimaBlade004_2`,
	`Blueprint_YakushimaGun001_2`,
	`Blueprint_YakushimaHeadEquip001_2`,
	`Blueprint_YakushimaHeadEquip002_2`,
	`Blueprint_YakushimaHeadEquip003_2`,
	`Blueprint_YakushimaHeadEquip004_2`,
	`Blueprint_YakushimaLantern001_2`,
]);
const SOURCE_LABELS = {
	"Treasure Element": `Elemental Chests`, Supply: `Supply Drops`, Junk: `Junk`,
	"Salvage Rank1": `Salvage`, "Salvage Rank2": `Salvage`, "World Tree Fishing": `Fishing`, "World Tree Junk": `Junk`,
	Expeditions: `Expeditions`, "Enemy Camps": `Enemy Camps`, Fishing: `Fishing`, "Fishing Ponds": `Fishing Ponds`,
	Dungeons: `Dungeons`, "Oil Rigs": `Oil Rigs`, "Skill Fruit Trees": `Skill Fruit Trees`,
};
const LOOT_POOL_LABELS = {
	"Captured Pal Cages": `Factions`, "Dungeon Chests": `Dungeons`, "Relic Recycler": `Ancient Relics`,
};
const CHEST_TIER_LABELS = new Set([
	`Regular Chests`, `Bronze Key Chests`, `Purple Chests`, `Silver Chests`, `Gold Chests`, `Gold Key Chests`,
]);
const CHEST_TIER_BY_GRADE = [``, ...CHEST_TIER_LABELS];
const WILDLIFE_SANCTUARY_BY_REGION = {
	Forest: `No. 1 Wildlife Sanctuary`, Volcano: `No. 2 Wildlife Sanctuary`, Desert: `No. 3 Wildlife Sanctuary`,
};
const RELIC_POOL_BY_NAME = {
	"Decayed Ancient Relic": `AncientRelicRecycler_WorldTreeRelic_01`,
	"Dormant Ancient Relic": `AncientRelicRecycler_WorldTreeRelic_02`,
	"Gorgeous Ancient Relic": `AncientRelicRecycler_WorldTreeRelic_03`,
	"Glowing Ancient Relic": `AncientRelicRecycler_WorldTreeRelic_04`,
	"Glistening Ancient Relic": `AncientRelicRecycler_WorldTreeRelic_05`,
};
const SELF_DESCRIBING_SOURCES = new Set([
	`Oil Rigs`, `Treasure Maps`, `Effigy Locations`, `Medal Merchants`, `Bounty Shop`, `Arena Merchant`,
	`Caravan Merchants`, `Dungeon Merchant`, `Wandering Merchants`,
]);
const PROCEDURAL_MERCHANT_SOURCES = new Set([`Wandering Merchants`, `Caravan Merchants`, `Dungeon Merchant`]);

function fixedMerchantTypes(locations) {
	return [...new Set((locations?.entries || []).map(entry => {
		const shops = entry.shops || [entry.shop];
		return shops.some(shop => /_Shop_2$/u.test(shop)) ? `Weapons Merchant` : `Wandering Merchant`;
	}))];
}
const AMMO_BY_CLASS = {
	Bow_Fire: `Fire Arrow`, Bow_Poison: `Poison Arrow`, BowGun_Fire: `Fire Arrow`, BowGun_Poison: `Poison Arrow`,
	ChargeLaserRifle: `Charge Rifle Ammo`, CompoundBow: `Reinforced Arrow`, ElectricArcAssaultRifle: `Plasma Rifle Ammo`,
	EnergyRocketLauncher: `Plasma Cartridge`, EnergyShotgun: `Energy Shotgun Ammo`, Flamethrower: `Flamethrower Fuel`,
	GatlingGun: `Gatling Gun Ammo`, GrenadeLauncher: `Grenade Ammo`, GuidedMissileLauncher: `Missile Ammo`,
	LaserGatlingGun: `Laser Gatling Cartridge`, LaserRifle: `Energy Cartridge`, Launcher_Meteor: `Meteorite Ammo`,
	MakeshiftAssaultRifle: `Coarse Ammo`, MakeshiftHandgun: `Coarse Ammo`, MakeshiftShotgun: `Coarse Ammo`,
	MakeshiftSubmachineGun: `Coarse Ammo`, MultiGuidedMissileLauncher: `Missile Ammo`, Musket: `Coarse Ammo`,
	NormalLauncher: `Rocket Ammo`, NormalPistol: `Handgun Ammo`, NormalRifle: `Assault Rifle Ammo`,
	NormalSniperRifle: `Rifle Ammo`, OldRevolver: `Magnum Ammo`, PalDopingShot: `Boost Gun Ammo`,
	PalDopingShot_2: `Boost Gun Ammo`, SemiAutoRifle: `Rifle Ammo`, SFBow: `Advanced Arrow`,
	SingleShotRifle: `Rifle Ammo`, SkyAssaultRifle: `Heavy Assault Rifle Ammo`, SkyBow: `Mechanical Bow Ammo`,
	SkyGrenadeLauncher: `Tactical Grenade Launcher Ammo`, SkyShotgun: `Prototype Shotgun Ammo`,
	SkySubmachineGun: `Combat SMG Ammo`, SubmachineGun: `Machine Gun Ammo`, WidePenetrateShotgun: `Beam Scatter Ammo`,
};
const AMMO_BY_TYPE = { WeaponBow: `Arrow`, WeaponCrossbow: `Arrow`, WeaponHandgun: `Handgun Ammo`, WeaponShotgun: `Shotgun Shell` };

function formatNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number.toLocaleString(`en-US`) : String(value);
}

function chunkLines(lines, limit = 1024) {
	const chunks = [];
	let current = ``;
	for (const line of lines) {
		const candidate = current ? `${current}\n${line}` : line;
		if (candidate.length > limit && current) {
			chunks.push(current);
			current = line;
		} else {
			current = candidate;
		}
	}
	if (current) {chunks.push(current);}
	return chunks;
}

function itemEffect(item) {
	const grantedPassive = implantPassives[String(item.code || ``).split(`/`).at(-1)];
	if (grantedPassive) {return { label: `Granted Passive:`, value: grantedPassive };}
	if (item.properties?.typeB === `Accessory`) {
		const description = String(item.description || ``);
		const start = description.indexOf(`. `);
		return { label: `Accessory Effect:`, value: item.properties.passiveSkillName && start >= 0 ? description.slice(start + 2) : description };
	}
	if (item.properties?.typeB === `Drug`) {return { label: `Medicine Effect:`, value: item.description };}
	return null;
}

function relicRecyclerResult(acquisition, relicName) {
	const poolName = RELIC_POOL_BY_NAME[relicName];
	const matches = (acquisition?.lootPools || []).filter(pool => pool.pool === poolName);
	const chances = matches.map(pool => Number.parseFloat(pool.probability) / 100).filter(Number.isFinite);
	if (!chances.length) {return null;}
	// Recycler tables use three independently rolled reward slots; combine them into the useful per-recycling chance.
	const percentage = (1 - chances.reduce((miss, chance) => miss * (1 - chance), 1)) * 100;
	return {
		probability: percentage < 0.001 ? `<0.001%` : `${percentage.toFixed(3).replace(/0+$/u, ``).replace(/\.$/u, ``)}%`,
		quantity: numericRange(matches.map(pool => pool.quantity)) || `1`,
	};
}

function numericRange(values) {
	const numbers = values.flatMap(value => String(value || ``).replaceAll(`,`, ``).match(/\d+(?:\.\d+)?/gu) || []).map(Number).filter(Number.isFinite);
	if (!numbers.length) {return null;}
	const minimum = Math.min(...numbers);
	const maximum = Math.max(...numbers);
	return minimum === maximum ? formatNumber(minimum) : `${formatNumber(minimum)}–${formatNumber(maximum)}`;
}

function compactLootPoolLine(category, pools) {
	const quantity = numericRange(pools.map(pool => pool.quantity));
	const probabilities = pools.map(pool => Number.parseFloat(pool.probability)).filter(Number.isFinite);
	const probability = probabilities.length ? formatNumber(Math.max(...probabilities)) : null;
	const variedProbability = new Set(probabilities).size > 1;
	const quantityText = ` ×${quantity || `1`}`;
	return `${category}${quantityText}${probability ? `: ${variedProbability ? `up to ` : ``}${probability}%` : ``}`;
}

function lootPoolCategory(acquisition, pool) {
	const directCategory = directLootPoolCategory(pool);
	if (directCategory) {return directCategory;}
	const curatedTier = (acquisition?.sources || []).find(source => source.type === `Treasure`)?.entries
		.find(entry => entry.lotteryField === pool.pool || entry.location === pool.pool)?.chestTier;
	const itemChestTiers = new Set((acquisition?.sources || []).filter(source => source.type === `Treasure`)
		.flatMap(source => source.entries.map(entry => entry.chestTier).filter(Boolean)));
	const grade = Number(pool.pool.match(/_Grade_0?([1-6])$/iu)?.[1] || 0);
	return curatedTier || (itemChestTiers.size === 1 ? [...itemChestTiers][0] : null) || CHEST_TIER_BY_GRADE[grade] || `Treasure Chests`;
}

function directLootPoolCategory(pool) {
	if (pool.pool === `WorldTree_Drop_HolyWater`) {return `Teafant Springs`;}
	if (/_FishPond$/iu.test(pool.pool)) {return `Fishing Ponds`;}
	if (pool.category !== `Treasure Chests`) {return LOOT_POOL_LABELS[pool.category] || pool.category;}
	return null;
}

const REGION_LABELS = {
	DarkIsland: `Feybreak`, Desert: `Desert`, Dessert: `Desert`, Forest: `Forest`, Grass: `Grasslands`,
	Sakura: `Sakurajima`, Sakurajima: `Sakurajima`, SkyIsland: `Skymarch`, Snow: `Astral Mountains`,
	Volcano: `Mount Obsidian`, WorldTree: `World Tree`, Yakushima: `World Tree`,
};

function poolLocation(pool) {
	const name = String(pool.pool || ``);
	const regionKey = Object.keys(REGION_LABELS).find(key => new RegExp(`(?:^|_)${key}(?:\\d|_|Goal|Seabase|$)`, `iu`).test(name));
	const region = REGION_LABELS[regionKey] || `Other`;
	if (/^EnemyCamp_/iu.test(name)) {return /Seabase/iu.test(name) ? `${region} Sea Bases` : `${region} Enemy Camps`;}
	if (/Dungeon|Cavern/iu.test(name)) {return `${region} Dungeons`;}
	if (/_FishPond$/iu.test(name)) {return `${region} Fishing Ponds`;}
	if (/_Fishing$/iu.test(name)) {return `${region} Fishing Spots`;}
	if (/^Expedition_/iu.test(name)) {return `${region}${/_Hard$/iu.test(name) ? ` (Hard)` : ``}`;}
	if (/^Oilrig_Mini/iu.test(name)) {return `Small Oil Rig`;}
	if (/^Oilrig_/iu.test(name)) {return `Oil Rig`;}
	if (/^Salvage_/iu.test(name)) {return `Salvage`;}
	if (/^AncientRelicRecycler_/iu.test(name)) {return `Ancient Relic Recycler`;}
	return region;
}

function excludedVariableCategories(item) {
	const sourceTypes = new Set((item.acquisition?.sources || []).map(source => source.type));
	return new Set([`Ancient Relics`, `Treasure Maps`].filter(type => sourceTypes.has(type)));
}

function variableSourceDetails(item) {
	const excluded = excludedVariableCategories(item);
	const categories = new Map();
	for (const pool of item.acquisition?.lootPools || []) {
		const category = lootPoolCategory(item.acquisition, pool);
		if (excluded.has(category)) {continue;}
		const probability = Number.parseFloat(pool.probability);
		if (!Number.isFinite(probability)) {continue;}
		const locations = categories.get(category) || new Map();
		const location = poolLocation(pool);
		const detail = locations.get(location) || { maximum: 0, rates: new Set() };
		detail.maximum = Math.max(detail.maximum, probability);
		detail.rates.add(probability);
		locations.set(location, detail);
		categories.set(category, locations);
	}
	const blocks = [];
	for (const [category, locations] of categories) {
		const rates = new Set([...locations.values()].flatMap(detail => [...detail.rates]));
		if (rates.size < 2) {continue;}
		const lines = [...locations].sort(([left], [right]) => left.localeCompare(right))
			.map(([location, detail]) => `${location}: ${detail.rates.size > 1 ? `up to ` : ``}${formatNumber(detail.maximum)}%`);
		blocks.push(`**${category}**\n${lines.join(`\n`)}`);
	}
	return blocks.sort((left, right) => left.localeCompare(right));
}

function detailPages(item, limit = 3600, lineLimit = 15) {
	const pages = [];
	let current = ``;
	for (const block of variableSourceDetails(item)) {
		const candidate = current ? `${current}\n\n${block}` : block;
		const exceedsLineLimit = candidate.split(`\n`).length > lineLimit;
		if ((candidate.length > limit || exceedsLineLimit) && current) {pages.push(current); current = block;} else {current = candidate;}
	}
	if (current) {pages.push(current);}
	return pages;
}

function sourceLineOrder(line) {
	const chestTiers = [`Regular Chests`, `Bronze Key Chests`, `Purple Chests`, `Silver Chests`, `Gold Chests`, `Gold Key Chests`];
	const relicTiers = Object.keys(RELIC_POOL_BY_NAME);
	const treasureMapTiers = [`Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`];
	const chestTier = chestTiers.findIndex(value => line.startsWith(value));
	const relicTier = relicTiers.findIndex(value => line.includes(`(${value})`));
	const treasureMapTier = treasureMapTiers.findIndex(value => line.startsWith(`Treasure Maps (${value})`));
	const label = chestTier >= 0 ? `Treasure Chests` : line.split(/[(:×]/u, 1)[0].trim();
	const tier = chestTier >= 0 ? chestTier : relicTier >= 0 ? relicTier : treasureMapTier >= 0 ? treasureMapTier : -1;
	const probability = Number.parseFloat(line.match(/: (\d+(?:\.\d+)?)%$/u)?.[1]);
	return { label, line, probability, tier };
}

function compareSourceLines(left, right) {
	const first = sourceLineOrder(left);
	const second = sourceLineOrder(right);
	const labelOrder = first.label.localeCompare(second.label, `en`, { sensitivity: `base` });
	if (labelOrder) {return labelOrder;}
	if (first.tier >= 0 || second.tier >= 0) {return (first.tier < 0 ? Number.MAX_SAFE_INTEGER : first.tier) - (second.tier < 0 ? Number.MAX_SAFE_INTEGER : second.tier);}
	const firstHasChance = Number.isFinite(first.probability);
	const secondHasChance = Number.isFinite(second.probability);
	if (firstHasChance !== secondHasChance) {return firstHasChance ? -1 : 1;}
	if (firstHasChance && first.probability !== second.probability) {return second.probability - first.probability;}
	return first.line.localeCompare(second.line, `en`, { sensitivity: `base` });
}

function visibleRecipes(item) {
	const recipes = (item.recipes || []).filter(recipe => recipe.ingredients?.length);
	if (item.category !== `Schematic`) {return recipes;}

	const unlockedItem = item.name.replace(/ Schematic(?: \d+)?$/u, ``);
	// PalDB mixes equipment-upgrade rows into some schematic production tables; those belong to the equipment path.
	const combinations = recipes.filter(recipe => !recipe.ingredients.some(ingredient => ingredient.name === unlockedItem));
	const tier = /^(.* Schematic) ([1-4])$/u.exec(item.name);
	if (!tier) {return combinations;}
	const code = String(item.code || ``).split(`/`).pop();
	const family = code.replace(/_[2-5]$/u, ``).replace(/(?<=Default)[3-5]$/u, ``);
	if (!SCHEMATIC_COMBINATION_FAMILIES.has(family)) {return [];}
	if (Number(tier[2]) === 1 && !TIER_ONE_SCHEMATIC_COMBINATIONS.has(code)) {return [];}

	const lowerTier = Number(tier[2]) === 1 ? tier[1] : `${tier[1]} ${Number(tier[2]) - 1}`;
	if (!combinations.some(recipe => recipe.ingredients.some(ingredient => ingredient.name === lowerTier))) {
		// Current game recipe rows use five copies of the immediately lower tier at the Drafting Table.
		combinations.unshift({ ingredients: [{ name: lowerTier, quantity: `5` }], requirement: `` });
	}
	return combinations;
}

function sourceEntrySuffix(acquisition, source, entry) {
	let recyclerResult = null;
	if (source.type === `Ancient Relics` && !entry.probability) {
		recyclerResult = relicRecyclerResult(acquisition, entry.location);
	}
	const cost = String(entry.cost || ``).replace(/^1 (.+)s$/u, `1 $1`);
	const quantity = entry.quantity || recyclerResult?.quantity || `1`;
	const probability = entry.probability || recyclerResult?.probability;
	const suffix = `${quantity ? ` ×${formatNumber(quantity)}` : ``}` +
		`${probability ? `: ${probability}` : ``}${cost ? `: ${cost}` : ``}`;
	return suffix;
}

function countedSourceLocation(source, entry) {
	const countedLocation = entry.location.match(/^(\d+) (Palpagos|World Tree) locations$/u);
	if (countedLocation && [`Locations`, `Resource Nodes`, `Effigy Locations`].includes(source.type)) {
		const label = source.type === `Locations` ? `Fixed Locations` : source.type;
		return `${label} (${countedLocation[2]}) ×1: ${formatNumber(countedLocation[1])} locations`;
	}
	const singleLocation = entry.location.match(/^(Palpagos|World Tree) location$/u);
	if (singleLocation && source.type === `Locations`) {
		return `Fixed Location (${singleLocation[1]}) ×1`;
	}
	const eggSpawns = entry.location.match(/^(\d+) (Palpagos|World Tree) egg spawns$/u);
	if (eggSpawns && source.type === `Spawn Locations`) {
		return `Egg Spawns (${eggSpawns[2]}) ×1: ${formatNumber(eggSpawns[1])} locations`;
	}
	return null;
}

function sourceEntryText(acquisition, source, entry) {
	const suffix = sourceEntrySuffix(acquisition, source, entry);
	const qualify = (label, qualifier) =>
		`${label} (${String(qualifier).replace(/: Lvl (?=\d)/u, `, Lv. `)})${suffix}`;
	if (source.type === `Ancient Ruin` && /^Fixed location$/iu.test(entry.location)) {return `${source.type} ×1`;}
	const countedLocation = countedSourceLocation(source, entry);
	if (countedLocation) {return countedLocation;}
	if (source.type === `Ancient Relics`) {return qualify(`Ancient Relic Recycler`, entry.location);}
	if (source.type === `Teafant Springs`) {return `Teafant Springs${suffix}`;}
	if (source.type === `Treasure Maps`) {
		return qualify(`Treasure Maps`, entry.location.replace(/ Treasure Map$/u, ``));
	}
	if (source.type === `Tower Boss`) {
		return qualify(`Tower Boss`, entry.location.replace(` — first clear only`, `, first clear only`));
	}
	if (SELF_DESCRIBING_SOURCES.has(source.type)) {return `${entry.location}${suffix}`;}
	return qualify(source.type, entry.location);
}

function addTreasureSources({ acquisition, source, sections, seen }) {
	for (const chestTier of new Set(source.entries.map(entry => entry.chestTier).filter(Boolean))) {
		if ((acquisition?.lootPools || []).some(pool => lootPoolCategory(acquisition, pool) === chestTier)) {continue;}
		if (!seen.has(chestTier)) {sections.push(`${chestTier} ×1`);}
		seen.add(chestTier);
	}
}

function addRegionalDungeonSources(source, sections) {
	sections.push(compactLootPoolLine(`Dungeon Chests`, source.entries));
	for (const entry of source.entries.filter(value => !/ Dungeon$/u.test(value.location))) {
		const region = entry.location.match(/^(Forest|Volcano|Desert)/u)?.[1];
		const location = WILDLIFE_SANCTUARY_BY_REGION[region] || entry.location;
		sections.push(compactLootPoolLine(`Treasure Chests (${location})`, [entry]));
	}
}

function addCuratedSource({ acquisition, source, sections, seen }) {
	if (source.type === `Treasure`) {
		addTreasureSources({ acquisition, source, sections, seen });
		return true;
	}
	const summary = SOURCE_LABELS[source.type];
	if (summary) {
		const decoded = (acquisition?.lootPools || []).some(pool =>
			(LOOT_POOL_LABELS[pool.category] || pool.category) === summary && pool.probability);
		if (!decoded && !seen.has(summary)) {sections.push(`${summary} ×1`);}
		seen.add(summary);
		return true;
	}
	if ([`Pal Critic`, `Pal Critics`].includes(source.type)) {
		const critics = source.entries.map(entry => entry.location).filter(Boolean).sort((a, b) => a.localeCompare(b));
		sections.push(`Arrogant Pal Critics (${critics.join(`, `)}) ×1`);
		return true;
	}
	if ([`Dungeon Treasure Chests`, `Dungeon Chests`].includes(source.type)) {
		sections.push(compactLootPoolLine(`Dungeon Chests`, source.entries));
		return true;
	}
	if ([`Dungeon and Regional Chests`, `Dungeon or Sanctuary Chests`].includes(source.type)) {
		addRegionalDungeonSources(source, sections);
		return true;
	}
	return false;
}

function appendGroupedLootPools({ acquisition, exactCategories, sections, seen }) {
	const groupedPools = new Map();
	for (const pool of acquisition?.lootPools || []) {
		const category = lootPoolCategory(acquisition, pool);
		groupedPools.set(category, [...(groupedPools.get(category) || []), pool]);
	}
	for (const [category, pools] of groupedPools) {
		if (exactCategories.has(category)) {continue;}
		if (category === `Treasure Chests` && [...seen].some(value => CHEST_TIER_LABELS.has(value))) {continue;}
		if (category === `Dungeons` && sections.some(value => /^Dungeon Chests(?:\s|$)/u.test(value))) {continue;}
		const line = compactLootPoolLine(category, pools);
		if (!seen.has(line)) {sections.push(line);}
		seen.add(line);
	}
}

function exactSourceCategories(acquisition) {
	return new Set((acquisition?.sources || []).flatMap(source => {
		const category = SOURCE_LABELS[source.type] || LOOT_POOL_LABELS[source.type] || source.type;
		const exactEntry = !SOURCE_LABELS[source.type] && source.type !== `Treasure` &&
			source.entries.some(entry => entry.probability && entry.probability !== `varies`);
		const calculatedRelic = source.type === `Ancient Relics` &&
			source.entries.some(entry => relicRecyclerResult(acquisition, entry.location));
		return exactEntry || calculatedRelic ? [category] : [];
	}));
}

function appendDropSources(droppedBy, sections, seen) {
	const item = { droppedBy };
	const palDrops = searchablePalDrops(item);
	if (palDrops.length && !seen.has(`Pal Drops`)) {
		sections.push(compactLootPoolLine(`Pal Drops`, palDrops));
		seen.add(`Pal Drops`);
	}
	for (const drop of nonPalDrops(item)) {
		sections.push(compactLootPoolLine(drop.pal, [drop]));
	}
}

function sourceText(acquisition, merchantLocations, droppedBy = []) {
	const sections = [];
	const seen = new Set();
	const exactCategories = exactSourceCategories(acquisition);
	for (const source of acquisition?.sources || []) {
		// A fixed merchant map is more precise than overlapping procedural stock tables and avoids duplicate merchant claims.
		if (merchantLocations && PROCEDURAL_MERCHANT_SOURCES.has(source.type)) {continue;}
		if (addCuratedSource({ acquisition, source, sections, seen })) {continue;}
		const entries = source.entries.map(entry => sourceEntryText(acquisition, source, entry)).join(`\n`);
		sections.push(entries || `${source.type} ×1`);
		seen.add(source.type);
	}
	for (const merchant of fixedMerchantTypes(merchantLocations)) {
		if (!seen.has(merchant)) {sections.push(`${merchant} ×1`);}
		seen.add(merchant);
	}
	appendDropSources(droppedBy, sections, seen);
	appendGroupedLootPools({ acquisition, exactCategories, sections, seen });
	const ordered = sections.flatMap(section => section.split(`\n`)).filter(Boolean).sort(compareSourceLines);
	if (acquisition?.note) {ordered.push(acquisition.note);}
	return ordered.join(`\n`);
}

function baseItemFields(item, isJournal) {
	if (isJournal) {
		return [{ name: `Category:`, value: item.category }];
	}
	const stats = item.stats || {};
	return [
		{ name: `Category:`, value: item.category, inline: true },
		{ name: `Weight:`, value: stats.weight === undefined ? `—` : formatNumber(stats.weight), inline: true },
		// Discord groups inline fields in threes; this keeps the two price fields together on the next row.
		{ name: `\u200b`, value: `\u200b`, inline: true },
		{ name: `Buy Price:`, value: stats.buyPrice === undefined ? `Not sold` : formatNumber(stats.buyPrice), inline: true },
		{ name: `Sell Price:`, value: stats.sellPrice === undefined ? `Cannot be sold` : formatNumber(stats.sellPrice), inline: true },
		{ name: `\u200b`, value: `\u200b`, inline: true },
	];
}

function itemStatFields(item, effect, descriptionParts) {
	const stats = item.stats || {};
	const applicable = [
		[`Attack`, stats.attack], [`Defense`, stats.defense], [`Health`, stats.health],
		[`Shield`, stats.shield], [`Nutrition`, stats.nutrition], [`SAN`, stats.san],
		[`Capture Power`, stats.capturePower], [`Speed`, stats.speed], [`Stamina Drain`, stats.staminaDrain],
		[`Durability`, stats.durability], [`Magazine Size`, item.properties?.magazineSize], [`Skill Power`, stats.waza],
	].filter(([, value]) => value !== undefined);
	const fields = [];
	if (effect?.value) {
		fields.push({ name: effect.label, value: effect.value.slice(0, 1024) });
	} else if (applicable.length) {
		fields.push({
			name: `Stats:`,
			value: applicable.map(([label, value]) => `${label}: **${formatNumber(value)}**`).join(` • `),
		});
	}
	if (descriptionParts.perks.length) {
		fields.push({ name: `Perks:`, value: descriptionParts.perks.join(`\n`) });
	}
	return fields;
}

function recipeLabel(item, workbench, plural = false) {
	if (item.category !== `Schematic`) {
		return plural ? `Crafting Recipes:` : `Crafting Materials:`;
	}
	return `Schematic Recipe${plural ? `s` : ``} (${workbench || `Drafting Table`}):`;
}

function itemRecipeFields(item) {
	const recipes = visibleRecipes(item);
	const workbench = itemWorkbench(item);
	const fields = [];
	if (recipes.length === 1) {
		const recipe = recipes[0];
		if (recipe.outputQuantity) {fields.push({ name: `Output Quantity:`, value: formatNumber(recipe.outputQuantity) });}
		if (recipe.requirement) {
			fields.push({ name: `Tech Level:`, value: recipe.requirement.replace(/^Technology Lv\.\s*/u, ``) });
		}
		fields.push({
			name: recipeLabel(item, workbench),
			value: recipe.ingredients.map(ingredient => `${ingredient.name} ×${ingredient.quantity}`).join(`\n`).slice(0, 1024),
		});
	} else if (recipes.length > 1) {
		const lines = recipes.map(recipe =>
			`${recipe.outputQuantity ? `Produces ×${formatNumber(recipe.outputQuantity)}: ` : ``}` +
			`${recipe.ingredients.map(ingredient => `${ingredient.name} ×${ingredient.quantity}`).join(` + `)}` +
			`${recipe.requirement ? ` (${recipe.requirement})` : ``}`);
		const label = recipeLabel(item, workbench, true);
		for (const [index, value] of chunkLines(lines).entries()) {
			fields.push({ name: index ? `${label.slice(0, -1)} (continued):` : label, value });
		}
	}
	if (workbench && item.category !== `Schematic`) {
		fields.push({ name: `Workbench:`, value: workbench });
	}
	return fields;
}

function itemSourceFields(item) {
	const sources = sourceText(item.acquisition, item.merchantLocations, item.droppedBy);
	if (!sources) {
		if (item.category === `Schematic`) {
			return [{ name: `Sources:`, value: `No verified non-crafting source is recorded.` }];
		}
		return [];
	}
	return chunkLines(sources.split(`\n`)).map((value, index) => ({
		name: index ? `Sources (continued):` : `Sources:`,
		value,
	}));
}

function palDropField(item, pal, normalizeText) {
	if (!pal) {return null;}
	const drop = (item.droppedBy || []).find(entry => normalizeText(entry.pal) === normalizeText(pal.name));
	let value = `Drop details are not available.`;
	if (drop) {
		value = `Drop Chance: **${drop.probability}**\nQuantity: **${drop.quantity}**`;
	}
	return {
		name: `Dropped by ${pal.name}:`,
		value,
	};
}

function itemDescriptionPresentation(item, normalizeText) {
	let effect = itemEffect(item);
	if (normalizeText(effect?.value) === normalizeText(item.description)) {
		effect = null;
	}
	const parts = itemDescriptionParts(item.description);
	let description = parts.description;
	if (effect?.label === `Accessory Effect:` && description.endsWith(effect.value)) {
		description = description.slice(0, -effect.value.length).trim();
	}
	return { description, effect, parts };
}

function createItemCards({ normalizeText, relatedItem, resolveLocalImage }) {
	// Injecting Paldeck's normalization and attachment helpers keeps card output consistent without a circular import.
	function buildItemEmbed(item, pal, thumbnailUrl, mapUrl) {
		const isJournal = Boolean(item.journalEntry) || item.id === `palpagos-journals` || item.id === `world-tree-journals`;
		const ammo = AMMO_BY_CLASS[item.properties?.itemActorClass] || AMMO_BY_TYPE[item.properties?.typeB];
		const { description, effect, parts } = itemDescriptionPresentation(item, normalizeText);
		const fields = baseItemFields(item, isJournal);
		if (ammo) {fields.push({ name: `Ammo Type:`, value: ammo });}
		if (!isJournal) {
			fields.push(...itemStatFields(item, effect, parts), ...itemRecipeFields(item));
		}
		const dropField = palDropField(item, pal, normalizeText);
		if (dropField) {fields.push(dropField);}
		fields.push(...itemSourceFields(item));
		const embed = new EmbedBuilder().setAuthor({ name: `Rarity: ${item.rarity}` }).setDescription(description || `No description available.`).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common).setTitle(item.name).addFields(fields);
		if (thumbnailUrl) {embed.setThumbnail(thumbnailUrl);}
		if (mapUrl) {embed.setImage(mapUrl);}
		return embed;
	}

	function buildItemResponse(item, pal, ownerId, backItemId = null) {
		const thumbnail = resolveLocalImage(item.iconUrl);
		const map = resolveLocalImage(item.acquisition?.map);
		return {
			components: itemControlRows({
				item, pal, ownerId, backItemId, relatedItem: relatedItem(item),
				hasSourceDetails: Boolean(detailPages(item).length),
			}),
			embeds: itemResponseEmbeds({
				item,
				pal,
				thumbnailUrl: thumbnail.url,
				mapUrl: map.url,
				buildItemEmbed,
				rarityColors: ITEM_RARITY_COLORS,
			}),
			files: [...thumbnail.files, ...map.files],
		};
	}

	function buildSourceDetailsResponse(item, requestedPage = 0, ephemeral = true) {
		const pages = detailPages(item);
		const page = Math.max(0, Math.min(Number(requestedPage) || 0, Math.max(0, pages.length - 1)));
		const embed = new EmbedBuilder().setTitle(`Source Chances: ${item.name}`)
			.setDescription(`Drop chances vary by location.\n\n${pages[page] || `No varying location percentages are recorded.`}`)
			.setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common);
		if (pages.length > 1) {embed.setFooter({ text: `Page ${page + 1} of ${pages.length}` });}
		const navigation = new ActionRowBuilder();
		if (page > 0) {navigation.addComponents(new ButtonBuilder().setCustomId(`item:sourcepage:${item.id}:${page - 1}`).setLabel(`Previous`).setStyle(ButtonStyle.Secondary));}
		if (page + 1 < pages.length) {navigation.addComponents(new ButtonBuilder().setCustomId(`item:sourcepage:${item.id}:${page + 1}`).setLabel(`Next`).setStyle(ButtonStyle.Secondary));}
		return { embeds: [embed], files: [], components: navigation.components.length ? [navigation] : [], ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) };
	}

	function buildMerchantResponse(item, property, title, options = {}) {
		const { includeLocations = true, normalizeTypes = false } = options;
		const locations = item[property];
		const thumbnail = resolveLocalImage(item.iconUrl);
		const map = resolveLocalImage(locations?.map);
		const merchants = normalizeTypes ? fixedMerchantTypes(locations) : [...new Set(locations.entries.map(entry => entry.merchant))];
		const embed = new EmbedBuilder().setTitle(title).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common);
		// Specialized buttons already identify their merchant; retain text only when it adds distinct location or merchant-type context.
		if (includeLocations) {embed.setDescription(merchants.map(merchant => `• ${merchant}`).join(`\n`));}
		if (thumbnail.url) {embed.setThumbnail(thumbnail.url);}
		if (map.url) {embed.setImage(map.url);}
		return { embeds: [embed], files: [...thumbnail.files, ...map.files] };
	}

	return {
		buildItemResponse,
		buildSourceDetailsResponse,
		buildMerchantResponse: item => buildMerchantResponse(item, `merchantLocations`, `Merchant Locations: ${item.name}`, { normalizeTypes: true }),
		buildMedalMerchantResponse: item => buildMerchantResponse(item, `medalMerchants`, `Medal Merchants`),
		buildBountyMerchantResponse: item => buildMerchantResponse(item, `bountyMerchants`, `Bounty Officers`, { includeLocations: false }),
		buildArenaMerchantResponse: item => buildMerchantResponse(item, `arenaMerchant`, `Arena Merchant`, { includeLocations: false }),
	};
}

module.exports = { createItemCards, sourceText };
