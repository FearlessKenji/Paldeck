const fs = require(`node:fs`);
const path = require(`node:path`);
const implantPassives = require(`../../data/implantPassives.json`);
const palData = require(`../../data/palData.json`);
const { createBreedingCalculator } = require(`../../utils/palBreeding.js`);
const palBreeding = require(`../../data/palBreeding.json`);
const { buildPayload, encounterChoices } = require(`../../utils/encounterCommand.js`);
const {
	completionRewards, derivedEncounterHp, encountersFor, ENCOUNTERS, findEncounter, ROOT_DIR,
} = require(`../../utils/encounterRecommendations.js`);

function validatePartyHeadings(assert, party, fields) {
	// Assert visible headings independently of the role metadata so generic labels cannot return unnoticed.
	for (const member of party) {
		const role = member.strategy ? (member.pal === `Felbat` ? `Active sustain` : `Party support`) : null;
		const expectedName = role ? `${member.pal} — ${role}` : member.pal;
		assert(fields.some(field => field.name === expectedName), `Expected Pal heading: ${expectedName}`);
	}
}

function validateStrategyField(assert, encounter, difficulty, fields) {
	const strategy = fields?.find(field => field.name === `Strategy`);
	const usesPalboxArmy = encounter.kind === `raid` || (encounter.kind === `tower-raid` && difficulty === `hard`);
	assert(strategy?.value.startsWith(`• Food:`), `${encounter.name} ${difficulty} strategy must put food first.`);
	assert(strategy?.value.includes(`Base research:`) === usesPalboxArmy,
		`${encounter.name} ${difficulty} must show research advice only when a Palbox army participates.`);
	assert(!strategy?.value.includes(`Boost Gun`), `${encounter.name} ${difficulty} must not recommend Boost Guns.`);
	assert(!fields?.some(field => [`Flexible Raid Team`, `Recommendation Basis`, `Encounter Notes`].includes(field.name)),
		`${encounter.name} ${difficulty} must consolidate advice under Strategy.`);
}

function validateRenderedRecommendation(assert, encounter, difficulty, variant) {
	const command = encounter.kind === `raid` ? `raid` : `tower`;
	const payload = buildPayload(command, difficulty, encounter);
	const embeds = payload.embeds.map(embed => embed.toJSON());
	if (encounter.kind !== `raid`) {
		validatePartyHeadings(assert, variant.party, embeds[0].fields);
	}
	const difficultyLabel = variant.difficultyLabel || (difficulty === `hard` ? `Hard` : `Normal`);
	assert(embeds[0].title === `${encounter.name} — ${difficultyLabel}`,
		`${encounter.name} ${difficulty} must show its actual difficulty name.`);
	const readiness = embeds[0].fields?.find(field => field.name === `Readiness`);
	validateStrategyField(assert, encounter, difficulty, embeds[0].fields);
	assert(!readiness?.value.includes(`Outgoing damage`),
		`${encounter.name} ${difficulty} must not expose an outgoing-damage factor without final-damage context.`);
	assert(!readiness?.value.includes(`health stat`),
		`${encounter.name} ${difficulty} must not expose the internal base-health calculation input.`);
	const expectedRewards = completionRewards(encounter, variant).map(reward => `• ${reward}`).join(`\n`).slice(0, 4096);
	const rewardEmbed = embeds.find(embed => embed.title === `Completion Rewards`);
	assert(rewardEmbed?.description === expectedRewards,
		`${encounter.name} ${difficulty} must render its complete authoritative reward list.`);
	if (payload.files.length) {
		assert(embeds.at(-1).title === `Completion Rewards`,
			`${encounter.name} ${difficulty} must display recommendation data, then its map, then rewards.`);
	}
	for (const embed of embeds) {
		for (const field of embed.fields || []) {
			assert(field.value.length <= 1024, `${encounter.name} ${difficulty} field ${field.name} exceeds Discord's limit.`);
		}
	}
}

