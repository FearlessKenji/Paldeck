const CURATED_MAP_RULES = {
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

function applyCuratedMapRules(item, id) {
	const definition = CURATED_MAP_RULES[id];
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

function clonedResolvedItemData(resolved) {
	const itemData = { ...resolved, Items: resolved.Items.map(item => JSON.parse(JSON.stringify(item))) };
	for (const item of itemData.Items) {
		delete item.acquisitionRef;
		delete item.merchantLocationsRef;
		delete item.bountyMerchants;
		delete item.arenaMerchant;
	}
	return itemData;
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

function printSyncReport(snapshot, changes, malformedCount) {
	console.log(`Installed-game sync for build ${snapshot.buildId}:`);
	console.log(`- Recipe records changed: ${changes.recipe}`);
	console.log(`- Legality flags changed: ${changes.legality}`);
	console.log(`- Acquisition records changed: ${changes.acquisition}`);
	console.log(`- Treasure Map loot records synchronized: ${changes.treasureMap}`);
	console.log(`- Unsupported local merchant records removed: ${changes.merchant}`);
	console.log(`- Malformed game material slots ignored: ${malformedCount}`);
}

function treasureMarkerSelectors(marker) {
	const selector = marker.href !== undefined ? marker.href : marker.Spawn;
	return Array.isArray(selector) ? selector : [selector].filter(Boolean);
}

function installedAvailabilityManifest(sourceManifest, items, snapshot) {
	const manifest = JSON.parse(JSON.stringify(sourceManifest));
	manifest.items = manifest.items.filter(decision => !String(decision.reason).startsWith(`Installed build `));
	for (const item of items.filter(value => value.category === `Schematic` && Number(value.properties?.bLegalInGame ?? 0) === 0)) {
		const reasonPrefix = `Game-disabled schematic definition`;
		let decision = manifest.items.find(value => value.id === item.id);
		if (!decision) {
			decision = { id: item.id, status: `unused`, reason: ``, allowedEvidence: [] };
			manifest.items.push(decision);
		}
		if (!String(decision.reason).startsWith(reasonPrefix) && decision.reason) {
			continue;
		}
		decision.status = `unused`;
		decision.reason = `${reasonPrefix} in installed build ${snapshot.buildId}.`;
		decision.allowedEvidence = [
			item.recipes?.length && `recipe`, item.droppedBy?.length && `Pal drop`,
			item.acquisition?.sources?.length && `acquisition source`, item.merchantLocations && `merchant`,
		].filter(Boolean);
	}
	manifest.items.sort((left, right) => left.id.localeCompare(right.id));
	manifest.game.buildId = String(snapshot.buildId);
	manifest.verifiedAt = new Date().toISOString().slice(0, 10);
	return manifest;
}

module.exports = {
	applyCuratedMapRules, clonedResolvedItemData, installedAvailabilityManifest, printSyncReport, restoreReviewedVisibility,
	treasureMarkerSelectors,
};
