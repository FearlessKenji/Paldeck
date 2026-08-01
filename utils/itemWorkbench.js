// Derives the earliest compatible production station from an item's internal type and recipe rank.
function stationForRank(rank, progression) {
	if (!Number.isFinite(rank) || rank <= 0) {
		return null;
	}

	return progression.find(entry => rank <= entry.maxRank)?.name || progression.at(-1)?.name || null;
}

const GENERAL_PROGRESSION = [
	{ maxRank: 1, name: `Primitive Workbench` },
	{ maxRank: 2, name: `High Quality Workbench` },
	{ maxRank: 3, name: `Production Assembly Line` },
	{ maxRank: 4, name: `Production Assembly Line II` },
	{ maxRank: 9, name: `Advanced Workshop` },
	{ maxRank: 10, name: `Ancient Workbench` },
	{ maxRank: Number.POSITIVE_INFINITY, name: `Advanced Workshop` },
];

const WEAPON_PROGRESSION = [
	{ maxRank: 2, name: `Weapon Workbench` },
	{ maxRank: 3, name: `Weapon Assembly Line` },
	{ maxRank: 4, name: `Weapon Assembly Line II` },
	{ maxRank: 9, name: `Advanced Weapon Assembly Line` },
	{ maxRank: 10, name: `Ancient Workbench` },
	{ maxRank: Number.POSITIVE_INFINITY, name: `Advanced Weapon Assembly Line` },
];

const SPHERE_PROGRESSION = [
	{ maxRank: 2, name: `Sphere Workbench` },
	{ maxRank: 3, name: `Sphere Assembly Line` },
	{ maxRank: 5, name: `Sphere Assembly Line II` },
	{ maxRank: 9, name: `Advanced Sphere Assembly Line` },
	{ maxRank: 10, name: `Ancient Workbench` },
	{ maxRank: Number.POSITIVE_INFINITY, name: `Advanced Sphere Assembly Line` },
];

const MEDICINE_PROGRESSION = [
	{ maxRank: 2, name: `Medieval Medicine Workbench` },
	{ maxRank: 4, name: `Electric Medicine Workbench` },
	{ maxRank: 9, name: `Advanced Medicine Workbench` },
	{ maxRank: 10, name: `Ancient Workbench` },
	{ maxRank: Number.POSITIVE_INFINITY, name: `Advanced Medicine Workbench` },
];

const COOKING_PROGRESSION = [
	{ maxRank: 1, name: `Campfire` },
	{ maxRank: 2, name: `Cooking Pot` },
	{ maxRank: 3, name: `Electric Kitchen` },
	{ maxRank: 4, name: `Advanced Cooking Station` },
	{ maxRank: 5, name: `Ancient Kitchen` },
	{ maxRank: Number.POSITIVE_INFINITY, name: `Advanced Cooking Station` },
];

function itemWorkbench(item) {
	if (!item?.recipes?.some(recipe => recipe?.ingredients?.length)) {
		return null;
	}

	const rank = Number(item.stats?.rank);
	const typeA = item.properties?.typeA;
	const typeB = item.properties?.typeB;

	// Rank is the product tier; the item types select the compatible production family.
	if (typeB === `Essential_PalGear`) {
		return `Pal Gear Workbench`;
	}
	if (typeA === `Weapon` || typeA === `Ammo`) {
		return stationForRank(rank, WEAPON_PROGRESSION);
	}
	if (typeB === `SPWeaponCaptureBall`) {
		return stationForRank(rank, SPHERE_PROGRESSION);
	}
	if (typeB === `Drug` || typeB === `ConsumePalRevive` || typeB === `ConsumePalAwakening`) {
		return stationForRank(rank, MEDICINE_PROGRESSION);
	}
	if (typeA === `Food` && /^FoodDish/.test(typeB || ``)) {
		return stationForRank(rank, COOKING_PROGRESSION);
	}
	if (typeB === `FoodVegetable`) {
		return `Mill`;
	}
	if (typeB === `MaterialIngot`) {
		return rank >= 7 ? `Ancient Furnace` : `Gigantic Furnace`;
	}

	return stationForRank(rank, GENERAL_PROGRESSION);
}

module.exports = { itemWorkbench };
