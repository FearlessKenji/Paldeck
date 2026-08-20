// Validates resolved item records, compact preset references, local assets, and curated acquisition rules.
const fs = require(`node:fs`);
const path = require(`node:path`);
const { availabilityEvidence, hasPlaceholderItemText, needsAvailabilityReview, shouldHideItem } = require(`../../utils/itemVisibility.js`);
const { rawItemData, resolvedItemData } = require(`../../utils/itemData.js`);
const availabilityManifest = require(`../../data/itemAvailability.json`);
const { findAvailabilityManifestProblems } = require(`../../utils/itemAvailabilityAudit.js`);
const itemFile = resolvedItemData();
const { itemWorkbench } = require(`../../utils/itemWorkbench.js`);
const { sourceText } = require(`../../utils/itemCards.js`);
const { createItemVariantIndex } = require(`../../utils/itemVariants.js`);
const { validateCuratedItemData, validateRegionalLootData } = require(`../lib/items/item-data-regional-validation.js`);

const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`);
const AVAILABILITY_DECISION_IDS = new Set(availabilityManifest.items.map(decision => decision.id));

const REQUIRED_FIELDS = [
	`id`,
	`code`,
	`name`,
	`nameKey`,
	`category`,
	`iconUrl`,
	`rarity`,
	`rarityRank`,
	`detailPath`,
	`source`,
	`stats`,
	`properties`,
	`droppedBy`,
	`recipes`,
];

function findDuplicateValues(items, field) {
	const seen = new Map();
	const duplicates = [];

	for (const item of items) {
		const value = item[field];

		if (seen.has(value)) {
			duplicates.push(`${field} ${value}: ${seen.get(value)} / ${item.name}`);
			continue;
		}

		seen.set(value, item.name);
	}

	return duplicates;
}

function validateItemPresetReferences(item, problems) {
	for (const [property, catalog] of [[`acquisition`, `AcquisitionPresets`], [`merchantLocations`, `MerchantLocationSets`]]) {
		const reference = item[`${property}Ref`];
		if (reference && !rawItemData[catalog]?.[reference]) {
			problems.push(`${item.name}: unknown ${catalog} reference ${reference}.`);
		}
		if (reference && item[property]) {
			problems.push(`${item.name}: ${property} must use either inline data or a preset reference, not both.`);
		}
	}
}

function validatePresetReferences(problems) {
	// Validate raw references before inspecting resolved records, where missing indirection would be hidden.
	for (const item of rawItemData.Items || []) {
		validateItemPresetReferences(item, problems);
	}
	const acquisitionReferenceCounts = new Map();
	for (const item of rawItemData.Items || []) {
		if (item.acquisitionRef) {
			acquisitionReferenceCounts.set(
				item.acquisitionRef,
				(acquisitionReferenceCounts.get(item.acquisitionRef) || 0) + 1,
			);
		}
	}
	validateAcquisitionPresetNames(acquisitionReferenceCounts, problems);
	validateMerchantPresetNames(problems);
}

function validateAcquisitionPresetNames(referenceCounts, problems) {
	for (const reference of Object.keys(rawItemData.AcquisitionPresets || {})) {
		if (!/^acq-[a-z0-9-]+$/u.test(reference) || /-[a-f0-9]{6}$/u.test(reference)) {
			problems.push(`${reference}: acquisition preset IDs must use descriptive words instead of hashes.`);
		}
		if ((referenceCounts.get(reference) || 0) < 2) {
			problems.push(`${reference}: acquisition presets must be shared by at least two items.`);
		}
	}
}

function validateMerchantPresetNames(problems) {
	for (const reference of Object.keys(rawItemData.MerchantLocationSets || {})) {
		if (!/^merchants-[a-z0-9-]+$/u.test(reference) || /-[a-f0-9]{6}$/u.test(reference)) {
			problems.push(`${reference}: merchant preset IDs must use descriptive words instead of hashes.`);
		}
	}
}

function validateRequiredItemFields(item, index, problems) {
	const objectFields = [`stats`, `properties`];
	const arrayFields = [`droppedBy`, `recipes`];
	for (const field of REQUIRED_FIELDS) {
		const label = `Item ${index} ${item.name || `(unnamed)`}`;
		if (objectFields.includes(field)) {
			validateObjectField(item, field, label, problems);
		} else if (arrayFields.includes(field) && !Array.isArray(item[field])) {
			problems.push(`${label}: ${field} must be an array.`);
		} else if (field === `rarityRank` && !Number.isInteger(item[field])) {
			problems.push(`${label}: rarityRank must be an integer.`);
		} else if (!objectFields.includes(field) && !arrayFields.includes(field) && field !== `rarityRank` && !String(item[field] || ``).trim()) {
			problems.push(`${label}: missing ${field}.`);
		}
	}
}

function validateObjectField(item, field, label, problems) {
	const value = item[field];
	if (!value || typeof value !== `object` || Array.isArray(value)) {
		problems.push(`${label}: ${field} must be an object.`);
	}
}

function validateDrop(drop, dropIndex, context) {
	const { item, index, problems } = context;
	for (const field of [`pal`, `quantity`, `probability`]) {
		if (!String(drop[field] || ``).trim()) {
			problems.push(`Item ${index} ${item.name}: drop ${dropIndex} is missing ${field}.`);
		}
	}
	if (drop.title !== undefined) {
		problems.push(`Item ${index} ${item.name}: drop ${dropIndex} should not store decorative Pal titles.`);
	}
	if (drop.level !== undefined && (!Number.isInteger(drop.level) || drop.level <= 0)) {
		problems.push(`Item ${index} ${item.name}: drop ${dropIndex} level must be a positive integer.`);
	}
}

function validateItemDropsAndRecipes(item, index, problems) {
	for (const [dropIndex, drop] of (item.droppedBy || []).entries()) {
		validateDrop(drop, dropIndex, { item, index, problems });
	}
	for (const [recipeIndex, recipe] of (item.recipes || []).entries()) {
		if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) {
			problems.push(`Item ${index} ${item.name}: recipe ${recipeIndex} must contain ingredients.`);
		}
	}
	if (item.recipes?.some(recipe => recipe.ingredients?.length) && !itemWorkbench(item)) {
		problems.push(`Item ${index} ${item.name}: crafted items must resolve to a workbench.`);
	}
	if ([`Dog Coin`, `Battle Ticket`, `Successful Bounty Token`].includes(item.name) && item.recipes?.length) {
		problems.push(`Item ${index} ${item.name}: merchant exchange rows must not be stored as crafting recipes.`);
	}
}

function validateItemPresentation(item, index, problems) {
	const label = `Item ${index} ${item.name || `(unnamed)`}`;
	if (/^https?:\/\//i.test(String(item.iconUrl || ``))) {
		problems.push(`${label}: iconUrl must be a local path.`);
	}
	if (item.url !== undefined || /^https?:\/\//i.test(String(item.detailPath || ``))) {
		problems.push(`${label}: item source must be a non-link detailPath.`);
	}
	if (item.iconUrl && path.extname(item.iconUrl).toLowerCase() !== `.png`) {
		problems.push(`${label}: iconUrl must point to a PNG file.`);
	}
	if (item.searchable !== false && !String(item.description || ``).trim()) {
		problems.push(`${label}: searchable items require a user-facing description.`);
	}
	if (String(item.description || ``).includes(`|`)) {
		problems.push(`${label}: description contains an unnormalized pipe delimiter.`);
	}
}

function validateItemAvailability(item, index, problems) {
	const label = `Item ${index} ${item.name || `(unnamed)`}`;
	if (item.searchable !== false && shouldHideItem(item)) {
		problems.push(`${label}: unavailable or placeholder definitions must not be searchable.`);
	}
	if (needsAvailabilityReview(item)) {
		problems.push(`${label}: hidden definition now has finished text and ${availabilityEvidence(item).join(`, `)}; review whether it was implemented.`);
	}
	if (item.searchable === false && !hasPlaceholderItemText(item) && !AVAILABILITY_DECISION_IDS.has(item.id)) {
		problems.push(`Item ${index} ${item.name}: hidden localized definitions require a versioned availability decision.`);
	}
}

function validateItemIcon(item, index, problems) {
	const iconPath = path.resolve(PROJECT_ROOT, item.iconUrl || ``);
	const relativeIconPath = path.relative(PROJECT_ROOT, iconPath);
	if (relativeIconPath.startsWith(`..`) || path.isAbsolute(relativeIconPath)) {
		problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl escapes project root.`);
	} else if (!fs.existsSync(iconPath)) {
		problems.push(`Item ${index} ${item.name || `(unnamed)`}: icon file does not exist at ${item.iconUrl}.`);
	}
}

