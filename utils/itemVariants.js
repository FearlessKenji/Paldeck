// Resolves player-facing item families and exact-rarity schematic relationships.
function normalizeItemName(value) {
	return String(value || ``).trim().toLowerCase();
}

function schematicFamilyName(name) {
	return String(name || ``).replace(/ Schematic \d+$/u, ` Schematic`);
}

function unlockedItemName(schematic) {
	const match = String(schematic?.description || ``).match(/unlocks recipe for (.+?)(?: \([^)]+\))?\. Can be crafted/iu);
	return match?.[1]?.trim() || schematicFamilyName(schematic?.name).replace(/ Schematic$/u, ``);
}

function createItemVariantIndex(items) {
	const itemsByName = new Map();
	for (const item of items) {
		const name = normalizeItemName(item.name);
		const family = normalizeItemName(schematicFamilyName(item.name));
		for (const key of new Set([name, family])) {
			const indexedItems = itemsByName.get(key) || [];
			indexedItems.push(item);
			itemsByName.set(key, indexedItems);
		}
	}

	function variants(name) {
		return [...(itemsByName.get(normalizeItemName(name)) || [])]
			.sort((first, second) => first.rarityRank - second.rarityRank);
	}

	function find(name, rarity) {
		const matches = variants(name);
		if (!rarity) {
			return matches[0] || null;
		}
		return matches.find(item => item.rarity === rarity) || null;
	}

	function counterpart(item) {
		if (item.category === `Schematic`) {
			return find(unlockedItemName(item), item.rarity);
		}
		return items.find(candidate => candidate.category === `Schematic` && candidate.rarity === item.rarity &&
			normalizeItemName(unlockedItemName(candidate)) === normalizeItemName(item.name)) || null;
	}

	return { counterpart, find, variants };
}

module.exports = { createItemVariantIndex, normalizeItemName, schematicFamilyName, unlockedItemName };
