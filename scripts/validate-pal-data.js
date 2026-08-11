const palFile = require(`../data/palData.json`);
const breedingFile = require(`../data/palBreeding.json`);
const encounterFile = require(`../data/palEncounterData.json`);
const { findPalColorProblems } = require(`../utils/palColors.js`);

const TRAILING_PARTNER_TECH_PATTERN = /\s+Technology\s+\d+\s*$/i;

function findPartnerTechProblems(pals) {
	return pals
		.filter(pal => TRAILING_PARTNER_TECH_PATTERN.test(pal.partner || ``))
		.map(pal => ({
			name: pal.name,
			number: pal.number,
			partner: pal.partner,
		}));
}

function findImplementedPlaceholderProblems(pals) {
	return pals
		.filter(pal => pal.hidden && pal.placeholder)
		.filter(pal =>
			String(pal.number || ``).trim() ||
			(String(pal.element || ``).trim() && pal.element !== `None`) ||
			pal.thumbnail !== `data/pals/pal-unknown.png` ||
			pal.breeding?.canBeParent || pal.breeding?.canBeChild || pal.breeding?.canBeStandardChild,
		)
		.map(pal => `${pal.name}: hidden placeholder now contains released Pal data; review visibility.`);
}

function normalizeName(value) {
	return String(value || ``).trim().toLowerCase();
}

function hasOwn(object, field) {
	return Object.hasOwn(object || {}, field);
}

function findBreedingMetadataProblems(pals) {
	const problems = [];
	const ids = new Map();

	for (const pal of pals) {
		const breeding = pal.breeding;

		if (!breeding) {
			problems.push(`${pal.number} ${pal.name}: missing breeding metadata.`);
			continue;
		}

		if (!String(breeding.id || ``).trim()) {
			problems.push(`${pal.number} ${pal.name}: breeding.id is missing.`);
		}

		for (const field of [`canBeParent`, `canBeChild`, `canBeStandardChild`, `variant`]) {
			if (typeof breeding[field] !== `boolean`) {
				problems.push(`${pal.number} ${pal.name}: breeding.${field} must be a boolean.`);
			}
		}

		for (const field of [`rank`, `priority`, `index`]) {
			if (hasOwn(breeding, field) && breeding[field] !== null && !Number.isFinite(breeding[field])) {
				problems.push(`${pal.number} ${pal.name}: breeding.${field} must be a number or null.`);
			}
		}

		const id = normalizeName(breeding.id);

		if (id) {
			const existing = ids.get(id);

			if (existing) {
				problems.push(`${pal.number} ${pal.name}: duplicate breeding.id also used by ${existing.number} ${existing.name}.`);
			}

			ids.set(id, pal);
		}
	}

	return problems;
}

function findLevelUpMoveProblems(pals) {
	const problems = [];
	for (const pal of pals.filter(entry => !entry.hidden)) {
		if (!Array.isArray(pal.levelUpMoves) || !pal.levelUpMoves.length) {
			problems.push(`${pal.number} ${pal.name}: missing level-up moves.`);
			continue;
		}
		let previousLevel = -1;
		for (const move of pal.levelUpMoves) {
			if (!Number.isInteger(move.level) || move.level < 1 || !move.name || !move.id) {
				problems.push(`${pal.number} ${pal.name}: contains an incomplete level-up move.`);
			}
			if (move.level < previousLevel) {
				problems.push(`${pal.number} ${pal.name}: level-up moves are not ordered by level.`);
			}
			previousLevel = move.level;
		}
	}
	return problems;
}

function rowNames(row) {
	return Array.isArray(row) ? row : [row?.parentA, row?.parentB, row?.child];
}

function isSameSpeciesRow(row) {
	const [parentA, parentB, child] = rowNames(row).map(normalizeName);

	return parentA && parentA === parentB && parentA === child;
}

function validateBreedingGroup(groupName, rows, palsByName) {
	if (!Array.isArray(rows)) {
		return [`${groupName} must be an array.`];
	}
	const problems = [];
	for (const row of rows) {
		for (const name of rowNames(row)) {
			if (!palsByName.has(normalizeName(name))) {
				problems.push(`${groupName} references unknown Pal: ${name || `(blank)`}.`);
			}
		}
		if (groupName === `UniqueCombinations` && isSameSpeciesRow(row)) {
			problems.push(
				`${groupName} row ${row?.row || `(unknown)`} is same-species; same-species rows should be omitted.`,
			);
		}
	}
	return problems;
}

function findBreedingReferenceProblems(pals, breedingData) {
	const problems = [];
	const palsByName = new Map(pals.map(pal => [normalizeName(pal.name), pal]));
	const referenceGroups = [
		[`UniqueCombinations`, breedingData.UniqueCombinations],
	];

	if (Object.hasOwn(breedingData, `SourceOverrides`)) {
		referenceGroups.push([`SourceOverrides`, breedingData.SourceOverrides]);
	}

	if (Array.isArray(breedingData.GenderedPairResults)) {
		referenceGroups.push([`GenderedPairResults`, breedingData.GenderedPairResults]);
	}

	if (Array.isArray(breedingData.PairResults)) {
		problems.push(`PairResults should not be present; use palData breeding metadata, local game-file combinations, and optional SourceOverrides instead.`);
	}

	if (Array.isArray(breedingData.SameSpeciesCombinations)) {
		problems.push(`SameSpeciesCombinations should not be present; same-species rows are handled by the formula rule and omitted from palBreeding.json.`);
	}

	if (Object.hasOwn(breedingData, `UnmappedGameUniqueCombinationRows`)) {
		problems.push(`UnmappedGameUniqueCombinationRows should not be present; local game-file fixed rows should be resolved or omitted before release.`);
	}

	for (const [groupName, rows] of referenceGroups) {
		problems.push(...validateBreedingGroup(groupName, rows, palsByName));
	}

	return problems;
}

