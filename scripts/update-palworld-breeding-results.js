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

const ROOT_DIR = path.resolve(__dirname, `..`);
const PAL_BREEDING_PATH = path.join(ROOT_DIR, `data`, `palBreeding.json`);

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

function decodeHtml(value) {
	return String(value || ``)
		.replace(/&amp;/g, `&`)
		.replace(/&quot;/g, `"`)
		.replace(/&#039;/g, `'`)
		.replace(/&lt;/g, `<`)
		.replace(/&gt;/g, `>`);
}

function stripTags(value) {
	return decodeHtml(String(value || ``).replace(/<[^>]+>/g, ``)).trim();
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

	return parseItemNames(await response.text())[2] || ``;
}

function sortPairResults(pairResults, currentIndexByName) {
	return pairResults.sort((first, second) => {
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

function createPalRow(current) {
	return {
		name: current.name,
		number: current.number,
		breedingId: current.breedingId,
		breedingRank: null,
		canBeParent: false,
		canBeChild: false,
		canBeStandardChild: false,
	};
}

function mergeBreedingPals(breedingFile, currentRows, pairResults) {
	const existingByName = mapByName(breedingFile.Pals);
	const parentNames = new Set();
	const childNames = new Set();
	const added = [];
	const pals = breedingFile.Pals.map(pal => ({ ...pal }));

	for (const [parentA, parentB, child] of pairResults) {
		parentNames.add(normalizeKey(parentA));
		parentNames.add(normalizeKey(parentB));
		childNames.add(normalizeKey(child));
	}

	for (const current of currentRows) {
		if (existingByName.has(normalizeKey(current.name))) {
			continue;
		}

		const row = createPalRow(current);

		added.push(row);
		pals.push(row);
		existingByName.set(normalizeKey(row.name), row);
	}

	for (const pal of pals) {
		const current = currentRows.find(row => normalizeKey(row.name) === normalizeKey(pal.name));

		if (current) {
			pal.number = current.number;
			pal.breedingId = current.breedingId;
		}

		pal.canBeParent = parentNames.has(normalizeKey(pal.name));
		pal.canBeChild = childNames.has(normalizeKey(pal.name));
	}

	return {
		added,
		pals,
	};
}

async function resolveConflicts(conflicts, currentByName, pairResultsByKey) {
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

		const childName = await fetchChildForParentPair(parentA, parentB);
		const child = currentByName.get(normalizeKey(childName));

		if (!child) {
			unresolved.push({
				...conflict,
				reason: `Pair endpoint returned unknown child ${childName || `(blank)`}`,
			});
			continue;
		}

		const resolvedResult = [parentA.name, parentB.name, child.name];

		pairResultsByKey.set(pairKey(parentA.name, parentB.name), resolvedResult);
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
	const { currentRows } = await fetchPaldbData();
	const currentByName = mapByName(currentRows);
	const currentIndexByName = new Map(currentRows.map((row, index) => [normalizeKey(row.name), index]));
	const children = currentRows.filter(row => row.breedingCode);
	const fetched = await mapWithConcurrency(
		children,
		options.concurrency,
		child => fetchParentPairsForChild(child),
	);
	const pairResultsByKey = new Map();
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
			const existing = pairResultsByKey.get(key);

			if (existing && normalizeKey(existing[2]) !== normalizeKey(child.name)) {
				conflicts.push({
					existing,
					next: [parentA.name, parentB.name, child.name],
				});
				continue;
			}

			pairResultsByKey.set(key, [parentA.name, parentB.name, child.name]);
		}
	}

	const resolvedConflicts = await resolveConflicts(conflicts, currentByName, pairResultsByKey);
	const pairResults = sortPairResults([...pairResultsByKey.values()], currentIndexByName);
	const merged = mergeBreedingPals(breedingFile, currentRows, pairResults);
	const nextBreedingFile = {
		...breedingFile,
		Pals: merged.pals,
		PairResults: pairResults,
		PairResultsMetadata: {
			pairs: pairResults.length,
			retrievedAt: new Date().toISOString().slice(0, 10),
			source: PALDB_BREED_CHILD_URL,
		},
	};

	if (options.write) {
		if (resolvedConflicts.unresolved.length || parseProblems.length || unknownRows.length) {
			throw new Error(`Refusing to write PairResults with conflicts, parse problems, or unknown Pal rows.`);
		}

		writeJson(PAL_BREEDING_PATH, nextBreedingFile);
	}

	console.log(`Palworld breeding pair-result update against PalDB (${options.write ? `write` : `dry-run`})`);
	console.log(`Current PalDB rows: ${currentRows.length}`);
	console.log(`Child endpoints fetched: ${children.length}`);
	console.log(`Pair results: ${pairResults.length}`);
	console.log(`New breeding rows: ${merged.added.length}`);
	console.log(`Files ${options.write ? `updated` : `not written`}.`);

	printRows(`Added breeding rows`, merged.added, options.limit, row => `#${row.number} ${row.name}`);
	printRows(
		`Pair result sample`,
		pairResults,
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
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
