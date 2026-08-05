/* eslint-disable max-len, max-statements-per-line -- compact lookup tables and Discord builder chains remain more readable together. */
// Builds consistent item, acquisition-map, and fixed-merchant Discord responses.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require(`discord.js`);
const { itemDescriptionParts } = require(`./itemDescription.js`);
const { itemWorkbench } = require(`./itemWorkbench.js`);

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
const SPECIAL_MERCHANT_BUTTONS = [
	[`medalMerchants`, `medalmerchants`, `Medal Merchants`],
	[`bountyMerchants`, `bountymerchants`, `Bounty Officers`],
	[`arenaMerchant`, `arenamerchant`, `Arena Merchant`],
];
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
	const quantities = new Set(matches.map(pool => pool.quantity).filter(Boolean));
	return {
		probability: `${percentage.toFixed(3).replace(/0+$/u, ``).replace(/\.$/u, ``)}%`,
		quantity: quantities.size === 1 ? [...quantities][0] : null,
	};
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

function sourceText(acquisition, merchantLocations) {
	const sections = [];
	const seen = new Set();
	for (const source of acquisition?.sources || []) {
		// A fixed merchant map is more precise than overlapping procedural stock tables and avoids duplicate merchant claims.
		if (merchantLocations && PROCEDURAL_MERCHANT_SOURCES.has(source.type)) {continue;}
		if (source.type === `Treasure`) {
			// The attached map communicates eligible regions; the card only needs each distinct chest type.
			for (const chestTier of new Set(source.entries.map(entry => entry.chestTier).filter(Boolean))) {
				if (!seen.has(chestTier)) {sections.push(chestTier);}
				seen.add(chestTier);
			}
			continue;
		}
		const summary = SOURCE_LABELS[source.type];
		if (summary) {
			if (!seen.has(summary)) {sections.push(summary);}
			seen.add(summary);
			continue;
		}
		const entries = source.entries.flatMap(entry => {
			const redundantLocation = source.type === `Ancient Ruin` && /^Fixed location$/iu.test(entry.location);
			const selfDescribingLocation = SELF_DESCRIBING_SOURCES.has(source.type);
			const recyclerResult = source.type === `Ancient Relics` && !entry.probability ? relicRecyclerResult(acquisition, entry.location) : null;
			const cost = String(entry.cost || ``).replace(/^1 (.+)s$/u, `1 $1`);
			const quantity = entry.quantity || recyclerResult?.quantity;
			const probability = entry.probability || recyclerResult?.probability;
			const suffix = `${quantity ? ` ×${formatNumber(quantity)}` : ``}${probability ? `: ${probability}` : ``}${cost ? `: ${cost}` : ``}`;
			const qualify = (label, qualifier) => `${label} (${String(qualifier).replace(/: Lvl (?=\d)/u, `, Lv. `)})${suffix}`;
			if (redundantLocation) {return source.type;}
			const countedLocation = entry.location.match(/^(\d+) (Palpagos|World Tree) locations$/u);
			if (countedLocation && [`Locations`, `Resource Nodes`, `Effigy Locations`].includes(source.type)) {
				const label = source.type === `Locations` ? `Fixed Locations` : source.type;
				return `${label} (${countedLocation[2]}): ${formatNumber(countedLocation[1])} locations`;
			}
			const singleLocation = entry.location.match(/^(Palpagos|World Tree) location$/u);
			if (singleLocation && source.type === `Locations`) {return `Fixed Location (${singleLocation[1]})`;}
			const eggSpawns = entry.location.match(/^(\d+) (Palpagos|World Tree) egg spawns$/u);
			if (eggSpawns && source.type === `Spawn Locations`) {
				return `Egg Spawns (${eggSpawns[2]}): ${formatNumber(eggSpawns[1])} locations`;
			}
			if (source.type === `Ancient Relics`) {return qualify(`Ancient Relic Recycler`, entry.location);}
			if ([`Pal Critic`, `Pal Critics`].includes(source.type)) {return qualify(`Arrogant Pal Critic`, entry.location);}
			if (source.type === `Treasure Maps`) {
				return qualify(`Treasure Maps`, entry.location.replace(/ Treasure Map$/u, ``));
			}
			if (source.type === `Tower Boss`) {
				return qualify(`Tower Boss`, entry.location.replace(` — first clear only`, `, first clear only`));
			}
			if (source.type === `Dungeon Treasure Chests`) {return qualify(`Dungeon Chests`, entry.location);}
			if (source.type === `Dungeon Chests`) {return qualify(`Dungeon Chests`, entry.location.replace(/ Dungeon$/u, ``));}
			if (source.type === `Dungeon and Regional Chests`) {
				return / Dungeon$/u.test(entry.location) ?
					qualify(`Dungeon Chests`, entry.location.replace(/ Dungeon$/u, ``)) :
					qualify(`Treasure Chests`, entry.location);
			}
			if (source.type === `Dungeon or Sanctuary Chests`) {
				const region = entry.location.match(/^(Forest|Volcano|Desert)/u)?.[1];
				if (region && WILDLIFE_SANCTUARY_BY_REGION[region]) {
					return [qualify(`Dungeon Chests`, region), qualify(`Treasure Chests`, WILDLIFE_SANCTUARY_BY_REGION[region])];
				}
			}
			if (selfDescribingLocation) {return `${entry.location}${suffix}`;}
			return qualify(source.type, entry.location);
		}).join(`\n`);
		sections.push(entries || source.type);
		seen.add(source.type);
	}
	for (const merchant of fixedMerchantTypes(merchantLocations)) {
		if (!seen.has(merchant)) {sections.push(merchant);}
		seen.add(merchant);
	}
	// Normalized loot-pool categories fill gaps without exposing internal game table identifiers.
	for (const pool of acquisition?.lootPools || []) {
		const category = LOOT_POOL_LABELS[pool.category] || pool.category;
		// A decoded regional chest pool is already represented more precisely by its player-facing chest type.
		if (category === `Treasure Chests` && [...seen].some(value => CHEST_TIER_LABELS.has(value))) {continue;}
		if (category === `Dungeons` && sections.some(value => /^Dungeon Chests(?:\s|$)/u.test(value))) {continue;}
		if (!seen.has(category)) {sections.push(category);}
		seen.add(category);
	}
	const ordered = sections.flatMap(section => section.split(`\n`)).filter(Boolean).sort(compareSourceLines);
	if (acquisition?.note) {ordered.push(acquisition.note);}
	return ordered.join(`\n`).slice(0, 1024);
}