function encounterDropProblems(encounter) {
	if (!Array.isArray(encounter.drops) || !encounter.drops.length) {
		return [`${encounter.pal}: encounter must contain at least one drop.`];
	}
	const problems = [];
	for (const drop of encounter.drops) {
		const complete = String(drop.item || ``).trim() && String(drop.quantity || ``).trim() &&
			String(drop.probability || ``).trim();
		if (!complete) {
			problems.push(`${encounter.pal}: encounter contains an incomplete drop row.`);
		}
	}
	if (!encounter.drops.some(drop => / Egg \(/.test(drop.item) && drop.probability === `100%`)) {
		problems.push(`${encounter.pal}: encounter is missing its guaranteed egg.`);
	}
	return problems;
}

function encounterProblems(encounter, visibleNames, duplicateKey) {
	const problems = [];
	if (!visibleNames.has(normalizeName(encounter.pal))) {
		problems.push(`Encounter data references unknown or hidden Pal: ${encounter.pal || `(blank)`}.`);
	}
	if (duplicateKey) {
		problems.push(`Encounter data contains duplicate source: ${duplicateKey.replaceAll(`\0`, ` / `)}.`);
	}
	if (encounter.source !== `Summoning Altar`) {
		problems.push(`${encounter.pal}: unsupported encounter source ${encounter.source || `(blank)`}.`);
	}
	if (!Number.isInteger(encounter.level) || encounter.level <= 0) {
		problems.push(`${encounter.pal}: encounter level must be a positive integer.`);
	}
	return [...problems, ...encounterDropProblems(encounter)];
}

function findEncounterDataProblems(pals, encounterData) {
	const problems = [];
	const visibleNames = new Set(pals.filter(pal => !pal.hidden).map(pal => normalizeName(pal.name)));
	const keys = new Set();

	if (!Array.isArray(encounterData.Encounters)) {
		return [`palEncounterData.Encounters must be an array.`];
	}

	for (const encounter of encounterData.Encounters) {
		const key = `${normalizeName(encounter.pal)}\0${encounter.source}\0${encounter.level}\0${encounter.variant || ``}`;
		problems.push(...encounterProblems(encounter, visibleNames, keys.has(key) ? key : null));
		keys.add(key);
	}

	return problems;
}

const colors = palFile.Colors?.[0] || {};
const colorProblems = findPalColorProblems(palFile.Pals, colors);
const partnerTechProblems = findPartnerTechProblems(palFile.Pals);
const implementedPlaceholderProblems = findImplementedPlaceholderProblems(palFile.Pals);
const breedingMetadataProblems = findBreedingMetadataProblems(palFile.Pals);
const levelUpMoveProblems = findLevelUpMoveProblems(palFile.Pals);
const breedingReferenceProblems = findBreedingReferenceProblems(
	palFile.Pals,
	breedingFile,
);
const encounterDataProblems = findEncounterDataProblems(palFile.Pals, encounterFile);

if (colorProblems.length) {
	console.error(`Found ${colorProblems.length} pal color issue(s):`);

	for (const problem of colorProblems) {
		console.error(`${problem.number} ${problem.name} (${problem.element}): ${problem.reason}`);

		if (problem.expectedColor) {
			console.error(`  expected: ${JSON.stringify(problem.expectedColor)}`);
			console.error(`  actual:   ${JSON.stringify(problem.actualColor)}`);
		}
	}

	process.exitCode = 1;
}

if (partnerTechProblems.length) {
	console.error(`Found ${partnerTechProblems.length} partner skill text issue(s):`);

	for (const problem of partnerTechProblems) {
		// Technology unlock metadata belongs in the separate Tech field, not Partner Skill text.
		console.error(`${problem.number} ${problem.name}: Partner Skill ends with Technology unlock text.`);
		console.error(`  partner: ${problem.partner}`);
	}

	process.exitCode = 1;
}

if (implementedPlaceholderProblems.length) {
	console.error(`Found ${implementedPlaceholderProblems.length} hidden Pal implementation candidate(s):`);

	for (const problem of implementedPlaceholderProblems) {
		console.error(problem);
	}

	process.exitCode = 1;
}

if (breedingMetadataProblems.length) {
	console.error(`Found ${breedingMetadataProblems.length} breeding metadata issue(s):`);

	for (const problem of breedingMetadataProblems) {
		console.error(problem);
	}

	process.exitCode = 1;
}

if (levelUpMoveProblems.length) {
	console.error(`Found ${levelUpMoveProblems.length} level-up move issue(s):`);
	for (const problem of levelUpMoveProblems) {
		console.error(problem);
	}
	process.exitCode = 1;
}

if (breedingReferenceProblems.length) {
	console.error(`Found ${breedingReferenceProblems.length} breeding reference issue(s):`);

	for (const problem of breedingReferenceProblems.slice(0, 50)) {
		console.error(problem);
	}

	if (breedingReferenceProblems.length > 50) {
		console.error(`... ${breedingReferenceProblems.length - 50} more`);
	}

	process.exitCode = 1;
}

if (encounterDataProblems.length) {
	console.error(`Found ${encounterDataProblems.length} Pal encounter data issue(s):`);

	for (const problem of encounterDataProblems) {
		console.error(problem);
	}

	process.exitCode = 1;
}

if (
	!colorProblems.length &&
	!partnerTechProblems.length &&
	!implementedPlaceholderProblems.length &&
	!breedingMetadataProblems.length &&
	!breedingReferenceProblems.length &&
	!encounterDataProblems.length
) {
	console.log(`Pal data validation passed.`);
}