function validateCounterCoverage(assert) {
	const saya = findEncounter(`tower`, `normal`, `saya-selyne`);
	assert(saya.variants.normal.counterProfiles.join() === `dragon,dark`, `Saya's dual typing should have Dragon and Dark counter examples.`);
	const hartalis = findEncounter(`raid`, `normal`, `hartalis`);
	assert(hartalis.variants.normal.counterProfiles.join() === `electric,fire`, `Normal Hartalis counters must follow its decoded Water/Grass typing.`);
	assert(hartalis.variants.hard.teamGuidance.some(line => line.startsWith(`Community reports:`) && line.includes(`Dark attackers`)),
		`Hartalis Ultra must label its reported Dark-phase advice as community guidance.`);
	assert(hartalis.variants.hard.teamGuidance.every(line => !line.includes(`outgoing damage`)),
		`Raid guidance must not expose an outgoing-damage factor without final-damage context.`);
}

function validateAstralymCommandParity(assert) {
	const towerPayload = buildPayload(`tower`, `hard`, findEncounter(`tower`, `hard`, `Astralym`));
	const raidPayload = buildPayload(`raid`, `hard`, findEncounter(`raid`, `hard`, `Astralym`));
	assert(JSON.stringify(towerPayload.embeds.map(embed => embed.toJSON())) ===
		JSON.stringify(raidPayload.embeds.map(embed => embed.toJSON())) &&
		towerPayload.files[0]?.name === raidPayload.files[0]?.name,
	`Astralym Hard must produce the same recommendation, map, and rewards through /tower and /raid.`);
}

function validateEncounterAutocomplete(assert) {
	const raidChoices = encounterChoices(`raid`, `hard`);
	assert(raidChoices.every(choice => !/^Raid\s+[-—]/u.test(choice.name)),
		`Raid autocomplete choices must not repeat a generic Raid prefix.`);
	assert(raidChoices.some(choice => choice.name === `Zenara & Astralym`),
		`Hard raid autocomplete must expose Astralym with the same plain boss name as other raids.`);
}

