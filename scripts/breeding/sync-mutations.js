#!/usr/bin/env node

// Derives readable mutation child pools from the installed-game breeding ranks stored in palData.
const fs = require(`node:fs`);
const path = require(`node:path`);
const { eligibleMutationChildren, mutationChildrenForParents } = require(`../../utils/palMutations.js`);

const PAL_DATA_PATH = path.join(__dirname, `..`, `..`, `data`, `palData.json`);

function synchronizeMutationChildren(palFile) {
	const candidates = eligibleMutationChildren(palFile.Pals);
	for (const pal of palFile.Pals) {
		pal.breeding.mutatedChildren = mutationChildrenForParents(
			pal.breeding?.rank,
			pal.breeding?.rank,
			candidates,
		);
	}
	return palFile;
}

const palFile = JSON.parse(fs.readFileSync(PAL_DATA_PATH, `utf8`));
const synchronized = synchronizeMutationChildren(palFile);
const changed = `${JSON.stringify(synchronized, null, `\t`)}\n` !== fs.readFileSync(PAL_DATA_PATH, `utf8`);

if (process.argv.includes(`--write`)) {
	fs.writeFileSync(PAL_DATA_PATH, `${JSON.stringify(synchronized, null, `\t`)}\n`);
}

const hartalis = synchronized.Pals.find(pal => pal.name === `Hartalis`);
const whalaska = synchronized.Pals.find(pal => pal.name === `Whalaska`);
const aegidron = synchronized.Pals.find(pal => pal.name === `Aegidron`);
const ophydia = synchronized.Pals.find(pal => pal.name === `Ophydia`);
console.log(`${process.argv.includes(`--write`) ? `Updated` : `Checked`} mutation children for ${synchronized.Pals.length} Pals.`);
console.log(`Hartalis: ${hartalis?.breeding?.mutatedChildren?.join(`, `) || `(none)`}`);
console.log(`Whalaska: ${whalaska?.breeding?.mutatedChildren?.join(`, `) || `(none)`}`);
console.log(`Aegidron: ${aegidron?.breeding?.mutatedChildren?.join(`, `) || `(none)`}`);
console.log(`Ophydia: ${ophydia?.breeding?.mutatedChildren?.join(`, `) || `(none)`}`);
if (!process.argv.includes(`--write`) && changed) {
	console.log(`palData.json requires synchronization; rerun with --write.`);
	process.exitCode = 1;
}

module.exports = { synchronizeMutationChildren };
