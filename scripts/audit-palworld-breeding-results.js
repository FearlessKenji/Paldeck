const breedingFile = require(`../data/palBreeding.json`);
const palFile = require(`../data/palData.json`);
const { URL } = require(`node:url`);
const { createBreedingCalculator } = require(`../utils/palBreeding.js`);
const {
	PALDB_BREED_PAIR_URL,
	fetchPaldbData,
	mapByName,
	normalizeKey,
} = require(`./lib/paldb-data.js`);
const { stripTags } = require(`./lib/html-text.js`);

function parseArgs(argv) {
	const options = {
		failOnMismatch: false,
		full: false,
		limit: 25,
		sample: 100,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--full`) {
			options.full = true;
			continue;
		}

		if (arg === `--fail-on-mismatch`) {
			options.failOnMismatch = true;
			continue;
		}

		if (arg === `--sample`) {
			const value = Number.parseInt(argv[index + 1], 10);

			if (Number.isInteger(value) && value > 0) {
				options.sample = value;
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

function buildParentPairs(parentPals) {
	const pairs = [];

	for (let firstIndex = 0; firstIndex < parentPals.length; firstIndex += 1) {
		for (let secondIndex = firstIndex; secondIndex < parentPals.length; secondIndex += 1) {
			pairs.push([parentPals[firstIndex], parentPals[secondIndex]]);
		}
	}

	return pairs;
}

function resultChildNames(result) {
	return (result.children || [{ child: result.child }])
		.map(entry => entry.child?.name || ``)
		.filter(Boolean);
}

function samplePairs(pairs, options) {
	if (options.full || pairs.length <= options.sample) {
		return pairs;
	}

	const selected = [];
	const used = new Set();
	const step = pairs.length / options.sample;

	for (let index = 0; selected.length < options.sample; index += 1) {
		const pairIndex = Math.min(pairs.length - 1, Math.floor(index * step));

		if (used.has(pairIndex)) {
			continue;
		}

		used.add(pairIndex);
		selected.push(pairs[pairIndex]);
	}

	return selected;
}

async function fetchPaldbChild(parentA, parentB) {
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
	const calculator = createBreedingCalculator(palFile, breedingFile);
	const { currentRows } = await fetchPaldbData();
	const currentByName = mapByName(currentRows);
	const parentPals = calculator.parentPals.map(pal => ({
		...pal,
		breedingCode: currentByName.get(normalizeKey(pal.name))?.breedingCode || ``,
	}));
	const allPairs = buildParentPairs(parentPals);
	const pairsToCheck = samplePairs(allPairs, options);
	const mismatches = [];
	const skipped = [];
	const seenPairs = new Set();

	for (const [parentA, parentB] of pairsToCheck) {
		const key = pairKey(parentA.name, parentB.name);

		if (seenPairs.has(key)) {
			continue;
		}

		seenPairs.add(key);

		if (!parentA.breedingCode || !parentB.breedingCode) {
			skipped.push({
				parentA: parentA.name,
				parentB: parentB.name,
				reason: `Missing PalDB breeding code`,
			});
			continue;
		}

		const localChildren = resultChildNames(calculator.calculateChild(parentA.name, parentB.name));
		const paldbResult = await fetchPaldbChild(parentA, parentB);

		if (!pairResponseMatchesParents(paldbResult.itemNames, parentA, parentB)) {
			skipped.push({
				parentA: parentA.name,
				parentB: parentB.name,
				reason: `PalDB pair endpoint returned parent echo ${paldbResult.itemNames.slice(0, 2).join(` + `) || `(blank)`}`,
			});
			continue;
		}

		const paldbChild = paldbResult.childName;

		if (!localChildren.some(child => normalizeKey(child) === normalizeKey(paldbChild))) {
			mismatches.push({
				localChild: localChildren.join(`, `),
				paldbChild,
				parentA: parentA.name,
				parentB: parentB.name,
			});
		}
	}

	console.log(`Palworld breeding result audit against PalDB`);
	console.log(`Local parent Pals: ${parentPals.length}`);
	console.log(`Total local parent pairs: ${allPairs.length}`);
	console.log(`Pairs checked: ${seenPairs.size}`);
	console.log(`Mode: ${options.full ? `full` : `sample ${options.sample}`}`);
	console.log(`Source: ${PALDB_BREED_PAIR_URL}`);

	printRows(
		`Mismatched breeding results`,
		mismatches,
		options.limit,
		row => `${row.parentA} + ${row.parentB}: local ${row.localChild || `(blank)`} -> PalDB ${row.paldbChild || `(blank)`}`,
	);
	printRows(
		`Skipped pairs`,
		skipped,
		options.limit,
		row => `${row.parentA} + ${row.parentB}: ${row.reason}`,
	);

	if (options.failOnMismatch && mismatches.length) {
		process.exit(1);
	}
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
