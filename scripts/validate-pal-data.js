const palFile = require(`../data/palData.json`);
const { findPalColorProblems } = require(`../utils/palColors.js`);

const colors = palFile.Colors?.[0] || {};
const colorProblems = findPalColorProblems(palFile.Pals, colors);

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
} else {
	console.log(`Pal data validation passed.`);
}
