// Defines the stable, player-facing source taxonomy used by /item search.
const { searchablePalDrops } = require(`./itemDropSources.js`);

const CHEST_TYPES = [
	`Regular Chests`, `Bronze Key Chests`, `Purple Chests`, `Silver Chests`, `Gold Chests`, `Gold Key Chests`,
];

function sourceTypes(item) {
	return new Set((item.acquisition?.sources || []).map(source => source.type));
}

function hasSource(item, expected) {
	return [...sourceTypes(item)].some(type => expected.includes(type));
}

function hasChestType(item, chestType) {
	return (item.acquisition?.sources || []).some(source => source.type === `Treasure` &&
		source.entries.some(entry => entry.chestTier === chestType));
}

function droppedByEncounter(item, palsByName, pattern) {
	return (item.droppedBy || []).some(drop => pattern.test(palsByName.get(drop.pal.toLowerCase())?.spawnTime || ``));
}

function createItemSourceFilters(pals) {
	const palsByName = new Map(pals.map(pal => [pal.name.toLowerCase(), pal]));
	const filters = [
		...CHEST_TYPES.map(label => ({ label, matches: item => hasChestType(item, label) })),
		{ label: `Alpha Pals`, matches: item => droppedByEncounter(item, palsByName, /Alpha|Boss/iu) },
		{ label: `Ancient Relics`, matches: item => hasSource(item, [`Ancient Relics`]) },
		{ label: `Ancient Ruins`, matches: item => hasSource(item, [`Ancient Ruin`]) },
		{ label: `Arena Merchant`, matches: item => hasSource(item, [`Arena Merchant`]) },
		{ label: `Bounty Shop`, matches: item => hasSource(item, [`Bounty Shop`]) },
		{ label: `Bounty Targets`, matches: item => hasSource(item, [`Bounty Targets`]) },
		{ label: `Dungeons`, matches: item => hasSource(item, [`Dungeons`, `Dungeon Chests`, `Dungeon Treasure Chests`, `Dungeon and Regional Chests`, `Dungeon or Sanctuary Chests`]) },
		{ label: `Effigy Locations`, matches: item => hasSource(item, [`Effigy Locations`]) },
		{ label: `Enemy Camps`, matches: item => hasSource(item, [`Enemy Camps`]) },
		{ label: `Expeditions`, matches: item => hasSource(item, [`Expeditions`]) },
		{ label: `Fishing`, matches: item => hasSource(item, [`Fishing`, `World Tree Fishing`]) },
		{ label: `Fishing Ponds`, matches: item => hasSource(item, [`Fishing Ponds`]) },
		{ label: `Junk`, matches: item => hasSource(item, [`Junk`, `World Tree Junk`]) },
		{ label: `Medal Merchants`, matches: item => hasSource(item, [`Medal Merchants`]) },
		{ label: `Merchants`, matches: item => Boolean(item.merchantLocations?.entries?.length) || hasSource(item, [`Caravan Merchants`, `Dungeon Merchant`, `Wandering Merchants`]) },
		{ label: `Meteorite Events`, matches: item => droppedByEncounter(item, palsByName, /Meteorite Event/iu) },
		{ label: `Missions`, matches: item => hasSource(item, [`Mission`]) },
		{ label: `Oil Rigs`, matches: item => hasSource(item, [`Oil Rigs`]) },
		{ label: `Pal Drops`, matches: item => Boolean(searchablePalDrops(item).length) },
		{ label: `Resource Nodes`, matches: item => hasSource(item, [`Resource Nodes`]) },
		{ label: `Salvage`, matches: item => hasSource(item, [`Salvage Rank1`, `Salvage Rank2`]) },
		{ label: `Skill Fruit Trees`, matches: item => hasSource(item, [`Skill Fruit Trees`]) },
		{ label: `Summoning Altars`, matches: item => hasSource(item, [`Summoning Altar`]) },
		{ label: `Supply Drops`, matches: item => hasSource(item, [`Supply`]) },
		{ label: `Teafant Springs`, matches: item => hasSource(item, [`Teafant Springs`]) },
		{ label: `Towers`, matches: item => hasSource(item, [`Tower Boss`]) },
		{ label: `Treasure Chests`, matches: item => hasSource(item, [`Treasure`]) },
		{ label: `Treasure Maps`, matches: item => hasSource(item, [`Treasure Maps`]) },
	].sort((left, right) => left.label.localeCompare(right.label));
	return filters;
}

module.exports = { createItemSourceFilters };
