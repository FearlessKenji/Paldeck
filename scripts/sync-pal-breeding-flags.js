#!/usr/bin/env node

const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const PAL_DATA_PATH = path.join(ROOT_DIR, `data`, `palData.json`);
const PAL_BREEDING_PATH = path.join(ROOT_DIR, `data`, `palBreeding.json`);

function parseArgs(argv) {
	const extractionIndex = argv.indexOf(`--extraction`);
	return { extractionPath: extractionIndex >= 0 ? argv[extractionIndex + 1] : null, write: argv.includes(`--write`) };
}

function installedExtractionPath() {
	const auditRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `extractions`);
	const builds = fs.readdirSync(auditRoot, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
		.map(entry => entry.name)
		.sort((first, second) => Number(second) - Number(first));
	return builds.length ? path.join(auditRoot, builds[0], `data.json`) : null;
}

function normalizeGender(value) {
	return value && value !== `None` ? value.toLowerCase() : null;
}

function buildUniqueCombinations(palFile, extracted) {
	const namesById = new Map(palFile.Pals.map(pal => [String(pal.breeding.id).toLowerCase(), pal.name]));
	return extracted.UniqueBreedingCombinations.map(source => ({
		row: String(source.Row),
		parentA: namesById.get(String(source.ParentTribeA).toLowerCase()),
		parentAGender: normalizeGender(source.ParentGenderA),
		parentB: namesById.get(String(source.ParentTribeB).toLowerCase()),
		parentBGender: normalizeGender(source.ParentGenderB),
		child: namesById.get(String(source.ChildCharacterId).toLowerCase()),
	})).filter(row => {
		if (!row.parentA || !row.parentB || !row.child) {
			throw new Error(`Unmapped installed-game combination row ${row.row}.`);
		}
		return row.parentA !== row.parentB || row.parentA !== row.child;
	}).map(row => {
		if (!row.parentAGender && !row.parentBGender) {
			delete row.parentAGender;
			delete row.parentBGender;
		}
		return row;
	});
}

function synchronizeBreedingData(palFile, breedingFile, extracted) {
	if (!Array.isArray(extracted.UniqueBreedingCombinations) || !extracted.UniqueBreedingCombinations.length) {
		throw new Error(`Installed-game extraction has no fixed breeding combinations.`);
	}
	const rows = new Map(extracted.Tribes.flatMap(tribe => tribe.Pals)
		.map(pal => [String(pal.Name).toLowerCase(), pal]));
	const uniqueCombinations = buildUniqueCombinations(palFile, extracted);
	const uniqueChildren = new Set(uniqueCombinations.map(row => row.child));
	for (const pal of palFile.Pals) {
		const row = rows.get(String(pal.breeding?.id).toLowerCase());
		if (!row || typeof row.IgnoreCombi !== `boolean`) {
			throw new Error(`Missing installed-game breeding row for ${pal.name} (${pal.breeding?.id}).`);
		}
		const hasRank = Number.isInteger(row.CombiRank) && row.CombiRank < 9999;
		pal.breeding.rank = hasRank ? row.CombiRank : null;
		pal.breeding.priority = hasRank ? row.CombiDuplicatePriority : null;
		pal.breeding.index = row.GameIndex;
		pal.breeding.ignoreCombi = row.IgnoreCombi;
		pal.breeding.canBeParent = hasRank && !pal.hidden;
		pal.breeding.canBeChild = hasRank && !pal.hidden;
		pal.breeding.canBeStandardChild = hasRank && !row.IgnoreCombi && !uniqueChildren.has(pal.name);
	}
	breedingFile.UniqueCombinations = uniqueCombinations;
	delete breedingFile.GenderedPairResults;
	return { breedingFile, palFile };
}

function serialize(value) {
	return `${JSON.stringify(value, null, `\t`)}\n`;
}

const options = parseArgs(process.argv.slice(2));
const extractionPath = options.extractionPath || installedExtractionPath();
if (!extractionPath || !fs.existsSync(extractionPath)) {
	throw new Error(`No installed-game extraction found; pass --extraction <data.json>.`);
}
const originalPalData = fs.readFileSync(PAL_DATA_PATH, `utf8`);
const originalBreedingData = fs.readFileSync(PAL_BREEDING_PATH, `utf8`);
const synchronized = synchronizeBreedingData(
	JSON.parse(originalPalData),
	JSON.parse(originalBreedingData),
	JSON.parse(fs.readFileSync(extractionPath, `utf8`)),
);
const palOutput = serialize(synchronized.palFile);
const breedingOutput = serialize(synchronized.breedingFile);
if (options.write) {
	fs.writeFileSync(PAL_DATA_PATH, palOutput);
	fs.writeFileSync(PAL_BREEDING_PATH, breedingOutput);
}
console.log(`${options.write ? `Updated` : `Checked`} installed breeding data for ${synchronized.palFile.Pals.length} Pals and ${synchronized.breedingFile.UniqueCombinations.length} fixed combinations from ${extractionPath}.`);
if (!options.write && (palOutput !== originalPalData || breedingOutput !== originalBreedingData)) {
	console.log(`Breeding data requires synchronization; rerun with --write.`);
	process.exitCode = 1;
}

module.exports = { buildUniqueCombinations, synchronizeBreedingData };