// This catalog smoke intentionally verifies each user-facing encounter invariant in one pass.
// eslint-disable-next-line complexity, max-statements
function validateEncounterCommands(assert) {
	const pals = new Map(palData.Pals.map(pal => [pal.name, pal]));
	const moveNames = new Set(palData.Pals.flatMap(pal => (pal.levelUpMoves || []).map(move => move.name)));
	const passiveNames = new Set(Object.values(implantPassives));
	const ids = new Set();
	validateEncounterAutocomplete(assert);
	for (const encounter of ENCOUNTERS) {
		assert(!ids.has(encounter.id), `Duplicate encounter recommendation ID: ${encounter.id}`);
		ids.add(encounter.id);
		if (encounter.map) {
			assert(encounter.map.startsWith(`data/encounter-maps/`), `${encounter.name} must use a dedicated encounter map.`);
			assert(fs.existsSync(path.resolve(ROOT_DIR, encounter.map)), `${encounter.name} map is missing.`);
		}
		for (const [difficulty, variant] of Object.entries(encounter.variants)) {
			assert(variant.level > 0 && variant.baseHp > 0 && variant.hpScale > 0 && variant.receiveDamage > 0 && variant.inflictDamage > 0,
				`${encounter.name} ${difficulty} readiness factors must be positive.`);
			const expectedPartySize = encounter.kind === `raid` && difficulty === `normal` ? 3 : 5;
			assert(variant.party.length === expectedPartySize, `${encounter.name} ${difficulty} should publish the intended number of examples.`);
			for (const member of variant.party) {
				assert(pals.has(member.pal), `${encounter.name} recommends unknown Pal ${member.pal}.`);
				assert(member.passives?.length === 4, `${encounter.name} ${difficulty} must recommend four passives for ${member.pal}.`);
				for (const move of member.moves || []) {
					assert(moveNames.has(move), `${encounter.name} recommends unknown move ${move}.`);
				}
				for (const passive of member.passives || []) {
					assert(passiveNames.has(passive), `${encounter.name} recommends unknown passive ${passive}.`);
				}
			}
			if (encounter.kind === `raid`) {
				assert(variant.teamGuidance?.length >= 3, `${encounter.name} ${difficulty} needs flexible team guidance.`);
				assert(!variant.raidComposition, `${encounter.name} ${difficulty} must not prescribe a fixed Palbox army.`);
				if (difficulty === `hard`) {
					assert(variant.teamGuidance.some(line => line.startsWith(`Game-data rationale:`)), `${encounter.name} ${difficulty} needs game-data deployment rationale.`);
					assert(variant.teamGuidance.some(line => line.startsWith(`Community reports:`)), `${encounter.name} ${difficulty} must label secondhand strategy advice.`);
					assert(variant.strategySources?.every(source => /^https:\/\//u.test(source.url)), `${encounter.name} ${difficulty} needs reviewable community sources.`);
				}
			}
			if ([`tower`, `story`].includes(encounter.kind) || (encounter.kind === `tower-raid` && difficulty === `normal`)) {
				assert(variant.teamGuidance?.length >= 3, `${encounter.name} ${difficulty} needs interchangeable team guidance.`);
			}
			if (encounter.kind === `tower-raid` && difficulty === `hard`) {
				assert(variant.raidComposition?.some(line => line.startsWith(`Deployment:`)), `${encounter.name} ${difficulty} needs a deployment pattern.`);
				assert(variant.raidComposition?.some(line => line.startsWith(`Army:`)), `${encounter.name} ${difficulty} needs a named Palbox army.`);
				assert(variant.raidComposition?.some(line => line.startsWith(`Passives`)), `${encounter.name} ${difficulty} needs army passives.`);
				assert(variant.strategySources?.length >= 1, `${encounter.name} ${difficulty} needs community-strategy provenance.`);
			}
			validateRenderedRecommendation(assert, encounter, difficulty, variant);
		}
	}
	const normalTowerLevels = encountersFor(`tower`, `normal`).filter(encounter => encounter.kind === `tower`)
		.map(encounter => encounter.variants.normal.level);
	assert(normalTowerLevels.join() === `10,20,30,40,50,55,60,68`, `Normal tower levels must match the current progression ladder.`);
	const hardTowerLevels = encountersFor(`tower`, `hard`).map(encounter => encounter.variants.hard.level);
	assert(hardTowerLevels.join() === `72,74,76,78,80,80,80,80,100`, `Hard tower levels must match the installed boss manager.`);
	const normalRaidLevels = encountersFor(`raid`, `normal`).map(encounter => encounter.variants.normal.level);
	assert(normalRaidLevels.join() === `35,45,55,65,50,70`, `Normal raid levels must match the installed altar encounters.`);
	const hardRaidLevels = encountersFor(`raid`, `hard`).map(encounter => encounter.variants.hard.level);
	assert(hardRaidLevels.join() === `100,80,80,80,80,80`, `Hard and Ultra raid levels must match the installed encounters.`);
	assert(encountersFor(`tower`, `normal`).length === 10, `Normal tower lookup should include eight towers, Panthalus, and Astralym.`);
	assert(encountersFor(`tower`, `hard`).length === 9, `Hard tower lookup should include eight towers and Astralym.`);
	assert(encountersFor(`raid`, `normal`).length === 6, `Normal raid lookup should include six Summoning Altar encounters.`);
	assert(encountersFor(`raid`, `hard`).length === 6, `Hard raid lookup should include five upgraded raids and Astralym.`);
	assert(findEncounter(`tower`, `normal`, `PIDF`)?.id === `marcus-faleris`);
	assert(findEncounter(`tower`, `normal`, `Panthalus`)?.kind === `story`);
	assert(!findEncounter(`tower`, `hard`, `Panthalus`));
	assert(findEncounter(`raid`, `hard`, `Astralym`)?.id === `zenara-astralym`);
	validateAstralymCommandParity(assert);
	const zoe = findEncounter(`tower`, `normal`, `zoe-grizzbolt`);
	assert(derivedEncounterHp(zoe.variants.normal) === 12900, `Zoe's HP should be derived from her level, health stat, and encounter multiplier.`);
	assert(zoe.variants.normal.party.every(member => ![`Legend`, `Diamond Body`, `Immortality`].some(passive => member.passives.includes(passive))),
		`Early tower recommendations should not require legendary or implant-only passives.`);
	assert(completionRewards(zoe, zoe.variants.normal).some(line => line.includes(`Key Sphere of Envy`) && line.includes(`100%`)));
	assert(completionRewards(zoe, zoe.variants.hard).some(line => line.includes(`Zoe Hat`) && line.includes(`100%`)));
	assert(completionRewards(zoe, zoe.variants.hard).some(line => line.includes(`Training Crystal`) && line.includes(`100%`)));
	const moonLord = findEncounter(`raid`, `normal`, `moon-lord`);
	assert(completionRewards(moonLord, moonLord.variants.normal).some(line => line.includes(`Legendary Meowmere`) && line.includes(`22%`)));
	validateCounterCoverage(assert);
	const bellanoir = findEncounter(`raid`, `normal`, `bellanoir`);
	assert(completionRewards(bellanoir, bellanoir.variants.normal).some(line => line.includes(`Dark Skill Fruit: Apocalypse`) && line.includes(`100%`)));
	assert(completionRewards(bellanoir, bellanoir.variants.normal).some(line => line === `Applied Ranching Handbook I ×1 — 33.333%`));
	assert(completionRewards(bellanoir, bellanoir.variants.normal).every(line => !line.includes(`(one of)`)));
	assert(completionRewards(bellanoir, bellanoir.variants.normal).includes(`Bellanoir Egg — 100% (10% Alpha)`));
	const astralym = findEncounter(`tower`, `normal`, `zenara-astralym`);
	assert(completionRewards(astralym, astralym.variants.normal).includes(`No item drops recorded in the installed boss manager.`));
	const astralymHard = findEncounter(`raid`, `hard`, `zenara-astralym`).variants.hard;
	assert(astralymHard.level === 100 && astralymHard.recommendedPlayerLevel === 80 && astralymHard.recommendedPalLevel === 80,
		`Hard Astralym is level 100, but its recommendations must respect the level-80 player and Pal cap.`);
	assert(derivedEncounterHp(astralymHard) === 5030099,
		`Astralym should use its verified one-player HP.`);
	assert(astralymHard.party.map(member => member.pal).join() === `Felbat,Gobfin,Gobfin Ignis,Solenne,Xenogard`,
		`Astralym's personal party should retain sustain and both Gobfins while identifying its energy-weapon support.`);
	assert(astralymHard.raidComposition.some(line => line.includes(`five Necromus at a time`)) &&
		astralymHard.raidComposition.some(line => line.includes(`Necromus ×15`)),
	`Astralym's Palbox composition should name the army and its five-Pal waves.`);
	assert(completionRewards(findEncounter(`raid`, `hard`, `zenara-astralym`), astralymHard)
		.some(line => line.includes(`Psycho Gravity`) && line.includes(`100%`)), `Astralym Hard should publish Psycho Gravity.`);
	assert(!completionRewards(findEncounter(`raid`, `hard`, `zenara-astralym`), astralymHard)
		.some(line => line.includes(`Training Crystal`)), `Astralym Hard must not invent a Training Crystal absent from its boss-manager rewards.`);
}

function validateExceptionalBreedingEligibility(assert) {
	const panthalus = palsByName(`Panthalus`);
	const astralym = palsByName(`Astralym`);
	assert(panthalus.breeding.canBeParent && !panthalus.breeding.canBeChild);
	assert(!astralym.breeding.canBeParent && !astralym.breeding.canBeChild);
	assert(astralym.drops === `None`, `Astralym must not publish unused ordinary-actor drops.`);
	const calculator = createBreedingCalculator(palData, palBreeding);
	assert(calculator.parentPals.some(pal => pal.name === `Panthalus`));
	assert(!calculator.childPals.some(pal => pal.name === `Panthalus`));
	assert(!calculator.parentPals.some(pal => pal.name === `Astralym`));
	assert(!calculator.childPals.some(pal => pal.name === `Astralym`));
	assert(calculator.findParentPairs(`Panthalus`) === null);
}

function palsByName(name) {
	return palData.Pals.find(pal => pal.name === name);
}

module.exports = { validateEncounterCommands, validateExceptionalBreedingEligibility };