function validateBaseItems(itemData, problems) {
	for (const [index, item] of itemData.Items.entries()) {
		validateRequiredItemFields(item, index, problems);
		validateItemPresentation(item, index, problems);
		validateItemAvailability(item, index, problems);
		validateItemIcon(item, index, problems);
		validateItemDropsAndRecipes(item, index, problems);
	}
}

function validateDogCoinMerchants(itemData, problems) {
	const dogCoin = itemData.Items.find(item => item.name === `Dog Coin`);
	if (!dogCoin?.medalMerchants?.map || dogCoin.medalMerchants.entries?.length !== 4 ||
		dogCoin.medalMerchants.mapSources?.map !== `palpagos` || !dogCoin.medalMerchants.mapSources?.markers?.length) {
		problems.push(`Dog Coin must include all four fixed Medal Merchant locations and their map.`);
	}
}

function validateInstalledShopCounts(itemData, problems) {
	const expectedShopCounts = {
		"Medal Merchants": 37, "Bounty Shop": 18, "Arena Merchant": 56,
		"Caravan Merchants": 109, "Dungeon Merchant": 33, "Wandering Merchants": 32,
	};
	for (const [type, expected] of Object.entries(expectedShopCounts)) {
		const actual = itemData.Items.filter(item => item.acquisition?.sources?.some(source => source.type === type)).length;
		if (actual !== expected) {
			problems.push(`${type}: expected ${expected} installed-game products, found ${actual}.`);
		}
	}
}

