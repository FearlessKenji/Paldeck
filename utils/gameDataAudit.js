// Normalizes decoded game tables into deterministic comparisons without modifying curated item records.
/* eslint-disable max-statements-per-line -- compact normalization loops mirror fixed game-table fields. */
function gameId(item) {
	return normalizedId(rawGameId(item));
}

function rawGameId(item) {
	return String(item.code || ``).split(`/`).at(-1);
}

function normalizedId(value) {
	return String(value || ``).toLowerCase();
}

function rowValue(entry) {
	return entry?.Value || entry?.value || {};
}

function tableRows(snapshot, name) {
	const table = snapshot.tables?.[name] || snapshot[name] || [];
	return Array.isArray(table) ? table : Object.entries(table).map(([Key, Value]) => ({ Key, Value }));
}

function decodedTable(snapshot, suffix) {
	return Object.entries(snapshot.tables?._decodedTables || {}).find(([name]) => name.endsWith(suffix))?.[1] || {};
}

function compareGameBreeding(palData, palBreeding, snapshot) {
	const idByName = new Map((palData.Pals || []).map(pal => [pal.name, normalizedId(pal.breeding?.id)]));
	const localByRow = new Map((palBreeding.UniqueCombinations || []).map(row => [String(row.row), row]));
	const gameRows = Object.entries(decodedTable(snapshot, `/DT_PalCombiUnique`));
	const meaningful = gameRows.filter(([, row]) => normalizedId(row.ParentTribeA) !== normalizedId(row.ParentTribeB));
	const mismatches = [];
	for (const [rowId, game] of meaningful) {
		const local = localByRow.get(rowId);
		const gameParents = [game.ParentTribeA, game.ParentTribeB]
			.map(value => normalizedId(String(value).split(`::`).at(-1))).sort();
		const localParents = local ? [idByName.get(local.parentA), idByName.get(local.parentB)].sort() : [];
		const gameChild = normalizedId(game.ChildCharacterID);
		const localChild = local ? idByName.get(local.child) : ``;
		if (!local || JSON.stringify(gameParents) !== JSON.stringify(localParents) || gameChild !== localChild) {
			mismatches.push({ row: rowId, gameParents, gameChild, local });
		}
	}
	const meaningfulRows = new Set(meaningful.map(([row]) => row));
	const extraLocalRows = [...localByRow.keys()].filter(row => !meaningfulRows.has(row)).sort();
	return {
		gameRows: gameRows.length, redundantSameSpeciesRows: gameRows.length - meaningful.length,
		meaningfulRows: meaningful.length, localRows: localByRow.size, mismatches, extraLocalRows,
	};
}

function normalizedGameRecipe(entry) {
	const row = rowValue(entry);
	const ingredients = [];
	for (let index = 1; index <= 5; index += 1) {
		const id = normalizedId(row[`Material${index}_Id`]);
		const quantity = Number(row[`Material${index}_Count`] || 0);
		if (id && id !== `none` && quantity > 0) {ingredients.push({ id, quantity });}
	}
	const malformedMaterials = Array.from({ length: 5 }, (_value, index) => index + 1).flatMap(index => {
		const id = normalizedId(row[`Material${index}_Id`]);
		const quantity = Number(row[`Material${index}_Count`] || 0);
		return id === `none` && quantity > 0 ? [{ slot: index, quantity }] : [];
	});
	return {
		row: entry.Key,
		productId: normalizedId(row.Product_Id),
		productCount: Number(row.Product_Count || 0),
		ingredients: ingredients.sort((left, right) => left.id.localeCompare(right.id)),
		unlockItemId: normalizedId(row.UnlockItemID),
		workableAttribute: Number(row.WorkableAttribute || 0),
		malformedMaterials,
	};
}

function normalizedLocalRecipe(recipe, idsByName) {
	const ingredients = (recipe.ingredients || []).map(ingredient => ({
		id: ingredient.code ? normalizedId(String(ingredient.code).split(`/`).at(-1)) : idsByName.get(ingredient.name) || `?${ingredient.name}`,
		quantity: Number(ingredient.quantity),
	})).sort((left, right) => left.id.localeCompare(right.id));
	return { ingredients, requirement: recipe.requirement || `` };
}

