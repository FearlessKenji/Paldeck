/* eslint-disable max-len, max-statements-per-line -- compact lookup tables and Discord builder chains remain more readable together. */
// Builds consistent item, acquisition-map, and fixed-merchant Discord responses.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require(`discord.js`);
const { itemWorkbench } = require(`./itemWorkbench.js`);

const ITEM_RARITY_COLORS = {
	Common: 0x9ca3af, Uncommon: 0x22c55e, Rare: 0x3b82f6, Epic: 0xa855f7, Legendary: 0xf59e0b,
};
const SOURCE_LABELS = {
	Treasure: `Treasure Chests`, "Treasure Element": `Elemental Chests`, Supply: `Supply Drops`, Junk: `Junk`,
	"Salvage Rank1": `Salvage`, "Salvage Rank2": `Salvage`, "World Tree Fishing": `Fishing`, "World Tree Junk": `Junk`,
	Expeditions: `Expeditions`, "Enemy Camps": `Enemy Camps`,
};
const SOURCE_CATEGORIES = {
	"Dungeon Treasure Chests": `Dungeon Chests`, "Dungeon and Regional Chests": `Dungeon Chests`,
	"Dungeon or Sanctuary Chests": `Dungeon Chests`, "Dungeon Chests": `Dungeon Chests`,
	"Possible Destinations": `Treasure Maps`, "Skill Fruit Trees": `Skill Fruit Trees`,
};
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

function sourceText(acquisition) {
	const sections = [];
	const seen = new Set();
	for (const source of acquisition?.sources || []) {
		const summary = SOURCE_LABELS[source.type];
		if (summary) {
			if (!seen.has(summary)) {sections.push(summary);}
			seen.add(summary);
			continue;
		}
		const entries = source.entries.map(entry => `${entry.location}${entry.quantity ? ` ×${entry.quantity}` : ``}${entry.probability ? `: ${entry.probability}` : ``}${entry.cost ? `: ${entry.cost}` : ``}`).join(`\n`);
		// Effigy cards already identify the mapped collectible, so repeating its source type adds no information.
		if (source.type === `Effigy Locations`) {
			if (entries) {sections.push(entries);}
		} else {
			sections.push(entries ? `${source.type}\n${entries}` : source.type);
		}
		seen.add(SOURCE_CATEGORIES[source.type] || source.type);
	}
	// Loot-pool categories fill gaps in curated map sources without exposing internal pool identifiers to users.
	for (const pool of acquisition?.lootPools || []) {
		if (!seen.has(pool.category)) {
			sections.push(pool.category);
			seen.add(pool.category);
		}
	}
	if (acquisition?.note) {sections.push(acquisition.note);}
	return sections.join(`\n`).slice(0, 1024);
}

