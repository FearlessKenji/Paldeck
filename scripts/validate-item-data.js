// Validates resolved item records, compact preset references, local assets, and curated acquisition rules.
const fs = require(`node:fs`);
const path = require(`node:path`);
const { availabilityEvidence, needsAvailabilityReview, shouldHideItem } = require(`../utils/itemVisibility.js`);
const { rawItemData, resolvedItemData } = require(`../utils/itemData.js`);
const itemFile = resolvedItemData();
const { itemWorkbench } = require(`../utils/itemWorkbench.js`);

const PROJECT_ROOT = path.resolve(__dirname, `..`);

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

function findItemDataProblems(itemData) {
	const problems = [];

	// Validate raw references before inspecting resolved records, where missing indirection would be hidden.
	for (const item of rawItemData.Items || []) {
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
	const acquisitionReferenceCounts = new Map();
	for (const item of rawItemData.Items || []) {
		if (item.acquisitionRef) {
			acquisitionReferenceCounts.set(
				item.acquisitionRef,
				(acquisitionReferenceCounts.get(item.acquisitionRef) || 0) + 1,
			);
		}
	}
	for (const reference of Object.keys(rawItemData.AcquisitionPresets || {})) {
		if (!/^acq-[a-z0-9-]+-[a-f0-9]{6}$/u.test(reference)) {
			problems.push(`${reference}: acquisition preset IDs must include a readable label and six-character hash.`);
		}
		if ((acquisitionReferenceCounts.get(reference) || 0) < 2) {
			problems.push(`${reference}: acquisition presets must be shared by at least two items.`);
		}
	}
	for (const reference of Object.keys(rawItemData.MerchantLocationSets || {})) {
		if (!/^merchants-[a-z0-9-]+-[a-f0-9]{6}$/u.test(reference)) {
			problems.push(`${reference}: merchant preset IDs must include a readable label and six-character hash.`);
		}
	}

	if (!Array.isArray(itemData.Sources) || !itemData.Sources.length) {
		problems.push(`Sources must be a non-empty array.`);
	}

	if (!Array.isArray(itemData.Items) || !itemData.Items.length) {
		problems.push(`Items must be a non-empty array.`);
		return problems;
	}

	for (const [index, item] of itemData.Items.entries()) {
		for (const field of REQUIRED_FIELDS) {
			if (field === `stats` || field === `properties` || field === `droppedBy` || field === `recipes`) {
				if (field === `stats` && (!item.stats || typeof item.stats !== `object` || Array.isArray(item.stats))) {
					problems.push(`Item ${index} ${item.name || `(unnamed)`}: stats must be an object.`);
				}

				if (field === `properties` && (!item.properties || typeof item.properties !== `object` || Array.isArray(item.properties))) {
					problems.push(`Item ${index} ${item.name || `(unnamed)`}: properties must be an object.`);
				}

				if (field === `droppedBy` && !Array.isArray(item.droppedBy)) {
					problems.push(`Item ${index} ${item.name || `(unnamed)`}: droppedBy must be an array.`);
				}

				if (field === `recipes` && !Array.isArray(item.recipes)) {
					problems.push(`Item ${index} ${item.name || `(unnamed)`}: recipes must be an array.`);
				}

				continue;
			}
			if (field === `rarityRank`) {
				if (!Number.isInteger(item[field])) {
					problems.push(`Item ${index} ${item.name || `(unnamed)`}: rarityRank must be an integer.`);
				}

				continue;
			}

			if (!String(item[field] || ``).trim()) {
				problems.push(`Item ${index} ${item.name || `(unnamed)`}: missing ${field}.`);
			}
		}

		if (/^https?:\/\//i.test(String(item.iconUrl || ``))) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl must be a local path.`);
		}

		if (item.url !== undefined || /^https?:\/\//i.test(String(item.detailPath || ``))) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: item source must be a non-link detailPath.`);
		}

		if (item.iconUrl && path.extname(item.iconUrl).toLowerCase() !== `.png`) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl must point to a PNG file.`);
		}
		if (item.searchable !== false && !String(item.description || ``).trim()) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: searchable items require a user-facing description.`);
		}
		if (String(item.description || ``).includes(`|`)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: description contains an unnormalized pipe delimiter.`);
		}
		if (item.searchable !== false && shouldHideItem(item)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: unavailable or placeholder definitions must not be searchable.`);
		}
		if (needsAvailabilityReview(item)) {
			problems.push(
				`Item ${index} ${item.name || `(unnamed)`}: hidden definition now has finished text and ${availabilityEvidence(item).join(`, `)}; review whether it was implemented.`,
			);
		}

		const iconPath = path.resolve(PROJECT_ROOT, item.iconUrl || ``);
		const relativeIconPath = path.relative(PROJECT_ROOT, iconPath);

		if (relativeIconPath.startsWith(`..`) || path.isAbsolute(relativeIconPath)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl escapes project root.`);
		} else if (!fs.existsSync(iconPath)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: icon file does not exist at ${item.iconUrl}.`);
		}

		for (const [dropIndex, drop] of (item.droppedBy || []).entries()) {
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

	const dogCoin = itemData.Items.find(item => item.name === `Dog Coin`);
	if (!dogCoin?.medalMerchants?.map || dogCoin.medalMerchants.entries?.length !== 4 ||
		dogCoin.medalMerchants.mapSources?.map !== `palpagos` || !dogCoin.medalMerchants.mapSources?.markers?.length) {
		problems.push(`Dog Coin must include all four fixed Medal Merchant locations and their map.`);
	}

	for (const field of [`id`, `code`]) {
		problems.push(...findDuplicateValues(itemData.Items, field));
	}

	for (const source of itemData.Sources || []) {
		if (source.url !== undefined) {
			problems.push(`Source ${source.slug}: stored source URLs are not allowed.`);
		}

		const actualCount = itemData.Items.filter(item => item.source === source.slug).length;

		if (actualCount !== source.count) {
			problems.push(`Source ${source.slug}: expected ${source.count} item(s), found ${actualCount}.`);
		}
	}

	for (const [index, item] of itemData.Items.entries()) {
		const acquisition = item.acquisition;
		if (!acquisition) {
			continue;
		}
		if (!Array.isArray(acquisition.sources) || !acquisition.sources.length) {
			problems.push(`Item ${index} ${item.name}: acquisition sources must be a non-empty array.`);
		}
		for (const [sourceIndex, source] of (acquisition.sources || []).entries()) {
			if (!String(source.type || ``).trim() || !Array.isArray(source.entries) || !source.entries.length) {
				problems.push(`Item ${index} ${item.name}: acquisition source ${sourceIndex} requires a type and entries.`);
			}
			for (const [entryIndex, entry] of (source.entries || []).entries()) {
				if (!String(entry.location || ``).trim()) {
					problems.push(`Item ${index} ${item.name}: acquisition source ${sourceIndex} entry ${entryIndex} is missing location.`);
				}
			}
		}
		if (!acquisition.map) {
			continue;
		}
		const mapPath = path.resolve(PROJECT_ROOT, acquisition.map);
		const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
		if (relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath)) {
			problems.push(`Item ${index} ${item.name}: acquisition map escapes project root.`);
		} else if (path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
			problems.push(`Item ${index} ${item.name}: acquisition map must be an existing PNG at ${acquisition.map}.`);
		}
		const mapSources = acquisition.mapSources;
		const legacySources = Array.isArray(mapSources?.chestPools) && Array.isArray(mapSources?.dungeons);
		const markerSources = [`palpagos`, `worldtree`].includes(mapSources?.map) && Array.isArray(mapSources?.markers) && mapSources.markers.length;
		const multiMapSources = Array.isArray(mapSources?.maps) && mapSources.maps.length && mapSources.maps.every(source =>
			[`palpagos`, `worldtree`].includes(source.map) && Array.isArray(source.markers) && source.markers.length,
		);
		if (!legacySources && !markerSources && !multiMapSources) {
			problems.push(`Item ${index} ${item.name}: mapped acquisition requires legacy chest/dungeon sources or map marker sources.`);
		}
		const allMarkers = [
			...(mapSources?.markers || []),
			...(mapSources?.maps || []).flatMap(source => source.markers || []),
		];
		for (const [markerIndex, marker] of allMarkers.entries()) {
			if (!String(marker.type || ``).trim()) {
				problems.push(`Item ${index} ${item.name}: map marker ${markerIndex} is missing type.`);
			}
		}
	}

	for (const [index, item] of itemData.Items.entries()) {
		const merchants = item.merchantLocations;
		if (!merchants) {
			continue;
		}
		if (!Array.isArray(merchants.entries) || !merchants.entries.length || merchants.entries.some(entry => !String(entry.merchant || ``).trim() || !String(entry.shop || ``).trim())) {
			problems.push(`Item ${index} ${item.name}: merchantLocations requires named merchant/shop entries.`);
		}
		const mapPath = path.resolve(PROJECT_ROOT, merchants.map || ``);
		const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
		if (!merchants.map || relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath) || path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
			problems.push(`Item ${index} ${item.name}: merchantLocations requires an existing in-project PNG map.`);
		}
		if (merchants.mapSources?.map !== `palpagos` || !Array.isArray(merchants.mapSources?.markers) || !merchants.mapSources.markers.length) {
			problems.push(`Item ${index} ${item.name}: merchantLocations requires Palpagos marker sources.`);
		}
	}

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
	if (mappedRegionalItems.length !== 486) {
		problems.push(`Expected all 486 verified regional loot-pool records, found ${mappedRegionalItems.length}.`);
	}
	const solSphere = itemData.Items.find(item => item.name === `Sol Sphere`);
	if (!solSphere?.acquisition?.map || !solSphere.acquisition.sources?.some(source => source.type === `Junk`) ||
		!solSphere.acquisition.sources?.some(source => source.type === `Supply`) ||
		!solSphere.acquisition.sources?.some(source => source.type === `Treasure`)) {
		problems.push(`Sol Sphere must include its verified Sky Island junk, supply, and treasure sources.`);
	}
	for (const item of mappedRegionalItems) {
		const mappedMarkerTypes = [
			...(item.acquisition?.mapSources?.markers || []),
			...(item.acquisition?.mapSources?.maps || []).flatMap(source => source.markers || []),
		].map(marker => marker.type);
		if (mappedMarkerTypes.some(type => type === `Supply` || /^Salvage Rank/u.test(type))) {
			problems.push(`${item.name}: supply drops and salvage sources must remain textual instead of being mapped.`);
		}
	}
	for (const excludedName of [`Common Egg`, `Mimog Effigy`]) {
		if (itemData.Items.some(item => item.name === excludedName && item.acquisition)) {
			problems.push(`${excludedName}: intentionally non-location-based items must remain unmapped.`);
		}
	}

	for (const journalMap of [`data/item-maps/palpagos-journals.png`, `data/item-maps/worldtree-journals.png`]) {
		if (!fs.existsSync(path.resolve(PROJECT_ROOT, journalMap))) {
			problems.push(`Missing generated journal map at ${journalMap}.`);
		}
	}

	const slabItems = itemData.Items.filter(item => /\bSlab(?: Fragment)?$/i.test(item.name));

	for (const [index, item] of slabItems.entries()) {
		const acquisition = item.acquisition;
		const unusedUltraFragment = /\(Ultra\) Slab Fragment$/i.test(item.name);

		if (unusedUltraFragment) {
			if (item.searchable !== false) {
				problems.push(`${item.name}: unused Ultra fragment definitions must be hidden from item lookup.`);
			}
			if (acquisition !== undefined) {
				problems.push(`${item.name}: unused Ultra fragment definitions must not have acquisition data.`);
			}
			continue;
		}

		if (!acquisition || !Array.isArray(acquisition.sources)) {
			problems.push(`${item.name}: missing embedded acquisition sources.`);
			continue;
		}
		if (!acquisition.sources.length && !String(acquisition.note || ``).trim()) {
			problems.push(`Acquisition ${index} ${item.name}: an empty source list requires a note.`);
		}

		for (const [sourceIndex, source] of acquisition.sources.entries()) {
			if (source.type === `Crafting`) {
				problems.push(`Acquisition ${index} ${item.name}: crafting belongs in recipes, not acquisition sources.`);
			}
			if (!String(source.type || ``).trim() || !Array.isArray(source.entries) || !source.entries.length) {
				problems.push(`Acquisition ${index} ${item.name}: source ${sourceIndex} requires a type and entries.`);
				continue;
			}
			for (const [entryIndex, entry] of source.entries.entries()) {
				if (!String(entry.location || ``).trim()) {
					problems.push(`Acquisition ${index} ${item.name}: source ${sourceIndex} entry ${entryIndex} is missing location.`);
				}
			}
		}

		if (acquisition.map) {
			const mapPath = path.resolve(PROJECT_ROOT, acquisition.map);
			const relativeMapPath = path.relative(PROJECT_ROOT, mapPath);
			if (relativeMapPath.startsWith(`..`) || path.isAbsolute(relativeMapPath)) {
				problems.push(`Acquisition ${index} ${item.name}: map escapes project root.`);
			} else if (path.extname(mapPath).toLowerCase() !== `.png` || !fs.existsSync(mapPath)) {
				problems.push(`Acquisition ${index} ${item.name}: map must be an existing PNG at ${acquisition.map}.`);
			}
			const legacyMap = Array.isArray(acquisition.mapSources?.chestPools) && Array.isArray(acquisition.mapSources?.dungeons);
			const regionalMap = [`palpagos`, `worldtree`].includes(acquisition.mapSources?.map) && acquisition.mapSources?.markers?.length;
			if (!legacyMap && !regionalMap) {
				problems.push(`Acquisition ${index} ${item.name}: mapped slab items require legacy or regional marker sources.`);
			}
		} else if (acquisition.mapSources !== undefined) {
			problems.push(`Acquisition ${index} ${item.name}: mapSources requires a map.`);
		}
	}

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