function sameIngredients(left, right) {
	return JSON.stringify(left.ingredients) === JSON.stringify(right.ingredients);
}

function collectStringEvidence(value, knownIds, found = new Set()) {
	if (typeof value === `string`) {
		const id = normalizedId(value);
		if (knownIds.has(id)) {found.add(id);}
		return found;
	}
	if (Array.isArray(value)) {
		for (const child of value) {collectStringEvidence(child, knownIds, found);}
		return found;
	}
	if (value && typeof value === `object`) {
		for (const child of Object.values(value)) {collectStringEvidence(child, knownIds, found);}
	}
	return found;
}

function collectCasingMismatches(value, canonicalIds, table, found = new Map()) {
	if (typeof value === `string`) {
		const canonical = canonicalIds.get(normalizedId(value));
		if (canonical && value !== canonical) {
			found.set(`${table}\0${value}\0${canonical}`, { table, reference: value, canonical });
		}
		return found;
	}
	if (Array.isArray(value)) {
		for (const child of value) {collectCasingMismatches(child, canonicalIds, table, found);}
		return found;
	}
	if (value && typeof value === `object`) {
		for (const child of Object.values(value)) {collectCasingMismatches(child, canonicalIds, table, found);}
	}
	return found;
}

function collectPalReferences(value, knownIds, found = new Set()) {
	if (typeof value === `string`) {
		const id = normalizedId(value).replace(/^(?:boss|raid|gym)_/u, ``).replace(/_\d+$/u, ``);
		if (knownIds.has(id)) {found.add(id);}
		return found;
	}
	if (Array.isArray(value)) {for (const child of value) {collectPalReferences(child, knownIds, found);} return found;}
	if (value && typeof value === `object`) {for (const child of Object.values(value)) {collectPalReferences(child, knownIds, found);}}
	return found;
}

function compareGamePalAvailability(palData, snapshot) {
	const pals = palData.Pals || [];
	const byId = new Map(pals.map(pal => [normalizedId(pal.breeding?.id), pal]).filter(([id]) => id));
	const decoded = snapshot.tables?._decodedTables || {};
	const families = [
		[`Meteor Event`, /SupplyIncident\/DT_SupplyIncident_Pal/iu], [`Factions`, /CapturedCagePal/iu], [`Fishing Pond`, /PalFishPond/iu],
		[`Fishing`, /FishingSpotPal/iu], [`Dungeon`, /Dungeon.*Pal|Pal.*Dungeon/iu],
		[`Raid`, /RaidBoss\/DT_PalRaidBoss$/iu],
	];
	const evidence = new Map(pals.map(pal => [pal.name, new Set()]));
	for (const [classification, pattern] of families) {
		for (const [table, rows] of Object.entries(decoded)) {
			if (!pattern.test(table)) {continue;}
			for (const id of collectPalReferences(rows, new Set(byId.keys()))) {evidence.get(byId.get(id).name).add(classification);}
		}
	}
	// The shared wild-spawner table also contains dungeon pools, so classify its rows by spawner semantics.
	for (const [table, rows] of Object.entries(decoded)) {
		if (!/\/DT_PalWildSpawner$/iu.test(table)) {continue;}
		for (const row of Object.values(rows)) {
			const classification = /dungeon/iu.test(String(row.SpawnerName || ``)) ? `Dungeon` : `Wild Spawner`;
			for (const id of collectPalReferences(row, new Set(byId.keys()))) {evidence.get(byId.get(id).name).add(classification);}
		}
	}
	const curated = {
		Silvance: [`Alpha`], Dandilord: [`Alpha`], Panthalus: [`NPC Encounter`], Astralym: [`Tower Boss`],
	};
	for (const pal of pals.filter(value => value.spawnTime === `Sealed Realm of Terraria`)) {curated[pal.name] = [`Sealed Realm`];}
	for (const [name, classifications] of Object.entries(curated)) {
		for (const classification of classifications) {evidence.get(name)?.add(classification);}
	}
	for (const pal of pals) {
		if (pal.breeding?.canBeChild && !evidence.get(pal.name)?.size) {evidence.get(pal.name)?.add(`Breeding Only`);}
	}
	return [...evidence].map(([name, classifications]) => ({ name, classifications: [...classifications].sort() }));
}