function createItemCards({ normalizeText, resolveLocalImage }) {
	// Injecting Paldeck's normalization and attachment helpers keeps card output consistent without a circular import.
	function buildItemEmbed(item, pal, thumbnailUrl, mapUrl) {
		const stats = item.stats || {};
		const ammo = AMMO_BY_CLASS[item.properties?.itemActorClass] || AMMO_BY_TYPE[item.properties?.typeB];
		let effect = itemEffect(item);
		if (normalizeText(effect?.value) === normalizeText(item.description)) {effect = null;}
		let description = item.description;
		if (effect?.label === `Accessory Effect:` && description.endsWith(effect.value)) {description = description.slice(0, -effect.value.length).trim();}
		const fields = [
			{ name: `Category:`, value: item.category, inline: true },
			{ name: `Weight:`, value: stats.weight === undefined ? `—` : formatNumber(stats.weight), inline: true },
			{ name: `Maximum Stack:`, value: stats.maxStackCount === undefined ? `—` : formatNumber(stats.maxStackCount), inline: true },
			{ name: `Buy Price:`, value: stats.buyPrice === undefined ? `Not sold` : formatNumber(stats.buyPrice), inline: true },
			{ name: `Sell Price:`, value: stats.sellPrice === undefined ? `Cannot be sold` : formatNumber(stats.sellPrice), inline: true },
			ammo ? { name: `Ammo Type:`, value: ammo, inline: true } : { name: `\u200b`, value: `\u200b`, inline: true },
		];
		const applicable = [[`Attack`, stats.attack], [`Defense`, stats.defense], [`Health`, stats.health], [`Shield`, stats.shield], [`Nutrition`, stats.nutrition], [`SAN`, stats.san], [`Capture Power`, stats.capturePower], [`Speed`, stats.speed], [`Stamina Drain`, stats.staminaDrain], [`Durability`, stats.durability], [`Magazine Size`, item.properties?.magazineSize], [`Skill Power`, stats.waza]].filter(([, value]) => value !== undefined);
		if (effect?.value) {fields.push({ name: effect.label, value: effect.value.slice(0, 1024) });} else if (applicable.length) {fields.push({ name: `Stats:`, value: applicable.map(([label, value]) => `${label}: **${formatNumber(value)}**`).join(` • `) });}
		const recipes = (item.recipes || []).filter(recipe => recipe.ingredients?.length);
		if (recipes.length === 1) {
			const recipe = recipes[0];
			fields.push({ name: `Crafting Materials:`, value: `${recipe.ingredients.map(i => `${i.name} ×${i.quantity}`).join(`\n`)}${recipe.requirement ? `\n${recipe.requirement}` : ``}`.slice(0, 1024) });
		} else if (recipes.length > 1) {
			const lines = recipes.map(recipe => `${recipe.ingredients.map(i => `${i.name} ×${i.quantity}`).join(` + `)}${recipe.requirement ? ` (${recipe.requirement})` : ``}`);
			for (const [index, value] of chunkLines(lines).entries()) {fields.push({ name: index ? `Crafting Recipes (continued):` : `Crafting Recipes:`, value });}
		}
		if (recipes.length && itemWorkbench(item)) {fields.push({ name: `Workbench:`, value: itemWorkbench(item) });}
		if (pal) {
			const drop = (item.droppedBy || []).find(entry => normalizeText(entry.pal) === normalizeText(pal.name));
			fields.push({ name: `Dropped by ${pal.name}:`, value: drop ? `Drop Chance: **${drop.probability}**\nQuantity: **${drop.quantity}**` : `Drop details are not available.` });
		}
		const sources = sourceText(item.acquisition);
		if (sources) {fields.push({ name: `Sources:`, value: sources });}
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
		add(item.medalMerchants?.entries?.length && ownerId, `medalmerchants`, `Medal Merchants`);
		if (pal && ownerId) {row.addComponents(new ButtonBuilder().setCustomId(`paldeck:back:${encodeURIComponent(pal.number)}:${ownerId}`).setLabel(`Back to Pal`).setStyle(ButtonStyle.Secondary));}
		return { components: row.components.length ? [row] : [], embeds: [buildItemEmbed(item, pal, thumbnail.url, map.url)], files: [...thumbnail.files, ...map.files] };
	}

	function buildMerchantResponse(item, property, title) {
		const locations = item[property];
		const thumbnail = resolveLocalImage(item.iconUrl);
		const map = resolveLocalImage(locations?.map);
		const embed = new EmbedBuilder().setTitle(title).setDescription(locations.entries.map(entry => `• ${entry.merchant}`).join(`\n`)).setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common);
		if (thumbnail.url) {embed.setThumbnail(thumbnail.url);}
		if (map.url) {embed.setImage(map.url);}
		return { embeds: [embed], files: [...thumbnail.files, ...map.files] };
	}

	return {
		buildItemResponse,
		buildMerchantResponse: item => buildMerchantResponse(item, `merchantLocations`, `Merchant Locations: ${item.name}`),
		buildMedalMerchantResponse: item => buildMerchantResponse(item, `medalMerchants`, `Medal Merchants`),
	};
}

module.exports = { createItemCards };
