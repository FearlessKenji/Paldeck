const palFile = require(`../data/palData.json`);
const breedingFile = require(`../data/palBreeding.json`);
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

function rowNames(row) {
	return Array.isArray(row) ? row : [row?.parentA, row?.parentB, row?.child];
}

function isSameSpeciesRow(row) {
	const [parentA, parentB, child] = rowNames(row).map(normalizeName);

	return parentA && parentA === parentB && parentA === child;
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
		if (!Array.isArray(rows)) {
			problems.push(`${groupName} must be an array.`);
			continue;
		}

		for (const row of rows) {
			for (const name of rowNames(row)) {
				if (!palsByName.has(normalizeName(name))) {
					problems.push(`${groupName} references unknown Pal: ${name || `(blank)`}.`);
				}
			}

			if (groupName === `UniqueCombinations` && isSameSpeciesRow(row)) {
				problems.push(`${groupName} row ${row?.row || `(unknown)`} is same-species; same-species rows should be omitted.`);
			}
		}
	}

	return problems;
}

const colors = palFile.Colors?.[0] || {};
const colorProblems = findPalColorProblems(palFile.Pals, colors);
const partnerTechProblems = findPartnerTechProblems(palFile.Pals);
const breedingMetadataProblems = findBreedingMetadataProblems(palFile.Pals);
const breedingReferenceProblems = findBreedingReferenceProblems(
	palFile.Pals,
	breedingFile,
);

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

if (breedingMetadataProblems.length) {
	console.error(`Found ${breedingMetadataProblems.length} breeding metadata issue(s):`);

	for (const problem of breedingMetadataProblems) {
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

if (!colorProblems.length && !partnerTechProblems.length && !breedingMetadataProblems.length && !breedingReferenceProblems.length) {
	console.log(`Pal data validation passed.`);
}