function validateFixedShopMaps(itemData, problems) {
	for (const [property, expectedEntries] of [[`medalMerchants`, 4], [`bountyMerchants`, 3], [`arenaMerchant`, 1]]) {
		for (const item of itemData.Items.filter(value => value[property])) {
			if (item[property].entries?.length !== expectedEntries || !item[property].map || !item[property].mapSources?.markers?.length) {
				problems.push(`${item.name}: ${property} must include its complete fixed-location map.`);
			}
		}
	}
	if (itemData.Items.some(item => item.acquisition?.sources?.some(source => /Vagrant|TestTable/iu.test(JSON.stringify(source))))) {
		problems.push(`Test/vagrant shop tables must never appear as player-facing acquisition sources.`);
	}
	for (const field of [`id`, `code`]) {
		problems.push(...findDuplicateValues(itemData.Items, field));
	}
}

function validateInstalledShopData(itemData, problems) {
	validateDogCoinMerchants(itemData, problems);
	validateInstalledShopCounts(itemData, problems);
	validateFixedShopMaps(itemData, problems);
}

function validateMerchantLocationSets(itemData, problems) {
	for (const [name, locations] of Object.entries(itemData.MerchantLocationSets || {})) {
		const markers = locations.mapSources?.markers || [];
		if (markers.length && !/^data\/item-maps\/merchant-locations-[a-z0-9-]+\.png$/u.test(locations.map || ``)) {
			problems.push(`${name}: merchant map filename must describe its locations.`);
		}
		for (const marker of markers) {
			const expectedType = /_Shop_2$/u.test(marker.href || ``) ? `Weapons Merchant` : `Wandering Merchant`;
			if (marker.legendType !== expectedType) {
				problems.push(`${name}: ${marker.href} must use the ${expectedType} legend.`);
			}
		}
	}
}

function validateItemSources(itemData, problems) {
	for (const source of itemData.Sources || []) {
		if (source.url !== undefined) {
			problems.push(`Source ${source.slug}: stored source URLs are not allowed.`);
		}

		const actualCount = itemData.Items.filter(item => item.source === source.slug).length;

		if (actualCount !== source.count) {
			problems.push(`Source ${source.slug}: expected ${source.count} item(s), found ${actualCount}.`);
		}
	}
}

function validateMerchantAndSourceData(itemData, problems) {
	validateInstalledShopData(itemData, problems);
	validateMerchantLocationSets(itemData, problems);
	validateItemSources(itemData, problems);
}

