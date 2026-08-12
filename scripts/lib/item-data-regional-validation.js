const fs = require(`node:fs`);
const path = require(`node:path`);
const journalData = require(`../../data/journalData.json`);
const curatedTowerBossSources = require(`../../data/curatedTowerBossSources.json`);
const { isTreasureMapItem } = require(`../../utils/itemMapSources.js`);

const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`);

function collectMappedRegionalItems(itemData, problems) {
	const mappedSkillFruits = itemData.Items.filter(item => /Skill Fruit:/u.test(item.name) && item.acquisition?.sources?.some(source => source.type === `Skill Fruit Trees`));
	if (mappedSkillFruits.length !== 89) {
		problems.push(`Expected 89 pool-verified Skill Fruit records, found ${mappedSkillFruits.length}.`);
	}
	const mappedKeySpheres = itemData.Items.filter(item => /^Key Sphere of /u.test(item.name) && item.acquisition?.sources?.some(source => source.type === `Tower Boss`));
	if (mappedKeySpheres.length !== 8) {
		problems.push(`Expected all 8 Key Spheres to have verified tower maps, found ${mappedKeySpheres.length}.`);
	}
	const mappedRegionalItems = itemData.Items.filter(item => item.acquisition?.sources?.some(source =>
		[`Treasure`, `Treasure Element`, `Supply`, `Junk`, `Salvage Rank1`, `Salvage Rank2`].includes(source.type),
	));
	if (mappedRegionalItems.length !== 572) {
		problems.push(`Expected all 572 current decoded regional loot-pool records, found ${mappedRegionalItems.length}.`);
	}
	const solSphere = itemData.Items.find(item => item.name === `Sol Sphere`);
	if (!solSphere?.acquisition?.map || !solSphere.acquisition.sources?.some(source => source.type === `Junk`) ||
		!solSphere.acquisition.sources?.some(source => source.type === `Supply`) ||
		!solSphere.acquisition.sources?.some(source => source.type === `Treasure`)) {
		problems.push(`Sol Sphere must include its verified Sky Island junk, supply, and treasure sources.`);
	}
	return mappedRegionalItems;
}

function validateRegionalSalvageMarkers(mappedRegionalItems, problems) {
	for (const item of mappedRegionalItems) {
		const mappedMarkerTypes = [
			...(item.acquisition?.mapSources?.markers || []),
			...(item.acquisition?.mapSources?.maps || []).flatMap(source => source.markers || []),
		].map(marker => marker.type);
		if (mappedMarkerTypes.some(type => /^Salvage Rank/u.test(type))) {
			problems.push(`${item.name}: salvage sources must remain textual instead of being mapped.`);
		}
	}
}

function validateMappedItemPresentation(itemData, problems) {
	const mappedItems = itemData.Items.filter(item => item.acquisition?.mapSources);
	for (const item of mappedItems) {
		const markers = [
			...(item.acquisition.mapSources.markers || []),
			...(item.acquisition.mapSources.maps || []).flatMap(source => source.markers || []),
		];
		if (markers.some(marker => marker.type === `Supply` || /^Salvage Rank/iu.test(marker.type))) {
			problems.push(`${item.name}: Supply Drops and broad salvage pools must remain unpinned.`);
		}
		if (markers.some(marker => [`compact`, `density`].includes(marker.style))) {
			problems.push(`${item.name}: standard map pins must use the uniform Lamball-sized presentation.`);
		}
		if (markers.some(marker => /Treasure Map \d Sources/iu.test(marker.label || ``))) {
			problems.push(`${item.name}: Treasure Map legends must use player-facing rarity or source wording.`);
		}
		for (const chestMarker of markers.filter(value => (value.legendType || value.type) === `Treasure`)) {
			const regionalSpawner = chestMarker.locationSet === `worldTreeTreasureChests` || chestMarker.href === `SkyIsland_Treasure`;
			const missingLotteryFields = !Array.isArray(chestMarker.lotteryFields) || !chestMarker.lotteryFields.length;
			if (!regionalSpawner && (!Number.isInteger(chestMarker.treasureGrade) || missingLotteryFields)) {
				problems.push(`${item.name}: treasure-chest map markers require a decoded grade and exact lottery field IDs.`);
			}
		}
	}
}

function validateGeneratedPhysicalMaps(itemData, problems) {
	const generatedPhysicalMaps = itemData.Items.filter(item => item.acquisition?.mapSources && item.acquisition?.map);
	if (generatedPhysicalMaps.length < 700) {
		problems.push(`Expected the comprehensive generated physical-source map catalog, found ${generatedPhysicalMaps.length}.`);
	}
	for (const item of generatedPhysicalMaps) {
		if (!fs.existsSync(path.resolve(PROJECT_ROOT, item.acquisition.map))) {
			problems.push(`${item.name}: generated physical-source map is missing.`);
		}
	}
}

function validateLegalChestData(itemData, problems) {
	for (const legalItem of itemData.Items.filter(value => Number(value.properties?.bLegalInGame ?? 0) !== 0)) {
		for (const chestSource of (legalItem.acquisition?.sources || []).filter(value => value.type === `Treasure`)) {
			for (const entry of chestSource.entries || []) {
				const regionalSummary = /^\d+ (?:Sunreach|World Tree) chest locations$/u.test(entry.location || ``);
				if (!regionalSummary && (!/^((?:Regular|Bronze Key|Purple|Silver|Gold|Gold Key) Chests)$/u.test(entry.chestTier || ``) || !String(entry.lotteryField || ``).trim())) {
					problems.push(`${legalItem.name}: treasure sources must name their chest tier and retain the exact game lottery field ID.`);
				}
			}
		}
	}
}

function validateTreasureMapLoot(itemData, problems) {
	const treasureMapLoot = itemData.Items.filter(item => item.acquisition?.sources?.some(source => source.type === `Treasure Maps`));
	if (treasureMapLoot.length !== 245) {
		problems.push(`Expected 245 local card records backed by current Treasure Map loot tables, found ${treasureMapLoot.length}.`);
	}
	for (const item of treasureMapLoot) {
		const entries = item.acquisition.sources.find(source => source.type === `Treasure Maps`).entries;
		const markers = [
			...(item.acquisition.mapSources?.markers || []),
			...(item.acquisition.mapSources?.maps || []).flatMap(source => source.markers || []),
		];
		if (markers.some(marker => marker.legendType === `Treasure Map`) || entries.some(entry =>
			!/^(?:Common|Uncommon|Rare|Epic|Legendary) Treasure Map$/u.test(entry.location) ||
			!/^\d+(?:\.\d+)?%$/u.test(entry.probability || ``))) {
			problems.push(`${item.name}: Treasure Map loot requires exact probabilities without indirect map-source pins.`);
		}
	}
	for (const excludedName of [`Common Egg`, `Mimog Effigy`]) {
		if (itemData.Items.some(item => item.name === excludedName && item.acquisition)) {
			problems.push(`${excludedName}: intentionally non-location-based items must remain unmapped.`);
		}
	}
}

function validateRegionalLootData(itemData, problems) {
	const mappedRegionalItems = collectMappedRegionalItems(itemData, problems);
	validateRegionalSalvageMarkers(mappedRegionalItems, problems);
	validateMappedItemPresentation(itemData, problems);
	validateGeneratedPhysicalMaps(itemData, problems);
	validateLegalChestData(itemData, problems);
	validateTreasureMapLoot(itemData, problems);
}

function validateJournalData(itemData, problems) {
	for (const journalMap of [`data/item-maps/palpagos-journals.png`, `data/item-maps/worldtree-journals.png`]) {
		if (!fs.existsSync(path.resolve(PROJECT_ROOT, journalMap))) {
			problems.push(`Missing generated journal map at ${journalMap}.`);
		}
	}
	const journals = itemData.Items.filter(item => item.journalEntry);
	if (journals.length !== 64) {
		problems.push(`Journal catalog must contain all 64 installed Note master rows.`);
	}
	const incompleteJournal = journals.some(journal =>
		!journal.id || !journal.name || !journal.description ||
		!journal.acquisition?.mapSources?.markers?.length || !journal.acquisition?.map);
	if (incompleteJournal) {
		problems.push(`Every journal item must include its game ID, title, text, placed marker, and individual map.`);
	}
	if (journalData.Journals?.length !== 64 || journalData.Journals.some(journal =>
		!journal.description || !/^data\/item-maps\/(?:(?:journal-)?(?:palpagos|worldtree)(?:-journals)?-.+|(?:palpagos|worldtree)-journals)\.png$/u.test(journal.map || ``) ||
		!fs.existsSync(path.join(PROJECT_ROOT, journal.map)))) {
		problems.push(`The /journal catalog must contain all 64 localized texts with valid journal maps.`);
	}
	for (const title of [`Suppression Operation Comms Log`, `Ancient Recorder`, `(A scorched piece of paper)`]) {
		if (!journals.some(journal => journal.name === title)) {
			problems.push(`Journal catalog is missing ${title}.`);
		}
	}
}

function validateSlabSource(source, sourceIndex, context) {
	const { item, index, problems } = context;
	if (source.type === `Crafting`) {
		problems.push(`Acquisition ${index} ${item.name}: crafting belongs in recipes, not acquisition sources.`);
	}
	if (!String(source.type || ``).trim() || !Array.isArray(source.entries) || !source.entries.length) {
		problems.push(`Acquisition ${index} ${item.name}: source ${sourceIndex} requires a type and entries.`);
		return;
	}
	for (const [entryIndex, entry] of source.entries.entries()) {
		if (!String(entry.location || ``).trim()) {
			problems.push(`Acquisition ${index} ${item.name}: source ${sourceIndex} entry ${entryIndex} is missing location.`);
		}
	}
}

function validateSlabMap(item, index, problems) {
	const { acquisition } = item;
	if (!acquisition.map) {
		if (acquisition.mapSources !== undefined) {
			problems.push(`Acquisition ${index} ${item.name}: mapSources requires a map.`);
		}
		return;
	}
	const mapPath = path.resolve(PROJECT_ROOT, acquisition.map);
	const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
	if (relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath)) {
		problems.push(`Acquisition ${index} ${item.name}: map escapes project root.`);
	} else if (path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
		problems.push(`Acquisition ${index} ${item.name}: map must be an existing PNG at ${acquisition.map}.`);
	}
	if (!hasValidSlabMapSources(acquisition.mapSources)) {
		problems.push(`Acquisition ${index} ${item.name}: mapped slab items require legacy or regional marker sources.`);
	}
}

function hasValidSlabMapSources(mapSources) {
	const legacyMap = Array.isArray(mapSources?.chestPools) && Array.isArray(mapSources?.dungeons);
	const regionalMap = [`palpagos`, `worldtree`].includes(mapSources?.map) && mapSources?.markers?.length;
	return legacyMap || regionalMap;
}

function validateSlabItem(item, index, problems) {
	const { acquisition } = item;
	if (/\(Ultra\) Slab Fragment$/i.test(item.name)) {
		if (item.searchable !== false) {
			problems.push(`${item.name}: unused Ultra fragment definitions must be hidden from item lookup.`);
		}
		if (acquisition !== undefined) {
			problems.push(`${item.name}: unused Ultra fragment definitions must not have acquisition data.`);
		}
		return;
	}
	if (!acquisition || !Array.isArray(acquisition.sources)) {
		problems.push(`${item.name}: missing embedded acquisition sources.`);
		return;
	}
	if (!acquisition.sources.length && !String(acquisition.note || ``).trim()) {
		problems.push(`Acquisition ${index} ${item.name}: an empty source list requires a note.`);
	}
	for (const [sourceIndex, source] of acquisition.sources.entries()) {
		validateSlabSource(source, sourceIndex, { item, index, problems });
	}
	validateSlabMap(item, index, problems);
}

function validateSlabData(itemData, problems) {
	const slabItems = itemData.Items.filter(item => /\bSlab(?: Fragment)?$/i.test(item.name));
	for (const [index, item] of slabItems.entries()) {
		validateSlabItem(item, index, problems);
	}
}

function validateTowerRewardData(itemData, problems) {
	for (const [itemId, expected] of Object.entries(curatedTowerBossSources)) {
		const item = itemData.Items.find(value => value.id === itemId);
		const source = item?.acquisition?.sources?.find(value => value.type === `Tower Boss`);
		if (!item || JSON.stringify(source?.entries) !== JSON.stringify(expected.entries)) {
			problems.push(`${itemId}: Tower Boss quantities or probabilities do not match the curated reward table.`);
			continue;
		}
		const panels = item.acquisition.mapSources?.maps || [item.acquisition.mapSources].filter(Boolean);
		const actualHrefs = panels.flatMap(panel => panel.markers || [])
			.filter(marker => marker.legendType === `Tower Boss`).map(marker => marker.href).sort();
		const expectedHrefs = (expected.markers || [expected.marker]).map(marker => marker.href).sort();
		if (JSON.stringify(actualHrefs) !== JSON.stringify(expectedHrefs)) {
			problems.push(`${item.name}: Tower Boss map markers do not match its reward sources.`);
		}
	}
}

function validateIndirectTreasureMapData(itemData, problems) {
	for (const item of itemData.Items.filter(value => !isTreasureMapItem(value))) {
		const panels = item.acquisition?.mapSources?.maps || [item.acquisition?.mapSources].filter(Boolean);
		if (panels.some(panel => (panel.markers || []).some(marker =>
			(marker.legendType || marker.type) === `Treasure Map`))) {
			problems.push(`${item.name}: item maps must not show indirect Treasure Map acquisition locations.`);
		}
	}
}

function validateTowerAndIndirectMapData(itemData, problems) {
	validateTowerRewardData(itemData, problems);
	validateIndirectTreasureMapData(itemData, problems);
}

function validateLootPools(item, problems) {
	for (const [index, pool] of (item.acquisition?.lootPools || []).entries()) {
		if (!pool.pool || !pool.category || !pool.quantity || !pool.probability || Number.parseFloat(pool.probability) <= 0) {
			problems.push(`${item.name}: loot association ${index} requires a source, category, quantity, and nonzero probability.`);
		}
	}
}

function validateItemMapPanels(item, problems) {
	const panels = item.acquisition?.mapSources?.maps || [item.acquisition?.mapSources].filter(Boolean);
	if (item.acquisition?.map && (!panels.length || panels.some(panel => !panel.map || !panel.markers?.length))) {
		problems.push(`${item.name}: every attached item-map panel requires a region and visible markers.`);
	}
	for (const marker of panels.flatMap(panel => panel.markers || [])) {
		const type = marker.legendType || marker.type || ``;
		if (/Ancient Relic|Fishing Pond|Supply Drop/iu.test(type)) {
			problems.push(`${item.name}: ${type} must remain textual and cannot produce item-map pins.`);
		}
	}
}

function validateLootPoolMaps(itemData, problems) {
	for (const item of itemData.Items) {
		validateLootPools(item, problems);
		validateItemMapPanels(item, problems);
	}
}

function validateCuratedItemData(itemData, problems) {
	validateJournalData(itemData, problems);
	validateSlabData(itemData, problems);
	validateTowerAndIndirectMapData(itemData, problems);
	validateLootPoolMaps(itemData, problems);
}

module.exports = { validateCuratedItemData, validateRegionalLootData };
