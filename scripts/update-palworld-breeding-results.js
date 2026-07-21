const fs = require(`node:fs`);
const path = require(`node:path`);
const { URL } = require(`node:url`);
const {
	PALDB_BREED_CHILD_URL,
	PALDB_BREED_PAIR_URL,
	fetchPaldbData,
	mapByName,
	normalizeKey,
} = require(`./lib/paldb-data.js`);
const { stripTags } = require(`./lib/html-text.js`);
const { createBreedingCalculator, normalizeBreedingName } = require(`../utils/palBreeding.js`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const PAL_BREEDING_PATH = path.join(ROOT_DIR, `data`, `palBreeding.json`);
const PAL_DATA_PATH = path.join(ROOT_DIR, `data`, `palData.json`);

function parseArgs(argv) {
	const options = {
		concurrency: 4,
		limit: 25,
		write: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--write`) {
			options.write = true;
			continue;
		}

		if (arg === `--concurrency`) {
			const value = Number.parseInt(argv[index + 1], 10);

			if (Number.isInteger(value) && value > 0) {
				options.concurrency = value;
			}

			index += 1;
			continue;
		}

		if (arg === `--limit`) {
			const value = Number.parseInt(argv[index + 1], 10);

			if (Number.isInteger(value) && value >= 0) {
				options.limit = value;
			}

			index += 1;
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, `utf8`));
}

function stringifyJson(data) {
	return JSON.stringify(data, null, `\t`)
		.replace(/\[\n(\t+)"([^"\n]+)",\n\1"([^"\n]+)",\n\1"([^"\n]+)"\n\t*\]/g, `["$2", "$3", "$4"]`);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${stringifyJson(data)}\n`);
}

function parseItemNames(html) {
	return [...String(html || ``).matchAll(/<a[^>]*class="itemname"[^>]*>([\s\S]*?)<\/a>/gi)]
		.map(match => stripTags(match[1]))
		.filter(Boolean);
}

function pairKey(parentA, parentB) {
	return [normalizeKey(parentA), normalizeKey(parentB)]
		.sort((first, second) => first.localeCompare(second))
		.join(`|`);
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;

			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, worker),
	);

	return results;
}

async function fetchParentPairsForChild(child) {
	const url = new URL(PALDB_BREED_CHILD_URL);

	url.searchParams.set(`child3`, child.breedingCode);

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	const names = parseItemNames(await response.text());
	const pairs = [];

	for (let index = 0; index + 2 < names.length; index += 3) {
		pairs.push({
			child: names[index + 2],
			parentA: names[index],
			parentB: names[index + 1],
		});
	}

	return {
		child,
		pairs,
		parseRemainder: names.length % 3,
	};
}

async function fetchChildForParentPair(parentA, parentB) {
	const url = new URL(PALDB_BREED_PAIR_URL);

	url.searchParams.set(`parent2a`, parentA.breedingCode);
	url.searchParams.set(`parent2b`, parentB.breedingCode);

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	const itemNames = parseItemNames(await response.text());

	return {
		childName: itemNames[2] || ``,
		itemNames,
	};
}

function pairResponseMatchesParents(itemNames, parentA, parentB) {
	if (itemNames.length < 3) {
		return false;
	}

	const expected = [parentA.name, parentB.name]
		.map(name => normalizeKey(name))
		.sort((first, second) => first.localeCompare(second));
	const actual = itemNames.slice(0, 2)
		.map(name => normalizeKey(name))
		.sort((first, second) => first.localeCompare(second));

	return actual[0] === expected[0] && actual[1] === expected[1];
}

function sortPairRows(pairRows, currentIndexByName) {
	return pairRows.sort((first, second) => {
		for (const index of [0, 1, 2]) {
			const firstIndex = currentIndexByName.get(normalizeKey(first[index])) ?? Number.MAX_SAFE_INTEGER;
			const secondIndex = currentIndexByName.get(normalizeKey(second[index])) ?? Number.MAX_SAFE_INTEGER;

			if (firstIndex !== secondIndex) {
				return firstIndex - secondIndex;
			}
		}

		return first.join(`|`).localeCompare(second.join(`|`));
	});
}

function resultChildNames(result) {
	return (result.children || [{ child: result.child }])
		.map(entry => entry.child?.name || ``)
		.filter(Boolean);
}

