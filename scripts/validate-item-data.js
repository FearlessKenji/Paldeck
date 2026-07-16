const fs = require(`node:fs`);
const path = require(`node:path`);
const itemFile = require(`../data/itemData.json`);

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
	`url`,
	`source`,
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

	if (!Array.isArray(itemData.Sources) || !itemData.Sources.length) {
		problems.push(`Sources must be a non-empty array.`);
	}

	if (!Array.isArray(itemData.Items) || !itemData.Items.length) {
		problems.push(`Items must be a non-empty array.`);
		return problems;
	}

	for (const [index, item] of itemData.Items.entries()) {
		for (const field of REQUIRED_FIELDS) {
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

		if (item.iconUrl && path.extname(item.iconUrl).toLowerCase() !== `.png`) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl must point to a PNG file.`);
		}

		const iconPath = path.resolve(PROJECT_ROOT, item.iconUrl || ``);
		const relativeIconPath = path.relative(PROJECT_ROOT, iconPath);

		if (relativeIconPath.startsWith(`..`) || path.isAbsolute(relativeIconPath)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: iconUrl escapes project root.`);
		} else if (!fs.existsSync(iconPath)) {
			problems.push(`Item ${index} ${item.name || `(unnamed)`}: icon file does not exist at ${item.iconUrl}.`);
		}
	}

	for (const field of [`id`, `code`]) {
		problems.push(...findDuplicateValues(itemData.Items, field));
	}

	for (const source of itemData.Sources || []) {
		const actualCount = itemData.Items.filter(item => item.source === source.slug).length;

		if (actualCount !== source.count) {
			problems.push(`Source ${source.slug}: expected ${source.count} item(s), found ${actualCount}.`);
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