function createItemCards({ normalizeText, resolveLocalImage }) {
	// Injecting Paldeck's normalization and attachment helpers keeps card output consistent without a circular import.
	function buildItemEmbed(item, pal, thumbnailUrl, mapUrl) {
		const stats = item.stats || {};
		const isJournal = Boolean(item.journalEntry) || item.id === `palpagos-journals` || item.id === `world-tree-journals`;
		const ammo = AMMO_BY_CLASS[item.properties?.itemActorClass] || AMMO_BY_TYPE[item.properties?.typeB];
		let effect = itemEffect(item);
		if (normalizeText(effect?.value) === normalizeText(item.description)) {effect = null;}
		const descriptionParts = itemDescriptionParts(item.description);
		let description = descriptionParts.description;
		if (effect?.label === `Accessory Effect:` && description.endsWith(effect.value)) {description = description.slice(0, -effect.value.length).trim();}
		let fields;
		if (isJournal) {
			fields = [{ name: `Category:`, value: item.category }];
		} else {
			fields = [
				{ name: `Category:`, value: item.category, inline: true },
				{ name: `Weight:`, value: stats.weight === undefined ? `—` : formatNumber(stats.weight), inline: true },
				// Discord groups inline fields in threes; this keeps the two price fields together on the next row.
				{ name: `\u200b`, value: `\u200b`, inline: true },
				{ name: `Buy Price:`, value: stats.buyPrice === undefined ? `Not sold` : formatNumber(stats.buyPrice), inline: true },
				{ name: `Sell Price:`, value: stats.sellPrice === undefined ? `Cannot be sold` : formatNumber(stats.sellPrice), inline: true },
				{ name: `\u200b`, value: `\u200b`, inline: true },
			];
		}
		if (ammo) {fields.push({ name: `Ammo Type:`, value: ammo });}
		// Journals are collectibles rather than inventory items, so inventory-only fields would be misleading.
		if (isJournal) {fields = fields.slice(0, 1);}
		const applicable = [[`Attack`, stats.attack], [`Defense`, stats.defense], [`Health`, stats.health], [`Shield`, stats.shield], [`Nutrition`, stats.nutrition], [`SAN`, stats.san], [`Capture Power`, stats.capturePower], [`Speed`, stats.speed], [`Stamina Drain`, stats.staminaDrain], [`Durability`, stats.durability], [`Magazine Size`, item.properties?.magazineSize], [`Skill Power`, stats.waza]].filter(([, value]) => value !== undefined);
		if (effect?.value) {fields.push({ name: effect.label, value: effect.value.slice(0, 1024) });} else if (applicable.length) {fields.push({ name: `Stats:`, value: applicable.map(([label, value]) => `${label}: **${formatNumber(value)}**`).join(` • `) });}
		if (descriptionParts.perks.length) {fields.push({ name: `Perks:`, value: descriptionParts.perks.join(`\n`) });}
		const recipes = visibleRecipes(item);
		const workbench = itemWorkbench(item);
		if (recipes.length === 1) {
			const recipe = recipes[0];
			if (recipe.outputQuantity) {fields.push({ name: `Output Quantity:`, value: formatNumber(recipe.outputQuantity) });}
			if (recipe.requirement) {fields.push({ name: `Tech Level:`, value: recipe.requirement.replace(/^Technology Lv\.\s*/u, ``) });}
			const recipeLabel = item.category === `Schematic` ? `Schematic Recipe (${workbench || `Drafting Table`}):` : `Crafting Materials:`;
			fields.push({ name: recipeLabel, value: recipe.ingredients.map(i => `${i.name} ×${i.quantity}`).join(`\n`).slice(0, 1024) });
		} else if (recipes.length > 1) {
			const lines = recipes.map(recipe => `${recipe.outputQuantity ? `Produces ×${formatNumber(recipe.outputQuantity)}: ` : ``}${recipe.ingredients.map(i => `${i.name} ×${i.quantity}`).join(` + `)}${recipe.requirement ? ` (${recipe.requirement})` : ``}`);
			const recipeLabel = item.category === `Schematic` ? `Schematic Recipes (${workbench || `Drafting Table`}):` : `Crafting Recipes:`;
			for (const [index, value] of chunkLines(lines).entries()) {fields.push({ name: index ? `${recipeLabel.slice(0, -1)} (continued):` : recipeLabel, value });}
		}
		if (workbench && item.category !== `Schematic`) {fields.push({ name: `Workbench:`, value: workbench });}
		if (pal) {
			const drop = (item.droppedBy || []).find(entry => normalizeText(entry.pal) === normalizeText(pal.name));
			fields.push({ name: `Dropped by ${pal.name}:`, value: drop ? `Drop Chance: **${drop.probability}**\nQuantity: **${drop.quantity}**` : `Drop details are not available.` });
		}
		const sources = sourceText(item.acquisition, item.merchantLocations);
		if (sources) {
			fields.push({ name: `Sources:`, value: sources });
		} else if (item.category === `Schematic`) {
			fields.push({ name: `Sources:`, value: `No verified non-crafting source is recorded.` });
		}
		const embed = new EmbedBuilder().setAuthor({ name: `Rarity: ${item.rarity}` }).setDescription(description || `No description available.`).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common).setTitle(item.name).addFields(fields);
		if (thumbnailUrl) {embed.setThumbnail(thumbnailUrl);}
		if (mapUrl) {embed.setImage(mapUrl);}
		return embed;
	}

	function buildItemResponse(item, pal, ownerId) {
		const thumbnail = resolveLocalImage(item.iconUrl);
		const map = resolveLocalImage(item.acquisition?.map);
		const row = new ActionRowBuilder();
		const add = (condition, action, label) => condition && row.addComponents(new ButtonBuilder().setCustomId(`item:${action}:${item.id}:${ownerId}:${action === `drops` && pal ? encodeURIComponent(pal.number) : ``}`).setLabel(label).setStyle(ButtonStyle.Secondary));
		add((item.droppedBy || []).length && ownerId, `drops`, `View Dropping Pals`);
		add(item.merchantLocations?.entries?.length && ownerId, `merchants`, `Merchant Locations`);
		for (const [property, action, label] of SPECIAL_MERCHANT_BUTTONS) {add(item[property]?.entries?.length && ownerId, action, label);}
		if (pal && ownerId) {row.addComponents(new ButtonBuilder().setCustomId(`paldeck:back:${encodeURIComponent(pal.number)}:${ownerId}`).setLabel(`Back to Pal`).setStyle(ButtonStyle.Secondary));}
		const separateMap = Boolean(map.url);
		const embeds = [buildItemEmbed(item, pal, thumbnail.url, separateMap ? null : map.url)];
		if (separateMap) {
			// Preview a detached map embed so its dimensions cannot constrain the information card layout.
			embeds.push(new EmbedBuilder().setImage(map.url).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common));
		}
		return { components: row.components.length ? [row] : [], embeds, files: [...thumbnail.files, ...map.files] };
	}

	function buildMerchantResponse(item, property, title, normalizeTypes = false) {
		const locations = item[property];
		const thumbnail = resolveLocalImage(item.iconUrl);
		const map = resolveLocalImage(locations?.map);
		const merchants = normalizeTypes ? fixedMerchantTypes(locations) : [...new Set(locations.entries.map(entry => entry.merchant))];
		const embed = new EmbedBuilder().setTitle(title).setDescription(merchants.map(merchant => `• ${merchant}`).join(`\n`)).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common);
		if (thumbnail.url) {embed.setThumbnail(thumbnail.url);}
		if (map.url) {embed.setImage(map.url);}
		return { embeds: [embed], files: [...thumbnail.files, ...map.files] };
	}

	return {
		buildItemResponse,
		buildMerchantResponse: item => buildMerchantResponse(item, `merchantLocations`, `Merchant Locations: ${item.name}`, true),
		buildMedalMerchantResponse: item => buildMerchantResponse(item, `medalMerchants`, `Medal Merchants`),
		buildBountyMerchantResponse: item => buildMerchantResponse(item, `bountyMerchants`, `Bounty Officers`),
		buildArenaMerchantResponse: item => buildMerchantResponse(item, `arenaMerchant`, `Arena Merchant`),
	};
}

module.exports = { createItemCards, sourceText };
