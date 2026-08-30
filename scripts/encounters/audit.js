#!/usr/bin/env node

// Compares recommendation-critical combat facts to the newest installed-game snapshot.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { ENCOUNTERS, REVIEWED_BUILD_ID } = require(`../../utils/encounterRecommendations.js`);
const gameBossData = require(`../../data/gameBossData.json`);
const gameEncounterData = require(`../../data/gameEncounterData.json`);
const implantPassives = require(`../../data/implantPassives.json`);
const palData = require(`../../data/palData.json`);
const { resolvedItemData } = require(`../../utils/itemData.js`);

const ACTORS = {
	"auri-shaolong": [`GYM_BlueSkyDragon`, `GYM_BlueSkyDragon_2`],
	"axel-orserk": [`GYM_ThunderDragonMan`, `GYM_ThunderDragonMan_2`],
	bellanoir: [`RAID_NightLady`],
	"bellanoir-libero": [`RAID_NightLady_Dark`, `RAID_NightLady_Dark_2`],
	"bjorn-bastigor": [`GYM_SnowTigerBeastman`, `GYM_SnowTigerBeastman_2`],
	"blazamut-ryu": [`RAID_KingBahamut_Dragon`, `RAID_KingBahamut_Dragon_2`],
	hartalis: [`RAID_LegendDeer`, `RAID_LegendDeer_2`],
	"lily-lyleen": [`GYM_LilyQueen`, `GYM_LilyQueen_2`],
	"marcus-faleris": [`GYM_Horus`, `GYM_Horus_2`],
	"moon-lord": [`RAID_YakushimaBoss002`, `RAID_YakushimaBoss002_2`],
	panthalus: [`BOSS_KingWhale`],
	"saya-selyne": [`GYM_MoonQueen`, `GYM_MoonQueen_2`],
	"victor-shadowbeak": [`GYM_BlackGriffon`, `GYM_BlackGriffon_2`],
	xenolord: [`RAID_DarkMechaDragon`, `RAID_DarkMechaDragon_2`],
	"zenara-astralym": [`GYM_WorldTreeDragon`, `GYM_WorldTreeDragon_2`],
	"zoe-grizzbolt": [`GYM_ElecPanda`, `GYM_ElecPanda_2`],
};
const RAID_REWARD_ROWS = {
	bellanoir: [`PalSummon_NightLady`],
	"bellanoir-libero": [`PalSummon_NightLady_Dark`, `PalSummon_NightLady_Dark_2`],
	"blazamut-ryu": [`PalSummon_KingBahamut_Dragon`, `PalSummon_KingBahamut_Dragon_2`],
	xenolord: [`PalSummon_DarkMechaDragon`, `PalSummon_DarkMechaDragon_2`],
	"moon-lord": [`PalSummon_YakushimaBoss002`, `PalSummon_YakushimaBoss002_2`],
	hartalis: [`PalSummon_LegendDeer`, `PalSummon_LegendDeer_2`],
};
const TOWER_BOSS_TYPES = {
	panthalus: `KingWhaleBoss`,
	"auri-shaolong": `SorajimaBoss`, "axel-orserk": `ElectricBoss`, "bjorn-bastigor": `VikingBoss`,
	"lily-lyleen": `ForestBoss`, "marcus-faleris": `DesertBoss`, "saya-selyne": `SakurajimaBoss`,
	"victor-shadowbeak": `SnowBoss`, "zenara-astralym": `WorldTreeBoss`, "zoe-grizzbolt": `GrassBoss`,
};

