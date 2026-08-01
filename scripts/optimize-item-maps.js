// Losslessly optimizes PNG item maps and replaces byte-identical assets with shared files.
/* eslint-disable max-statements-per-line -- compact recursive guards keep the data walk easy to follow. */
const crypto = require(`node:crypto`);
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);

const ROOT = path.resolve(__dirname, `..`);
const MAP_DIRECTORY = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `item-maps`);
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);

function replacePaths(value, replacements) {
	if (Array.isArray(value)) {return value.map(child => replacePaths(child, replacements));}
	if (value && typeof value === `object`) {
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replacePaths(child, replacements)]));
	}
	return replacements.get(value) || value;
}

async function optimizePng(file) {
	const original = fs.readFileSync(file);
	const optimized = await sharp(original).png({ compressionLevel: 9 }).toBuffer();
	if (optimized.length < original.length) {
		fs.writeFileSync(file, optimized);
		return original.length - optimized.length;
	}
	return 0;
}

function deduplicate(files) {
	const canonicalByHash = new Map();
	const replacements = new Map();
	for (const file of files) {
		const hash = crypto.createHash(`sha256`).update(fs.readFileSync(file)).digest(`hex`);
		const canonical = canonicalByHash.get(hash);
		if (canonical) {
			replacements.set(path.relative(ROOT, file).replaceAll(`\\`, `/`), path.relative(ROOT, canonical).replaceAll(`\\`, `/`));
		} else {
			canonicalByHash.set(hash, file);
		}
	}
	if (replacements.size) {
		const data = replacePaths(JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`)), replacements);
		const temporary = path.join(os.tmpdir(), `paldeck-item-data-${process.pid}.json`);
		fs.writeFileSync(temporary, `${JSON.stringify(data, null, `\t`)}\n`);
		fs.copyFileSync(temporary, ITEM_DATA_PATH);
		fs.rmSync(temporary);
		for (const duplicate of replacements.keys()) {
			const target = process.env.PALDECK_MAP_OUTPUT_DIR ? path.join(MAP_DIRECTORY, path.basename(duplicate)) : path.join(ROOT, duplicate);
			fs.rmSync(target);
		}
	}
	return replacements.size;
}

async function main() {
	const files = fs.readdirSync(MAP_DIRECTORY).filter(file => file.endsWith(`.png`)).sort()
		.map(file => path.join(MAP_DIRECTORY, file));
	let saved = 0;
	for (const file of files) {saved += await optimizePng(file);}
	const removed = deduplicate(files.filter(fs.existsSync));
	console.log(`Saved ${(saved / 1024 / 1024).toFixed(2)} MiB and removed ${removed} duplicate PNG map(s).`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