function normalizeShopData(snapshot, itemByGameId) {
	const groups = tableRows(snapshot, `shopCreate`).map(entry => ({
		name: entry.Key,
		products: (rowValue(entry).productDataArray || []).map(product => ({
			itemId: normalizedId(product.StaticItemId),
			productType: String(product.ProductType || ``).replace(`EPalItemShopProductType::`, ``),
			quantity: Number(product.ProductNum || 0),
			stock: Number(product.Stock || 0),
			overridePrice: Number(product.OverridePrice || 0),
		})).filter(product => product.itemId),
	}));
	const groupByName = new Map(groups.map(group => [group.name, group]));
	const lotteryPools = tableRows(snapshot, `shopLottery`).map(entry => ({
		name: entry.Key,
		groups: (rowValue(entry).lotteryDataArray || []).map(group => ({
			name: String(group.ShopGroupName || ``),
			weight: Number(group.Weight || 0),
		})).filter(group => group.name),
	}));
	const randomizedGroupNames = new Set(lotteryPools.flatMap(pool => pool.groups.map(group => group.name)));
	const randomizedItemIds = new Set([...randomizedGroupNames].flatMap(name =>
		(groupByName.get(name)?.products || []).map(product => product.itemId),
	));
	const allItemIds = new Set(groups.flatMap(group => group.products.map(product => product.itemId)));
	const playableItemIds = new Set(groups.filter(group => !/Vagrant|TestTable/iu.test(group.name))
		.flatMap(group => group.products.map(product => product.itemId)));
	const currencies = tableRows(snapshot, `shopSettings`).map(entry => ({
		shop: entry.Key,
		itemId: normalizedId(rowValue(entry).CurrencyItemID),
	})).filter(currency => currency.itemId && currency.itemId !== `none`);
	return {
		groups,
		lotteryPools,
		currencies,
		unknownLotteryGroups: [...randomizedGroupNames].filter(name => !groupByName.has(name)).sort(),
		allCatalogItemIds: [...allItemIds].filter(id => itemByGameId.has(id)).sort(),
		playableCatalogItemIds: [...playableItemIds].filter(id => itemByGameId.has(id)).sort(),
		randomizedCatalogItemIds: [...randomizedItemIds].filter(id => itemByGameId.has(id)).sort(),
	};
}

