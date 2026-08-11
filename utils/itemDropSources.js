const palFile = require(`../data/palData.json`);

const SEARCHABLE_PAL_NAMES = new Set(palFile.Pals
	.filter(pal => !pal.hidden)
	.map(pal => pal.name.trim().toLowerCase()));

function isSearchablePalDrop(drop) {
	return SEARCHABLE_PAL_NAMES.has(String(drop?.pal || ``).trim().toLowerCase());
}

function searchablePalDrops(item) {
	return (item?.droppedBy || []).filter(isSearchablePalDrop);
}

function nonPalDrops(item) {
	return (item?.droppedBy || []).filter(drop => !isSearchablePalDrop(drop));
}

module.exports = { isSearchablePalDrop, nonPalDrops, searchablePalDrops };