function buildSourceOverrides(pairRows, palFile, breedingFile, currentIndexByName) {
	const calculator = createBreedingCalculator(palFile, {
		...breedingFile,
		SourceOverrides: [],
	});
	const sourceOverrides = [];

	for (const pairRow of pairRows) {
		const localChildren = resultChildNames(calculator.calculateChild(pairRow[0], pairRow[1]));

		if (localChildren.some(child => normalizeBreedingName(child) === normalizeBreedingName(pairRow[2]))) {
			continue;
		}

		sourceOverrides.push(pairRow);
	}

	return sortPairRows(sourceOverrides, currentIndexByName);
}

function mergePalBreedingMetadata(palFile, currentRows, pairRows) {
	const existingByName = mapByName(palFile.Pals);
	const parentNames = new Set();
	const childNames = new Set();
	const missingFromPalData = [];
	const pals = palFile.Pals.map(pal => ({
		...pal,
		breeding: {
			...(pal.breeding || {}),
		},
	}));

	for (const [parentA, parentB, child] of pairRows) {
		parentNames.add(normalizeKey(parentA));
		parentNames.add(normalizeKey(parentB));
		childNames.add(normalizeKey(child));
	}

	for (const current of currentRows) {
		if (existingByName.has(normalizeKey(current.name))) {
			continue;
		}

		missingFromPalData.push(current);
	}

	for (const pal of pals) {
		const current = currentRows.find(row => normalizeKey(row.name) === normalizeKey(pal.name));

		if (current) {
			pal.breeding.id = current.breedingId;
		}

		pal.breeding.canBeParent = parentNames.has(normalizeKey(pal.name));
		pal.breeding.canBeChild = childNames.has(normalizeKey(pal.name));

		if (!Object.hasOwn(pal.breeding, `canBeStandardChild`)) {
			pal.breeding.canBeStandardChild = false;
		}
	}

	return {
		missingFromPalData,
		pals,
	};
}

async function resolveConflicts(conflicts, currentByName, pairRowsByKey) {
	const uniqueConflictsByPair = new Map();
	const resolved = [];
	const unresolved = [];

	for (const conflict of conflicts) {
		uniqueConflictsByPair.set(pairKey(conflict.existing[0], conflict.existing[1]), conflict);
	}

	for (const conflict of uniqueConflictsByPair.values()) {
		const parentA = currentByName.get(normalizeKey(conflict.existing[0]));
		const parentB = currentByName.get(normalizeKey(conflict.existing[1]));

		if (!parentA?.breedingCode || !parentB?.breedingCode) {
			unresolved.push({
				...conflict,
				reason: `Missing parent breeding code`,
			});
			continue;
		}

		const pairResult = await fetchChildForParentPair(parentA, parentB);

		if (!pairResponseMatchesParents(pairResult.itemNames, parentA, parentB)) {
			unresolved.push({
				...conflict,
				reason: `Pair endpoint returned parent echo ${pairResult.itemNames.slice(0, 2).join(` + `) || `(blank)`}`,
			});
			continue;
		}

		const childName = pairResult.childName;
		const child = currentByName.get(normalizeKey(childName));

		if (!child) {
			unresolved.push({
				...conflict,
				reason: `Pair endpoint returned unknown child ${childName || `(blank)`}`,
			});
			continue;
		}

		const resolvedResult = [parentA.name, parentB.name, child.name];

		pairRowsByKey.set(pairKey(parentA.name, parentB.name), resolvedResult);
		resolved.push({
			...conflict,
			resolved: resolvedResult,
		});
	}

	return {
		resolved,
		unresolved,
	};
}