function latestSnapshot() {
	const directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`);
	return fs.readdirSync(directory).filter(name => /^items-.+\.json$/u.test(name))
		.map(name => path.join(directory, name))
		.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

function cleanElement(value) {
	return String(value || ``).replace(`EPalElementType::`, ``)
		.replace(`Leaf`, `Grass`).replace(`Electricity`, `Electric`).replace(`Normal`, `Neutral`);
}

function expectedElements(row) {
	return [row.ElementType1, row.ElementType2].map(cleanElement).filter(value => value && value !== `None`);
}

// The comparison context stays explicit because audit failures must name both the encounter and difficulty.
// eslint-disable-next-line max-params
function compareVariant(encounter, difficulty, variant, row, problems) {
	for (const [field, actual] of [
		[`baseHp`, row.Hp],
		[`hpScale`, row.EnemyMaxHPRate],
		[`receiveDamage`, row.EnemyReceiveDamageRate],
		[`inflictDamage`, row.EnemyInflictDamageRate],
	]) {
		if (variant[field] !== actual) {
			problems.push(`${encounter.name} ${difficulty}: ${field} ${variant[field]} != ${actual}.`);
		}
	}
	const recordedElements = variant.elements.filter(value => !/phase|None/iu.test(value)).sort();
	const gameElements = expectedElements(row).sort();
	if (JSON.stringify(recordedElements) !== JSON.stringify(gameElements)) {
		problems.push(`${encounter.name} ${difficulty}: elements ${recordedElements.join(`/`) || `None`} != ${gameElements.join(`/`) || `None`}.`);
	}
}

function compareTowerDefaults(encounter, difficulty, variant, problems) {
	const bossType = TOWER_BOSS_TYPES[encounter.id];
	if (!bossType) {
		return;
	}
	const boss = gameBossData.bosses.find(entry => entry.key === `EPalBossType::${bossType}`)?.value;
	const source = boss?.DifficultyParameter?.find(entry => entry.key.endsWith(`::${difficulty === `hard` ? `Hard` : `Normal`}`))?.value;
	if (!source) {
		problems.push(`${encounter.name} ${difficulty}: missing decoded boss-manager defaults.`);
		return;
	}
	if (variant.level !== source.Level) {
		problems.push(`${encounter.name} ${difficulty}: level ${variant.level} != ${source.Level}.`);
	}
	if (variant.battleTimeLimit !== source.BattleTimeLimit) {
		problems.push(`${encounter.name} ${difficulty}: battle limit ${variant.battleTimeLimit} != ${source.BattleTimeLimit}.`);
	}
	const expectedRewards = [
		...(source.SuccessItemList || []),
		...(difficulty === `normal` ? boss.OneTimeRewards || [] : []).map(item => ({
			ItemName: item, Rate: 100, Min: 1, Max: 1, firstClear: true,
		})),
	];
	if (JSON.stringify(variant.gameRewards || []) !== JSON.stringify(expectedRewards)) {
		problems.push(`${encounter.name} ${difficulty}: completion rewards differ from boss-manager defaults.`);
	}
}

// Reward publication spans fixed, one-of, item-catalog, and egg records that must be reported independently.
// eslint-disable-next-line complexity
function compareRaidRewards(context, rewardRow) {
	const { encounter, difficulty, problems, variant } = context;
	if (!rewardRow) {
		problems.push(`${encounter.name} ${difficulty}: missing raid reward row.`);
		return;
	}
	const gameLevel = rewardRow.InfoList?.[0]?.Level;
	if (variant.level !== gameLevel) {
		problems.push(`${encounter.name} ${difficulty}: level ${variant.level} != raid table level ${gameLevel}.`);
	}
	const info = rewardRow.InfoList?.[0] || {};
	const expectedPhaseElements = info.CanModeChange ?
		[info.ModeChange_Element1, info.ModeChange_Element2].map(cleanElement)
			.filter(value => value && value !== `None`).map(value => `${value} phase`).sort() :
		[];
	const displayedPhaseElements = variant.elements.filter(value => value.endsWith(` phase`)).sort();
	if (JSON.stringify(displayedPhaseElements) !== JSON.stringify(expectedPhaseElements)) {
		problems.push(`${encounter.name} ${difficulty}: phase elements ${displayedPhaseElements.join(`/`) || `None`} != ${expectedPhaseElements.join(`/`) || `None`}.`);
	}
	const oneOfRate = rewardRow.SuccessAnyOneItemList?.length ? 100 / rewardRow.SuccessAnyOneItemList.length : 0;
	const expectedRewards = [
		...(rewardRow.SuccessItemList || []),
		...(rewardRow.SuccessAnyOneItemList || []).map(item => ({
			ItemName: item.ItemName, Rate: oneOfRate, Min: item.Num, Max: item.Num, oneOf: true,
		})),
	];
	if (JSON.stringify(variant.gameRewards || []) !== JSON.stringify(expectedRewards)) {
		problems.push(`${encounter.name} ${difficulty}: displayed rewards differ from the raid table.`);
	}
	const expectedEggs = (rewardRow.EggPalIDAndWeight || []).map(entry => ({
		alpha: String(entry.Key?.Key || ``).startsWith(`BOSS_`), probability: entry.Value * 100,
	}));
	const displayedEggs = (variant.gameEggRewards || []).map(entry => ({ alpha: entry.alpha, probability: entry.probability }));
	if (JSON.stringify(displayedEggs) !== JSON.stringify(expectedEggs)) {
		problems.push(`${encounter.name} ${difficulty}: displayed egg probabilities differ from the raid table.`);
	}
	const itemsById = new Map(resolvedItemData().Items.map(item => [String(item.code || ``).split(`/`).at(-1).toLowerCase(), item]));
	const rewards = [
		...(rewardRow.SuccessItemList || []).map(reward => ({ ...reward, probability: `${reward.Rate}%` })),
		...(rewardRow.SuccessAnyOneItemList || []).map(reward => ({
			ItemName: reward.ItemName, Min: reward.Num, Max: reward.Num,
			probability: `${Number((100 / rewardRow.SuccessAnyOneItemList.length).toFixed(3))}%`,
		})),
	];
	for (const reward of rewards) {
		const item = itemsById.get(String(reward.ItemName?.Key || ``).toLowerCase());
		if (!item) {
			problems.push(`${encounter.name} ${difficulty}: reward ${reward.ItemName?.Key} has no catalog item name.`);
		}
	}
	const eggs = rewardRow.EggPalIDAndWeight || [];
	if (eggs.length !== (variant.gameEggRewards || []).length) {
		problems.push(`${encounter.name} ${difficulty}: egg reward presentation does not match the raid table.`);
	}
	if (eggs.length && eggs.map(entry => Number(entry.Value)).sort().join() !== `0.1,0.9`) {
		problems.push(`${encounter.name} ${difficulty}: expected 10% Alpha and 90% regular egg weights.`);
	}
}

function compareRecommendations(encounter, difficulty, variant, problems) {
	const pals = new Map(palData.Pals.map(pal => [pal.name, pal]));
	const validPassives = new Set(Object.values(implantPassives));
	for (const member of variant.party) {
		const pal = pals.get(member.pal);
		if (!pal) {
			problems.push(`${encounter.name} ${difficulty}: unknown recommended Pal ${member.pal}.`);
			continue;
		}
		const learnedMoves = new Set((pal.levelUpMoves || []).map(move => move.name));
		for (const move of member.moves || []) {
			if (!learnedMoves.has(move)) {
				problems.push(`${encounter.name} ${difficulty}: ${member.pal} does not learn ${move}.`);
			}
		}
		for (const passive of member.passives || []) {
			if (!validPassives.has(passive)) {
				problems.push(`${encounter.name} ${difficulty}: unknown passive ${passive}.`);
			}
		}
	}
}

// Each encounter is checked across independent combat, recommendation, map, and reward invariants.
// eslint-disable-next-line complexity
function audit(snapshot) {
	const problems = [];
	const table = snapshot.tables?._decodedTables?.[`Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter`] || {};
	const raidRewards = snapshot.tables?._decodedTables?.[`Pal/Content/Pal/Blueprint/RaidBoss/DT_PalRaidBoss`] || {};
	if (String(snapshot.buildId) !== REVIEWED_BUILD_ID) {
		problems.push(`Strategies were reviewed for build ${REVIEWED_BUILD_ID}; installed snapshot is ${snapshot.buildId}.`);
	}
	if (String(gameBossData.buildId) !== String(snapshot.buildId)) {
		problems.push(`Boss-manager data is build ${gameBossData.buildId}; installed snapshot is ${snapshot.buildId}.`);
	}
	if (gameBossData.gameSettings.characterMaxLevel !== 80 || gameBossData.gameSettings.hpLevelMultiplier !== 0.5 ||
		gameBossData.gameSettings.hpConstant !== 500) {
		problems.push(`Decoded game settings do not match the reviewed build's HP calculation inputs.`);
	}
	if (String(gameEncounterData.buildId) !== String(snapshot.buildId)) {
		problems.push(`Encounter source data is build ${gameEncounterData.buildId}; installed snapshot is ${snapshot.buildId}.`);
	}
	if (JSON.stringify(gameEncounterData.raids) !== JSON.stringify(raidRewards)) {
		problems.push(`Generated raid data differs from the installed-game snapshot.`);
	}
	for (const encounter of ENCOUNTERS) {
		if (encounter.map && !fs.existsSync(path.resolve(__dirname, `..`, `..`, encounter.map))) {
			problems.push(`${encounter.name}: missing map ${encounter.map}.`);
		}
		const actorIds = ACTORS[encounter.id] || [];
		for (const [index, difficulty] of [`normal`, `hard`].entries()) {
			const variant = encounter.variants[difficulty];
			if (!variant) {
				continue;
			}
			const actorId = actorIds[index];
			const row = table[actorId];
			if (!row) {
				problems.push(`${encounter.name} ${difficulty}: missing actor ${actorId || `(unmapped)`}.`);
				continue;
			}
			if (JSON.stringify(gameEncounterData.actors[actorId]) !== JSON.stringify(row)) {
				problems.push(`${encounter.name} ${difficulty}: generated actor ${actorId} differs from the installed-game snapshot.`);
			}
			compareVariant(encounter, difficulty, variant, row, problems);
			compareTowerDefaults(encounter, difficulty, variant, problems);
			compareRecommendations(encounter, difficulty, variant, problems);
			const rewardId = RAID_REWARD_ROWS[encounter.id]?.[index];
			if (rewardId) {
				compareRaidRewards({ encounter, difficulty, problems, variant }, raidRewards[rewardId]);
			}
		}
	}
	return problems;
}

function run() {
	const target = latestSnapshot();
	if (!target) {
		throw new Error(`No installed-game snapshot found; refresh the installed-game audit first.`);
	}
	const snapshot = JSON.parse(fs.readFileSync(target, `utf8`));
	const problems = audit(snapshot);
	console.log(`Encounter recommendation audit: build ${snapshot.buildId}, ${ENCOUNTERS.length} encounters, ${problems.length} problem(s).`);
	for (const problem of problems) {
		console.log(`- ${problem}`);
	}
	if (problems.length) {
		process.exitCode = 1;
	}
}

if (require.main === module) {
	run();
}

module.exports = { audit };
