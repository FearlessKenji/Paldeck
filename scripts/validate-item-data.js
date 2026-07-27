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
