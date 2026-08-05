// Validates resolved item records, compact preset references, local assets, and curated acquisition rules.
const fs = require(`node:fs`);
const crypto = require(`node:crypto`);
const path = require(`node:path`);
const { availabilityEvidence, hasPlaceholderItemText, needsAvailabilityReview, shouldHideItem } = require(`../utils/itemVisibility.js`);
const { rawItemData, resolvedItemData } = require(`../utils/itemData.js`);
const availabilityManifest = require(`../data/itemAvailability.json`);
const journalData = require(`../data/journalData.json`);
const { findAvailabilityManifestProblems } = require(`../utils/itemAvailabilityAudit.js`);
const itemFile = resolvedItemData();
const { itemWorkbench } = require(`../utils/itemWorkbench.js`);
const { sourceText } = require(`../utils/itemCards.js`);

const PROJECT_ROOT = path.resolve(__dirname, `..`);
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

function findItemDataProblems(itemData) {
	const problems = findAvailabilityManifestProblems(itemData, availabilityManifest);

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
		if (item.searchable === false && !hasPlaceholderItemText(item) && !AVAILABILITY_DECISION_IDS.has(item.id)) {
			problems.push(`Item ${index} ${item.name}: hidden localized definitions require a versioned availability decision.`);
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
	for (const [name, locations] of Object.entries(itemData.MerchantLocationSets || {})) {
		const markers = locations.mapSources?.markers || [];
		const signature = crypto.createHash(`sha256`).update(JSON.stringify(locations.mapSources)).digest(`hex`).slice(0, 10);
		const expectedMap = markers.length ? `data/item-maps/merchant-locations-${signature}.png` : null;
		if (expectedMap && locations.map !== expectedMap) {
			problems.push(`${name}: merchant map filename does not match its marker set.`);
		}
		for (const marker of markers) {
			const expectedType = /_Shop_2$/u.test(marker.href || ``) ? `Weapons Merchant` : `Wandering Merchant`;
			if (marker.legendType !== expectedType) {
				problems.push(`${name}: ${marker.href} must use the ${expectedType} legend.`);
			}
		}
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
		const renderedSources = sourceText(acquisition, item.merchantLocations);
		if (/\b(?:Viking\d+|DarkIsland|SkyIsland|technology-book pool|Oilrig(?: Large)? 0?\d)\b|_/iu.test(renderedSources)) {
			problems.push(`Item ${index} ${item.name}: rendered acquisition sources expose an internal game identifier.`);
		}
		if (/^Ancient Relic Recycler [^(\n]/mu.test(renderedSources)) {
			problems.push(`Item ${index} ${item.name}: qualified acquisition sources must place their subtype in parentheses.`);
		}
		if (/Dungeon (?:or Sanctuary|and Regional) Chests|^Pal Critics?(?:\s|$)|\([^)]*: Lvl \d+|\b\d{4,}\b|^Locations \(|^Spawn Locations \(|^\w+ Treasure Map /mu.test(renderedSources)) {
			problems.push(`Item ${index} ${item.name}: rendered acquisition sources contain an unnormalized pathway label.`);
		}
		const renderedSourceLines = renderedSources.split(`\n`).filter(Boolean);
		if (new Set(renderedSourceLines).size !== renderedSourceLines.length) {
			problems.push(`Item ${index} ${item.name}: rendered acquisition sources contain duplicate lines.`);
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
		const textualSourceTypes = new Set(acquisition.sources.map(source => source.type));
		const allowedUnpinnedSource = type => type === `Supply` || /^Salvage Rank/u.test(type) || [`Fishing`, `Fishing Ponds`, `Mission`].includes(type);
		const unpinnedSources = Array.isArray(mapSources?.unpinnedSources) && mapSources.unpinnedSources.length &&
			mapSources.unpinnedSources.every(type => textualSourceTypes.has(type) && allowedUnpinnedSource(type));
		const unpinnedOnlyMap = unpinnedSources && Array.isArray(mapSources?.markers) && mapSources.markers.length === 0;
		const multiMapSources = Array.isArray(mapSources?.maps) && mapSources.maps.length && mapSources.maps.every(source =>
			[`palpagos`, `worldtree`].includes(source.map) && Array.isArray(source.markers) && source.markers.length,
		);
		if (multiMapSources && new Set(mapSources.maps.map(source => source.map)).size !== mapSources.maps.length) {
			problems.push(`Item ${index} ${item.name}: repeated panels for the same physical map must be consolidated.`);
		}
		if (!legacySources && !markerSources && !multiMapSources && !unpinnedOnlyMap) {
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
	if (mappedRegionalItems.length !== 572) {
		problems.push(`Expected all 572 decoded regional loot-pool records for build 24467282, found ${mappedRegionalItems.length}.`);
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
		if (mappedMarkerTypes.some(type => /^Salvage Rank/u.test(type))) {
			problems.push(`${item.name}: salvage sources must remain textual instead of being mapped.`);
		}
	}
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
			if (!regionalSpawner && (!Number.isInteger(chestMarker.treasureGrade) || !Array.isArray(chestMarker.lotteryFields) || !chestMarker.lotteryFields.length)) {
				problems.push(`${item.name}: treasure-chest map markers require a decoded grade and exact lottery field IDs.`);
			}
		}
	}
	const generatedPhysicalMaps = itemData.Items.filter(item => /\/item-sources-[a-f0-9]{12}(?:-|\.png$)/u.test(item.acquisition?.map || ``));
	if (generatedPhysicalMaps.length !== 67) {
		problems.push(`Expected 67 generated physical-source item maps, found ${generatedPhysicalMaps.length}.`);
	}
	for (const item of generatedPhysicalMaps) {
		if (!fs.existsSync(path.resolve(PROJECT_ROOT, item.acquisition.map))) {
			problems.push(`${item.name}: generated physical-source map is missing.`);
		}
	}
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
	const treasureMapLoot = itemData.Items.filter(item => item.acquisition?.sources?.some(source => source.type === `Treasure Maps`));
	if (treasureMapLoot.length !== 245) {
		problems.push(`Expected 245 local card records backed by current Treasure Map loot tables, found ${treasureMapLoot.length}.`);
	}
	for (const item of treasureMapLoot) {
		const entries = item.acquisition.sources.find(source => source.type === `Treasure Maps`).entries;
		const markers = [...(item.acquisition.mapSources?.markers || []), ...(item.acquisition.mapSources?.maps || []).flatMap(source => source.markers || [])];
		if (!item.acquisition.map || !markers.some(marker => marker.legendType === `Treasure Map`) ||
			entries.some(entry => !/^(?:Common|Uncommon|Rare|Epic|Legendary) Treasure Map$/u.test(entry.location) ||
				!/^\d+(?:\.\d+)?%$/u.test(entry.probability || ``))) {
			problems.push(`${item.name}: Treasure Map loot requires rarity-qualified probabilities and gold source-map markers.`);
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
	const journals = itemData.Items.filter(item => item.journalEntry);
	if (journals.length !== 64) {
		problems.push(`Journal catalog must contain all 64 installed Note master rows.`);
	}
	if (journals.some(journal => !journal.id || !journal.name || !journal.description || !journal.acquisition?.mapSources?.markers?.length || !journal.acquisition?.map)) {
		problems.push(`Every journal item must include its game ID, title, text, placed marker, and individual map.`);
	}
	if (journalData.Journals?.length !== 64 || journalData.Journals.some(journal =>
		!journal.description || !/^data\/item-maps\/journal-(?:palpagos|worldtree)-.+\.png$/u.test(journal.map || ``))) {
		problems.push(`The /journal catalog must contain all 64 localized texts with individual journal maps.`);
	}
	for (const title of [`Suppression Operation Comms Log`, `Ancient Recorder`, `(A scorched piece of paper)`]) {
		if (!journals.some(journal => journal.name === title)) {
			problems.push(`Journal catalog is missing ${title}.`);
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