function compareGameItemData(itemData, snapshot) {
	const items = itemData.Items || [];
	const itemById = new Map(items.map(item => [gameId(item), item]));
	const idsByName = new Map(items.map(item => [item.name, gameId(item)]));
	const gameRecipes = tableRows(snapshot, `recipes`).map(normalizedGameRecipe).filter(recipe => recipe.productId);
	const malformedGameRecipes = gameRecipes.filter(recipe => recipe.malformedMaterials.length);
	const recipesByProduct = new Map();
	for (const recipe of gameRecipes) {
		const current = recipesByProduct.get(recipe.productId) || [];
		current.push(recipe);
		recipesByProduct.set(recipe.productId, current);
	}

	const missingLocalRecipes = [];
	const mismatchedLocalRecipes = [];
	const matchedRecipes = [];
	for (const item of items) {
		const id = gameId(item);
		const gameRows = recipesByProduct.get(id) || [];
		const localRows = (item.recipes || []).map(recipe => normalizedLocalRecipe(recipe, idsByName));
		if (!localRows.length && gameRows.length) {
			missingLocalRecipes.push({ id: item.id, name: item.name, gameRows });
			continue;
		}
		const unmatched = localRows.filter(local => !gameRows.some(game => sameIngredients(local, game)));
		if (unmatched.length) {
			mismatchedLocalRecipes.push({ id: item.id, name: item.name, localRows, gameRows });
		} else if (localRows.length) {
			matchedRecipes.push({ id: item.id, name: item.name, count: localRows.length });
		}
	}

	const itemTable = tableRows(snapshot, `items`);
	const gameItemRows = new Map(itemTable.map(entry => [normalizedId(entry.Key), rowValue(entry)]));
	const canonicalIds = new Map(itemTable.map(entry => [normalizedId(entry.Key), entry.Key]));
	const localIdCasingMismatches = items.flatMap(item => {
		const local = rawGameId(item);
		const game = canonicalIds.get(normalizedId(local));
		return game && local !== game ? [{ id: item.id, name: item.name, local, game }] : [];
	});
	const legalityMismatches = items.flatMap(item => {
		const row = gameItemRows.get(gameId(item));
		if (!row || row.bLegalInGame === undefined) {return [];}
		const local = Number(item.properties?.bLegalInGame ?? 0);
		const game = Number(row.bLegalInGame);
		return local === game ? [] : [{ id: item.id, name: item.name, local, game }];
	});

	const knownIds = new Set(itemById.keys());
	const evidenceTables = [`palDrops`, `itemLottery`, `itemPickup`, `shopCreate`, `shopLottery`, `shopSettings`, `technology`, `mapObjectLottery`, `mapObjectProducts`];
	const evidence = Object.fromEntries(evidenceTables.map(name => [name, [...collectStringEvidence(tableRows(snapshot, name), knownIds)].sort()]));
	const gameReferenceCasingMismatches = [...[`recipes`, ...evidenceTables].reduce((found, name) =>
		collectCasingMismatches(tableRows(snapshot, name), canonicalIds, name, found), new Map()).values()];
	const shops = normalizeShopData(snapshot, itemById);
	const localMerchantIds = new Set(items.filter(item => item.merchantLocations).map(gameId));
	const decodedShopTypes = new Set([
		`Medal Merchants`, `Bounty Shop`, `Arena Merchant`, `Caravan Merchants`, `Dungeon Merchant`, `Wandering Merchants`,
	]);
	const localShopCoverageIds = new Set(items.filter(item =>
		item.merchantLocations || item.acquisition?.sources?.some(source => decodedShopTypes.has(source.type)),
	).map(gameId));
	const gameShopIds = new Set(shops.playableCatalogItemIds);
	const missingLocalShopItems = [...gameShopIds].filter(id => !localShopCoverageIds.has(id)).map(id => itemById.get(id).name).sort();
	const localShopItemsMissingGameEvidence = [...localMerchantIds].filter(id => !gameShopIds.has(id)).map(id => itemById.get(id).name).sort();

	return {
		extraction: snapshot.tables?._metadata || {},
		summary: {
			catalogItems: items.length,
			gameItemRows: gameItemRows.size,
			gameRecipeRows: gameRecipes.length,
			matchedRecipeItems: matchedRecipes.length,
			missingLocalRecipeItems: missingLocalRecipes.length,
			mismatchedLocalRecipeItems: mismatchedLocalRecipes.length,
			legalityMismatches: legalityMismatches.length,
			localIdCasingMismatches: localIdCasingMismatches.length,
			gameReferenceCasingMismatches: gameReferenceCasingMismatches.length,
			malformedGameRecipes: malformedGameRecipes.length,
			acquisitionEvidenceItems: new Set(Object.values(evidence).flat()).size,
			shopProductGroups: shops.groups.length,
			shopProductItems: shops.allCatalogItemIds.length,
			shopLotteryPools: shops.lotteryPools.length,
			randomizedShopItems: shops.randomizedCatalogItemIds.length,
			shopCurrencies: shops.currencies.length,
			missingLocalShopItems: missingLocalShopItems.length,
			localShopItemsMissingGameEvidence: localShopItemsMissingGameEvidence.length,
			buildId: snapshot.buildId || null,
			unavailableTables: snapshot.tables?._unavailable || [],
		},
		matchedRecipes,
		missingLocalRecipes,
		mismatchedLocalRecipes,
		legalityMismatches,
		localIdCasingMismatches,
		gameReferenceCasingMismatches,
		malformedGameRecipes,
		evidence,
		shops,
		missingLocalShopItems,
		localShopItemsMissingGameEvidence,
		gameOnlyRecipeProducts: [...recipesByProduct.keys()].filter(id => !itemById.has(id)).sort(),
		unsupported: [
			`Table presence proves that an item is referenced, not that a randomized or event-gated path is reachable in normal play.`,
			`Item world coordinates still require source-specific map decoders; Pal encounter families are classified separately from this generic item evidence pass.`,
		],
	};
}

module.exports = { compareGameBreeding, compareGameItemData, compareGamePalAvailability, gameId, normalizedGameRecipe };