function validateAcquisitionSourceEntries(source, sourceIndex, context) {
	const { item, index, problems } = context;
	if (!String(source.type || ``).trim() || !Array.isArray(source.entries) || !source.entries.length) {
		problems.push(`Item ${index} ${item.name}: acquisition source ${sourceIndex} requires a type and entries.`);
	}
	for (const [entryIndex, entry] of (source.entries || []).entries()) {
		if (!String(entry.location || ``).trim()) {
			problems.push(`Item ${index} ${item.name}: acquisition source ${sourceIndex} entry ${entryIndex} is missing location.`);
		}
	}
}

function validateAcquisitionSources(item, index, problems) {
	const acquisition = item.acquisition;
	const missingSources = !Array.isArray(acquisition.sources) || !acquisition.sources.length;
	if (item.searchable !== false && missingSources && !acquisition.lootPools?.length) {
		problems.push(`Item ${index} ${item.name}: acquisition sources must be a non-empty array.`);
	}
	for (const [sourceIndex, source] of (acquisition.sources || []).entries()) {
		validateAcquisitionSourceEntries(source, sourceIndex, { item, index, problems });
	}
}

function validateRenderedSources(item, index, problems) {
	const renderedSources = sourceText(item.acquisition, item.merchantLocations);
	if (/\b(?:Viking\d+|DarkIsland|SkyIsland|technology-book pool|Oilrig(?: Large)? 0?\d)\b|_/iu.test(renderedSources)) {
		problems.push(`Item ${index} ${item.name}: rendered acquisition sources expose an internal game identifier.`);
	}
	if (/^Ancient Relic Recycler [^(\n]/mu.test(renderedSources)) {
		problems.push(`Item ${index} ${item.name}: qualified acquisition sources must place their subtype in parentheses.`);
	}
	const internalLabel = /Dungeon (?:or Sanctuary|and Regional) Chests|^Pal Critics?(?:\s|$)|\([^)]*: Lvl \d+|^Locations \(/mu;
	if (internalLabel.test(renderedSources) || /^Spawn Locations \(|^\w+ Treasure Map /mu.test(renderedSources)) {
		problems.push(`Item ${index} ${item.name}: rendered acquisition sources contain an unnormalized pathway label.`);
	}
	const lines = renderedSources.split(`\n`).filter(Boolean);
	if (new Set(lines).size !== lines.length) {
		problems.push(`Item ${index} ${item.name}: rendered acquisition sources contain duplicate lines.`);
	}
}

function hasLegacyOrMarkerSources(mapSources) {
	return {
		legacy: Array.isArray(mapSources?.chestPools) && Array.isArray(mapSources?.dungeons),
		markers: [`palpagos`, `worldtree`].includes(mapSources?.map) && Array.isArray(mapSources?.markers) && mapSources.markers.length,
	};
}

function hasUnpinnedSources(acquisition, mapSources) {
	const textualTypes = new Set(acquisition.sources.map(source => source.type));
	const allowed = type => type === `Supply` || /^Salvage Rank/u.test(type) || [`Fishing`, `Fishing Ponds`, `Mission`].includes(type);
	const unpinned = Array.isArray(mapSources?.unpinnedSources) && mapSources.unpinnedSources.length &&
		mapSources.unpinnedSources.every(type => textualTypes.has(type) && allowed(type));
	return unpinned && Array.isArray(mapSources?.markers) && mapSources.markers.length === 0;
}

function hasValidMapSources(acquisition) {
	const mapSources = acquisition.mapSources;
	const { legacy, markers } = hasLegacyOrMarkerSources(mapSources);
	const unpinnedOnly = hasUnpinnedSources(acquisition, mapSources);
	const multiple = Array.isArray(mapSources?.maps) && mapSources.maps.length && mapSources.maps.every(source =>
		[`palpagos`, `worldtree`].includes(source.map) && Array.isArray(source.markers) && source.markers.length);
	return { legacy, markers, multiple, unpinnedOnly };
}

function validateMapFile(item, index, problems) {
	const mapPath = path.resolve(PROJECT_ROOT, item.acquisition.map);
	const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
	if (relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath)) {
		problems.push(`Item ${index} ${item.name}: acquisition map escapes project root.`);
	} else if (path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
		problems.push(`Item ${index} ${item.name}: acquisition map must be an existing PNG at ${item.acquisition.map}.`);
	}
}

function validateAcquisitionMap(item, index, problems) {
	const { acquisition } = item;
	validateMapFile(item, index, problems);
	const validity = hasValidMapSources(acquisition);
	const mapSources = acquisition.mapSources;
	if (validity.multiple && new Set(mapSources.maps.map(source => source.map)).size !== mapSources.maps.length) {
		problems.push(`Item ${index} ${item.name}: repeated panels for the same physical map must be consolidated.`);
	}
	if (!validity.legacy && !validity.markers && !validity.multiple && !validity.unpinnedOnly) {
		problems.push(`Item ${index} ${item.name}: mapped acquisition requires legacy chest/dungeon sources or map marker sources.`);
	}
	const allMarkers = [...(mapSources?.markers || []), ...(mapSources?.maps || []).flatMap(source => source.markers || [])];
	for (const [markerIndex, marker] of allMarkers.entries()) {
		if (!String(marker.type || ``).trim()) {
			problems.push(`Item ${index} ${item.name}: map marker ${markerIndex} is missing type.`);
		}
	}
}

function validateMerchantMapFile(item, index, problems) {
	const { merchantLocations: merchants } = item;
	if (!Array.isArray(merchants.entries) || !merchants.entries.length ||
		merchants.entries.some(entry => !String(entry.merchant || ``).trim() || !String(entry.shop || ``).trim())) {
		problems.push(`Item ${index} ${item.name}: merchantLocations requires named merchant/shop entries.`);
	}
	const mapPath = path.resolve(PROJECT_ROOT, merchants.map || ``);
	const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
	if (!merchants.map || relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath) ||
		path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
		problems.push(`Item ${index} ${item.name}: merchantLocations requires an existing in-project PNG map.`);
	}
}

function validateMerchantLocation(item, index, problems) {
	const merchants = item.merchantLocations;
	if (!merchants) {
		return;
	}
	validateMerchantMapFile(item, index, problems);
	if (merchants.mapSources?.map !== `palpagos` || !Array.isArray(merchants.mapSources?.markers) || !merchants.mapSources.markers.length) {
		problems.push(`Item ${index} ${item.name}: merchantLocations requires Palpagos marker sources.`);
	}
}

function validateAcquisitionData(itemData, problems) {
	for (const [index, item] of itemData.Items.entries()) {
		const acquisition = item.acquisition;
		if (!acquisition) {
			continue;
		}
		validateAcquisitionSources(item, index, problems);
		validateRenderedSources(item, index, problems);
		if (acquisition.map) {
			validateAcquisitionMap(item, index, problems);
		}
	}

	for (const [index, item] of itemData.Items.entries()) {
		validateMerchantLocation(item, index, problems);
	}
}

function findItemDataProblems(itemData) {
	const problems = findAvailabilityManifestProblems(itemData, availabilityManifest);

	validatePresetReferences(problems);
	if (!Array.isArray(itemData.Sources) || !itemData.Sources.length) {
		problems.push(`Sources must be a non-empty array.`);
	}
	if (!Array.isArray(itemData.Items) || !itemData.Items.length) {
		problems.push(`Items must be a non-empty array.`);
		return problems;
	}
	const variantIndex = createItemVariantIndex(itemData.Items);
	for (const schematic of itemData.Items.filter(item => item.category === `Schematic` && item.searchable !== false &&
		/unlocks recipe for/iu.test(item.description || ``))) {
		const counterpart = variantIndex.counterpart(schematic);
		if (!counterpart || counterpart.searchable === false || counterpart.rarity !== schematic.rarity) {
			problems.push(`${schematic.name}: searchable recipe schematics require an exact-rarity item counterpart.`);
		}
	}
	validateBaseItems(itemData, problems);
	validateMerchantAndSourceData(itemData, problems);
	validateAcquisitionData(itemData, problems);
	validateRegionalLootData(itemData, problems);
	validateCuratedItemData(itemData, problems);
	return problems;
}

const problems = findItemDataProblems(itemFile);

if (problems.length) {
	console.error(`Found ${problems.length} item data issue(s):`);

	for (const problem of problems) {
		console.error(`- ${problem}`);
	}

	process.exitCode = 1;
} else {
	console.log(`Item data validation passed.`);
}

module.exports = {
	findItemDataProblems,
};