function printRows(title, rows, limit, formatter) {
	console.log(`\n${title}: ${rows.length}`);

	for (const row of rows.slice(0, limit)) {
		console.log(`- ${formatter(row)}`);
	}

	if (rows.length > limit) {
		console.log(`... ${rows.length - limit} more`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const breedingFile = readJson(PAL_BREEDING_PATH);
	const palFile = readJson(PAL_DATA_PATH);
	const { currentRows } = await fetchPaldbData();
	const currentByName = mapByName(currentRows);
	const currentIndexByName = new Map(currentRows.map((row, index) => [normalizeKey(row.name), index]));
	const children = currentRows.filter(row => row.breedingCode);
	const fetched = await mapWithConcurrency(
		children,
		options.concurrency,
		child => fetchParentPairsForChild(child),
	);
	const pairRowsByKey = new Map();
	const conflicts = [];
	const parseProblems = [];
	const unknownRows = [];

	for (const result of fetched) {
		if (result.parseRemainder) {
			parseProblems.push({
				child: result.child.name,
				remainder: result.parseRemainder,
			});
		}

		for (const pair of result.pairs) {
			const parentA = currentByName.get(normalizeKey(pair.parentA));
			const parentB = currentByName.get(normalizeKey(pair.parentB));
			const child = currentByName.get(normalizeKey(pair.child));

			if (!parentA || !parentB || !child) {
				unknownRows.push(pair);
				continue;
			}

			const key = pairKey(parentA.name, parentB.name);
			const existing = pairRowsByKey.get(key);

			if (existing && normalizeKey(existing[2]) !== normalizeKey(child.name)) {
				conflicts.push({
					existing,
					next: [parentA.name, parentB.name, child.name],
				});
				continue;
			}

			pairRowsByKey.set(key, [parentA.name, parentB.name, child.name]);
		}
	}

	const resolvedConflicts = await resolveConflicts(conflicts, currentByName, pairRowsByKey);
	const pairRows = sortPairRows([...pairRowsByKey.values()], currentIndexByName);
	const sourceOverrides = buildSourceOverrides(pairRows, palFile, breedingFile, currentIndexByName);
	const expectedPairCount = (children.length * (children.length + 1)) / 2;
	const pairCountProblems = [];

	if (pairRows.length !== expectedPairCount) {
		pairCountProblems.push({
			actual: pairRows.length,
			expected: expectedPairCount,
		});
	}

	const merged = mergePalBreedingMetadata(palFile, currentRows, pairRows);
	const nextPalFile = {
		...palFile,
		Pals: merged.pals,
	};
	const nextBreedingFile = {
		...breedingFile,
	};

	if (sourceOverrides.length) {
		nextBreedingFile.SourceOverrides = sourceOverrides;
	} else {
		delete nextBreedingFile.SourceOverrides;
	}

	delete nextBreedingFile.FormulaMetadata;
	delete nextBreedingFile.PairResults;
	delete nextBreedingFile.PairResultsMetadata;
	delete nextBreedingFile.Pals;
	delete nextBreedingFile.SourceOverrideMetadata;
	delete nextBreedingFile.SourceOnlyPals;
	delete nextBreedingFile.SourceValidationMetadata;

	if (options.write) {
		if (resolvedConflicts.unresolved.length || parseProblems.length || unknownRows.length || pairCountProblems.length) {
			throw new Error(`Refusing to write source overrides with conflicts, parse problems, unknown Pal rows, or an incomplete pair grid.`);
		}

		writeJson(PAL_DATA_PATH, nextPalFile);
		writeJson(PAL_BREEDING_PATH, nextBreedingFile);
	}

	console.log(`Palworld breeding source-override update against PalDB (${options.write ? `write` : `dry-run`})`);
	console.log(`Current PalDB rows: ${currentRows.length}`);
	console.log(`Child endpoints fetched: ${children.length}`);
	console.log(`Fetched pair rows: ${pairRows.length}`);
	console.log(`Expected pair rows: ${expectedPairCount}`);
	console.log(`Source overrides: ${sourceOverrides.length}`);
	console.log(`PalDB rows missing from palData: ${merged.missingFromPalData.length}`);
	console.log(`Files ${options.write ? `updated` : `not written`}.`);

	printRows(`PalDB rows missing from palData`, merged.missingFromPalData, options.limit, row => `#${row.number} ${row.name}`);
	printRows(
		`Source override sample`,
		sourceOverrides,
		options.limit,
		row => `${row[0]} + ${row[1]} -> ${row[2]}`,
	);
	printRows(
		`Resolved conflicts`,
		resolvedConflicts.resolved,
		options.limit,
		row => `${row.existing[0]} + ${row.existing[1]} -> ${row.resolved[2]}`,
	);
	printRows(
		`Unresolved conflicts`,
		resolvedConflicts.unresolved,
		options.limit,
		row => `${row.existing[0]} + ${row.existing[1]}: ${row.reason}`,
	);
	printRows(
		`Parse problems`,
		parseProblems,
		options.limit,
		row => `${row.child}: ${row.remainder} extra item name(s)`,
	);
	printRows(
		`Unknown Pal rows`,
		unknownRows,
		options.limit,
		row => `${row.parentA} + ${row.parentB} -> ${row.child}`,
	);
	printRows(
		`Pair count problems`,
		pairCountProblems,
		options.limit,
		row => `expected ${row.expected}, fetched ${row.actual}`,
	);
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
