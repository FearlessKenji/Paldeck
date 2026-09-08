const path = require(`node:path`);
const curatedEncounterStrategies = require(`../data/curatedEncounterStrategies.json`);
const gameBossData = require(`../data/gameBossData.json`);
const gameEncounterData = require(`../data/gameEncounterData.json`);
const palData = require(`../data/palData.json`);
const { resolvedItemData } = require(`./itemData.js`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const REVIEWED_BUILD_ID = `25094871`;
const GAME_MAX_LEVEL = gameBossData.gameSettings.characterMaxLevel;
const HP_LEVEL_MULTIPLIER = gameBossData.gameSettings.hpLevelMultiplier;
const HP_CONSTANT = gameBossData.gameSettings.hpConstant;
const HARD_OFFENSE = [`Legend`, `Musclehead`, `Serenity`, `Immortality`];
const NORMAL_OFFENSE = [`Musclehead`, `Ferocious`, `Serenity`, `Burly Body`];
const PLAYER_SUPPORT = [`Vanguard`, `Stronghold Strategist`, `Healing Coach`, `Reload Master`];
const items = resolvedItemData().Items;
const itemByGameId = new Map(items.map(item => [String(item.code || ``).split(`/`).at(-1), item]));
const palByGameId = new Map(palData.Pals.map(pal => [pal.breeding?.id, pal.name]));
const BOSS_TYPES = {
	panthalus: `KingWhaleBoss`,
	"auri-shaolong": `SorajimaBoss`, "axel-orserk": `ElectricBoss`, "bjorn-bastigor": `VikingBoss`,
	"lily-lyleen": `ForestBoss`, "marcus-faleris": `DesertBoss`, "saya-selyne": `SakurajimaBoss`,
	"victor-shadowbeak": `SnowBoss`, "zenara-astralym": `WorldTreeBoss`, "zoe-grizzbolt": `GrassBoss`,
};
const ENCOUNTER_MAPS = {
	panthalus: `data/encounter-maps/panthalus.png`,
	"auri-shaolong": `data/encounter-maps/auri-shaolong.png`, "axel-orserk": `data/encounter-maps/axel-orserk.png`,
	"bjorn-bastigor": `data/encounter-maps/bjorn-bastigor.png`, "lily-lyleen": `data/encounter-maps/lily-lyleen.png`,
	"marcus-faleris": `data/encounter-maps/marcus-faleris.png`, "saya-selyne": `data/encounter-maps/saya-selyne.png`,
	"victor-shadowbeak": `data/encounter-maps/victor-shadowbeak.png`, "zenara-astralym": `data/encounter-maps/zenara-astralym.png`,
	"zoe-grizzbolt": `data/encounter-maps/zoe-grizzbolt.png`,
};
const RAID_ROWS = {
	bellanoir: [`PalSummon_NightLady`],
	"bellanoir-libero": [`PalSummon_NightLady_Dark`, `PalSummon_NightLady_Dark_2`],
	"blazamut-ryu": [`PalSummon_KingBahamut_Dragon`, `PalSummon_KingBahamut_Dragon_2`],
	hartalis: [`PalSummon_LegendDeer`, `PalSummon_LegendDeer_2`],
	"moon-lord": [`PalSummon_YakushimaBoss002`, `PalSummon_YakushimaBoss002_2`],
	xenolord: [`PalSummon_DarkMechaDragon`, `PalSummon_DarkMechaDragon_2`],
};

function cleanElement(value) {
	return String(value || ``).replace(`EPalElementType::`, ``)
		.replace(`Leaf`, `Grass`).replace(`Electricity`, `Electric`).replace(`Normal`, `Neutral`);
}

function combatFacts(actorId) {
	const actor = gameEncounterData.actors[actorId];
	if (!actor) {
		throw new Error(`Missing decoded combat data for ${actorId}.`);
	}
	const elements = [actor.ElementType1, actor.ElementType2].map(cleanElement).filter(value => value && value !== `None`);
	return {
		baseHp: actor.Hp, hpScale: actor.EnemyMaxHPRate,
		receiveDamage: actor.EnemyReceiveDamageRate, inflictDamage: actor.EnemyInflictDamageRate,
		elements: elements.length ? elements : [`None`],
	};
}

function gameTowerVariant(id, difficulty) {
	const bossType = BOSS_TYPES[id];
	const boss = gameBossData.bosses.find(entry => entry.key === `EPalBossType::${bossType}`)?.value;
	const source = boss?.DifficultyParameter?.find(entry => entry.key === `EPalBossBattleDifficulty::${difficulty}`)?.value;
	if (!source) {
		throw new Error(`Missing decoded ${difficulty} boss data for ${id}.`);
	}
	return {
		...combatFacts(source.PalId.Key),
		level: source.Level,
		battleTimeLimit: source.BattleTimeLimit,
		gameRewards: [
			...(source.SuccessItemList || []),
			...(difficulty === `Normal` ? boss.OneTimeRewards || [] : []).map(item => ({
				ItemName: item, Rate: 100, Min: 1, Max: 1, firstClear: true,
			})),
		],
	};
}

function gameRaidVariant(id, index) {
	const rowId = RAID_ROWS[id]?.[index];
	const row = gameEncounterData.raids[rowId];
	const info = row?.InfoList?.[0];
	if (!info) {
		throw new Error(`Missing decoded raid data for ${id} variant ${index}.`);
	}
	const facts = combatFacts(info.PalId.Key);
	if (info.CanModeChange) {
		for (const value of [info.ModeChange_Element1, info.ModeChange_Element2].map(cleanElement)) {
			if (value && value !== `None` && !facts.elements.includes(value)) {
				facts.elements.push(`${value} phase`);
			}
		}
	}
	const oneOfRate = row.SuccessAnyOneItemList?.length ? 100 / row.SuccessAnyOneItemList.length : 0;
	const gameRewards = [
		...(row.SuccessItemList || []),
		...(row.SuccessAnyOneItemList || []).map(item => ({
			ItemName: item.ItemName, Rate: oneOfRate, Min: item.Num, Max: item.Num, oneOf: true,
		})),
	];
	const gameEggRewards = (row.EggPalIDAndWeight || []).map(entry => {
		const rawId = entry.Key?.Key || ``;
		const palId = rawId.replace(/^BOSS_/u, ``).toLowerCase();
		return { alpha: rawId.startsWith(`BOSS_`), name: palByGameId.get(palId) || rawId, probability: entry.Value * 100 };
	});
	return { ...facts, level: info.Level, gameEggRewards, gameRaidRow: rowId, gameRewards };
}

// Boss display levels can exceed the owned-Pal cap, but their HP stat calculation stops at that cap.
function derivedEncounterHp(variant) {
	if (variant.verifiedHp) {
		return variant.verifiedHp;
	}
	const statLevel = Math.min(variant.level, GAME_MAX_LEVEL);
	const baseHealth = HP_CONSTANT + (5 * statLevel) + (variant.baseHp * HP_LEVEL_MULTIPLIER * statLevel);
	return Math.floor(baseHealth * variant.hpScale);
}

const PARTY_PROFILES = {
	ground: [
		[`Knocklem`, [`Ground Cutter`, `Sand Twister`, `Rocky Impact`]],
		[`Anubis`, [`Ground Smash`, `Sand Twister`, `Rocky Impact`]],
		[`Warsect`, [`Rock Lance`, `Stone Cannon`, `Giga Horn`]],
		[`Digtoise`, [`Rocky Impact`, `Rock Lance`, `Sand Tornado`]],
		[`Menasting`, [`Rock Lance`, `Dark Whisp`, `Jumping Stinger`]],
	],
	fire: [
		[`Jormuntide Ignis`, [`Magma Serpent`, `Fire Ball`, `Ignis Breath`]],
		[`Blazamut`, [`Ignis Rage`, `Fire Ball`, `Brawn Impact`]],
		[`Faleris`, [`Phoenix Flare`, `Fire Ball`, `Raging Flame Wave`]],
		[`Suzaku`, [`Fire Ball`, `Flare Storm`, `Ignis Breath`]],
		[`Ragnahawk`, [`Fire Ball`, `Flare Storm`, `Rush Beak`]],
	],
	water: [
		[`Jormuntide`, [`Geyser Gush`, `Hydro Laser`, `Aqua Burst`]],
		[`Faleris Aqua`, [`Phoenix Tide`, `Geyser Gush`, `Hydro Laser`]],
		[`Azurobe`, [`Geyser Gush`, `Hydro Laser`, `Dragon Meteor`]],
		[`Suzaku Aqua`, [`Geyser Gush`, `Hydro Laser`, `Blizzard Spike`]],
		[`Broncherry Aqua`, [`Geyser Gush`, `Hydro Laser`, `Aqua Burst`]],
	],
	dragon: [
		[`Jetragon`, [`Beam Slicer`, `Meteorain`, `Star Mine`]],
		[`Xenolord`, [`Omega Laser`, `Cosmic Meteor`, `Meteorain`]],
		[`Astegon`, [`Dragon Meteor`, `Dark Whisp`, `Dark Laser`]],
		[`Quivern`, [`Dragon Meteor`, `Diamond Rain`, `Dragon Breath`]],
		[`Azurobe`, [`Dragon Meteor`, `Geyser Gush`, `Dragon Breath`]],
	],
	ice: [
		[`Frostallion`, [`Absolute Frost`, `Double Blizzard Spike`, `Blizzard Spike`]],
		[`Bastigor`, [`Glacial Impact`, `Double Blizzard Spike`, `Diamond Rain`]],
		[`Cryolinx`, [`Diamond Rain`, `Blizzard Spike`, `Crystal Breath`]],
		[`Foxcicle`, [`Diamond Rain`, `Blizzard Spike`, `Crystal Breath`]],
		[`Vanwyrm Cryst`, [`Diamond Rain`, `Tempest Blizzard`, `Blizzard Spike`]],
	],
	electric: [
		[`Orserk`, [`Polykeraunos`, `Lightning Bolt`, `Lightning Strike`]],
		[`Azurmane`, [`Thunderstorm`, `Thunder Rail`, `All Range Thunder`]],
		[`Grizzbolt`, [`Heavy Thunder Tank`, `Lightning Bolt`, `Tri-Lightning`]],
		[`Beakon`, [`Thunderstorm`, `Lightning Bolt`, `Lightning Dive`]],
		[`Univolt`, [`Thunder Rail`, `Lightning Bolt`, `Lightning Strike`]],
	],
	dark: [
		[`Bellanoir Libero`, [`Nightmare Bloom`, `Apocalypse`, `Dark Whisp`]],
		[`Shadowbeak`, [`Divine Disaster II`, `Dark Laser`, `Dark Whisp`]],
		[`Frostallion Noct`, [`Dark Wing`, `Dark Laser`, `Dark Whisp`]],
		[`Necromus`, [`Twin Spears`, `Apocalypse`, `Dark Whisp`]],
		[`Astegon`, [`Dark Laser`, `Dragon Meteor`, `Dark Whisp`]],
	],
	neutral: [
		[`Xenolord`, [`Omega Laser`, `Cosmic Meteor`, `Meteorain`]],
		[`Blazamut Ryu`, [`Magna Crush`, `Beam Slicer`, `Meteorain`]],
		[`Necromus`, [`Apocalypse`, `Dark Whisp`, `Rocky Impact`]],
		[`Paladius`, [`Radiant Barrage`, `Holy Burst`, `Pal Blast`]],
		[`Frostallion Noct`, [`Dark Whisp`, `Dark Laser`, `Absolute Frost`]],
	],
};

// Normal progression recommendations avoid requiring raid-exclusive or legendary Pals before endgame.
const PROGRESSION_PROFILES = {
	ground: [
		[`Fuddler`, [`Fuddler Tunneler`, `Power Shot`, `Bog Blast`]],
		[`Rushoar`, [`Bog Blast`, `Reckless Charge`]],
		[`Gumoss`, [`Bog Blast`, `Wind Cutter`]],
		[`Dumud`, [`Bog Blast`, `Aqua Gun`]],
		[`Digtoise`, [`Stone Blast`, `Aqua Gun`]],
	],
	fire: [
		[`Arsox`, [`Flare Arrow`, `Spirit Fire`, `Blazing Horn`]],
		[`Foxparks`, [`Flare Arrow`, `Spirit Fire`, `Ignis Blast`]],
		[`Rooby`, [`Flare Arrow`, `Spirit Fire`, `Ignis Blast`]],
		[`Leezpunk Ignis`, [`Ignis Breath`, `Spirit Fire`, `Poison Blast`]],
		[`Gobfin Ignis`, [`Flare Arrow`, `Spirit Fire`, `Ignis Blast`]],
	],
	ice: [
		[`Chillet`, [`Ice Missile`, `Icicle Cutter`, `Crystal Breath`]],
		[`Reindrix`, [`Ice Missile`, `Icicle Cutter`, `Crystal Breath`]],
		[`Penking`, [`Iceberg`, `Crystal Breath`, `Aqua Burst`]],
		[`Sweepa`, [`Ice Missile`, `Icicle Cutter`, `Iceberg`]],
		[`Dumud`, [`Bog Blast`, `Stone Blast`, `Aqua Burst`]],
	],
	water: [
		[`Azurobe`, [`Aqua Gun`, `Bubble Blast`, `Hydro Laser`]],
		[`Surfent`, [`Hydro Jet`, `Aqua Gun`, `Bubble Blast`]],
		[`Penking`, [`Aqua Gun`, `Aqua Burst`, `Hydro Laser`]],
		[`Broncherry Aqua`, [`Aqua Gun`, `Bubble Blast`, `Aqua Burst`]],
		[`Gobfin`, [`Hydro Jet`, `Aqua Gun`, `Bubble Blast`]],
	],
	dragon: [
		[`Astegon`, [`Dragon Cannon`, `Dragon Burst`, `Dragon Breath`]],
		[`Quivern`, [`Dragon Cannon`, `Dragon Breath`, `Dragon Meteor`]],
		[`Elphidran`, [`Dragon Cannon`, `Dragon Burst`, `Dragon Breath`]],
		[`Azurobe`, [`Dragon Cannon`, `Dragon Burst`, `Dragon Breath`]],
		[`Relaxaurus Lux`, [`Dragon Cannon`, `Dragon Breath`, `Lightning Strike`]],
	],
	dark: [
		[`Felbat`, []],
		[`Katress`, []],
		[`Tombat`, []],
		[`Loupmoon`, []],
		[`Vanwyrm`, []],
	],
};

const PROGRESSION_LEVEL_LIMITS = { dark: 55, dragon: 55, fire: 30, ground: 30, ice: 30, water: 40 };

function recommendedParty(profile, hard = false, level = 100) {
	const useProgressionParty = !hard && level <= (PROGRESSION_LEVEL_LIMITS[profile] || 0);
	const partyProfile = useProgressionParty ? PROGRESSION_PROFILES[profile] : PARTY_PROFILES[profile];
	return partyProfile.map(([pal, moves]) => ({
		pal,
		moves,
		passives: hard ? HARD_OFFENSE : NORMAL_OFFENSE,
	}));
}

function astralymHardParty() {
	// Favor player energy-weapon pressure while Felbat supplies sustain; keep all species unique for Solenne.
	return [
		{ pal: `Felbat`, role: `Active sustain`, passives: HARD_OFFENSE, strategy: `Keep Felbat deployed so Life Steal restores both player and Pal HP while attacking.` },
		{ pal: `Gobfin`, role: `Party support`, passives: PLAYER_SUPPORT, strategy: `Keep in the party for Angry Shark's player Attack increase.` },
		{ pal: `Gobfin Ignis`, role: `Party support`, passives: PLAYER_SUPPORT, strategy: `Keep in the party for a second Angry Shark player Attack increase.` },
		{ pal: `Solenne`, role: `Party support`, passives: PLAYER_SUPPORT, strategy: `Its non-stacking Attack bonus applies because all five party species are different.` },
		{ pal: `Xenogard`, role: `Party support`, passives: PLAYER_SUPPORT, strategy: `Keep in the party to boost Plasma Rifle and other eligible energy-weapon damage; this bonus does not apply to all weapons.` },
	];
}

function profileExamples(profiles, hard, level, limit) {
	const profileParties = profiles.map(profile => recommendedParty(profile, hard, level));
	const examples = [];
	for (let index = 0; examples.length < limit; index += 1) {
		let added = false;
		for (const party of profileParties) {
			const candidate = party[index];
			if (candidate && !examples.some(entry => entry.pal === candidate.pal)) {
				examples.push(candidate);
				added = true;
				if (examples.length === limit) {
					break;
				}
			}
		}
		if (!added) {
			break;
		}
	}
	return examples;
}

function counterCoverage(profiles) {
	const counterLabels = { neutral: `Raw damage (no elemental counter)` };
	return profiles.map(profile => counterLabels[profile] || `${profile[0].toUpperCase()}${profile.slice(1)}`).join(` / `);
}

function towerTeamGuidance(profiles, hard) {
	return [
		`Suggested counter coverage: **${counterCoverage(profiles)}**`,
		`The listed Pals are interchangeable examples, not a required five-Pal lineup.`,
		hard ?
			`Moves and passives are endgame build targets; prioritize survival and sustained counter-type damage.` :
			`Use accessible Pals near the recommended level; specialized breeding is not required.`,
	];
}

function raidTeamGuidance({ profiles, party, hard, facts, communityGuidance }) {
	const damageReduction = Math.round((1 - facts.receiveDamage) * 1000) / 10;
	return [
		`Suggested attack coverage: **${counterCoverage(profiles)}**`,
		`Example Pals: **${party.map(entry => entry.pal).join(`, `)}**`,
		hard ?
			`Deployment: Start with a full active group of your strongest raid-ready attackers; mix species freely and use replacements as casualties occur.` :
			`Use the strongest appropriately leveled attackers you already have. Mixed species, substitutes, and less than a full base deployment are all reasonable; add more only if the attempt needs them.`,
		...(hard ?
			[
				`Game-data rationale: **${damageReduction}% innate damage reduction** favors sustained concurrent pressure over a five-Pal rotation.`,
				`Optional offensive passive template: **${HARD_OFFENSE.join(`, `)}**`,
				`Community reports: ${communityGuidance}`,
			] :
			[]),
	];
}

function communityStrategy(id, difficulty = `hard`) {
	// Player reports can shape strategy advice, but decoded game data remains the only source for encounter facts.
	return curatedEncounterStrategies.strategies[id]?.[difficulty];
}

// Positional arguments keep the large encounter catalog compact and readable at each declaration.
// eslint-disable-next-line max-params
function tower(id, name, towerName, aliases, normal, hard) {
	const normalFacts = gameTowerVariant(id, `Normal`);
	const hardFacts = gameTowerVariant(id, `Hard`);
	return {
		aliases: [name, towerName, ...aliases], id, kind: `tower`, map: ENCOUNTER_MAPS[id], name, towerName,
		variants: {
			normal: { ...normal, ...normalFacts, party: profileExamples(normal.counterProfiles, false, normalFacts.level, 5),
				teamGuidance: towerTeamGuidance(normal.counterProfiles, false) },
			hard: { ...hard, ...hardFacts, party: profileExamples(hard.counterProfiles, true, hardFacts.level, 5),
				teamGuidance: towerTeamGuidance(hard.counterProfiles, true) },
		},
	};
}

const astralymCommunityStrategy = communityStrategy(`zenara-astralym`);
const ENCOUNTERS = [
	tower(`zoe-grizzbolt`, `Zoe & Grizzbolt`, `Rayne Syndicate Tower`, [`Zoe`, `Grizzbolt`],
		{ counterProfiles: [`ground`] }, { counterProfiles: [`ground`] }),
	tower(`lily-lyleen`, `Lily & Lyleen`, `Free Pal Alliance Tower`, [`Lily`, `Lyleen`],
		{ counterProfiles: [`fire`] }, { counterProfiles: [`fire`] }),
	tower(`axel-orserk`, `Axel & Orserk`, `Brothers of the Eternal Pyre Tower`, [`Axel`, `Orserk`],
		{ counterProfiles: [`ice`, `ground`] }, { counterProfiles: [`ice`, `ground`] }),
	tower(`marcus-faleris`, `Marcus & Faleris`, `PIDF Tower`, [`PIDF`, `Marcus`, `Faleris`],
		{ counterProfiles: [`water`] }, { counterProfiles: [`water`] }),
	tower(`victor-shadowbeak`, `Victor & Shadowbeak`, `PAL Genetic Research Unit Tower`, [`Victor`, `Shadowbeak`],
		{ counterProfiles: [`dragon`] }, { counterProfiles: [`dragon`] }),
	tower(`saya-selyne`, `Saya & Selyne`, `Moonflower Tower`, [`Saya`, `Selyne`],
		{ counterProfiles: [`dragon`, `dark`] }, { counterProfiles: [`dragon`, `dark`] }),
	tower(`bjorn-bastigor`, `Bjorn & Bastigor`, `Feybreak Tower`, [`Bjorn`, `Bastigor`],
		{ counterProfiles: [`fire`] }, { counterProfiles: [`fire`] }),
	tower(`auri-shaolong`, `Auri & Shaolong`, `Azure Covenant Tower`, [`Auri`, `Shaolong`],
		{ counterProfiles: [`electric`, `ice`] }, { counterProfiles: [`electric`, `ice`] }),
	{
		aliases: [`Panthalus`, `Legendary Ocean King`, `Deserted Islet`], id: `panthalus`, kind: `story`, map: ENCOUNTER_MAPS.panthalus, name: `Panthalus`, towerName: `Deserted Islet Story Encounter`,
		variants: { normal: { ...gameTowerVariant(`panthalus`, `Normal`), counterProfiles: [`electric`],
			party: profileExamples([`electric`], false, gameTowerVariant(`panthalus`, `Normal`).level, 5),
			teamGuidance: towerTeamGuidance([`electric`], false) } },
	},
	{
		aliases: [`Zenara & Astralym`, `Astralym`, `Zenara`, `Blightstar Calamity Tower`, `World Tree Tower`], id: `zenara-astralym`, kind: `tower-raid`, map: ENCOUNTER_MAPS[`zenara-astralym`], name: `Zenara & Astralym`, towerName: `Blightstar Calamity Tower`,
		variants: {
			normal: { counterProfiles: [`neutral`], ...gameTowerVariant(`zenara-astralym`, `Normal`),
				party: profileExamples([`neutral`], false, gameTowerVariant(`zenara-astralym`, `Normal`).level, 5),
				teamGuidance: towerTeamGuidance([`neutral`], false), notes: [`Typeless encounter: prioritize raw damage and survival rather than elemental counters.`] },
			hard: { profile: `neutral`, ...gameTowerVariant(`zenara-astralym`, `Hard`), verifiedHp: 5030099,
			 recommendedPlayerLevel: GAME_MAX_LEVEL, recommendedPalLevel: GAME_MAX_LEVEL, party: astralymHardParty(),
			 foodGuidance: `Food: Feed early Necromus waves Galeclaw Nikujaga (+25% Defense) and the final wave Mammorest Curry (+25% Attack); eat Mammorest Curry for player damage.`,
			 raidComposition: astralymCommunityStrategy.palboxPlan,
			 strategySources: astralymCommunityStrategy.sources,
			 notes: [`Keep Felbat active to sustain the player while the Necromus waves deal damage.`] },
		},
	},
];

// eslint-disable-next-line max-params
function raid(id, name, aliases, normal, hard) {
	const normalFacts = gameRaidVariant(id, 0);
	const normalParty = profileExamples(normal.counterProfiles, false, normalFacts.level, 3);
	const variants = { normal: { ...normal, ...normalFacts, party: normalParty,
		teamGuidance: raidTeamGuidance({ facts: normalFacts, hard: false, party: normalParty, profiles: normal.counterProfiles }) } };
	if (hard) {
		const hardFacts = gameRaidVariant(id, 1);
		const hardParty = profileExamples(hard.counterProfiles, true, hardFacts.level, 5);
		const strategy = communityStrategy(id);
		variants.hard = { ...hard, ...hardFacts, party: hardParty,
			strategySources: strategy.sources,
			teamGuidance: raidTeamGuidance({
				communityGuidance: strategy.guidance, facts: hardFacts, hard: true,
				party: hardParty, profiles: hard.counterProfiles,
			}) };
	}
	return { aliases: [name, ...aliases], id, kind: `raid`, name, variants };
}

ENCOUNTERS.push(
	raid(`bellanoir`, `Bellanoir`, [], { recommendedPalLevel: 45, counterProfiles: [`dragon`] }),
	raid(`bellanoir-libero`, `Bellanoir Libero`, [`Libero`], { recommendedPalLevel: 55, counterProfiles: [`dragon`, `fire`] }, { difficultyLabel: `Ultra`, recommendedPalLevel: 80, counterProfiles: [`dragon`, `fire`] }),
	raid(`blazamut-ryu`, `Blazamut Ryu`, [`Ryu`], { counterProfiles: [`ice`, `water`, `ground`] }, { difficultyLabel: `Ultra`, counterProfiles: [`ice`, `water`, `ground`] }),
	raid(`xenolord`, `Xenolord`, [], { counterProfiles: [`ice`, `dragon`] }, { difficultyLabel: `Ultra`, counterProfiles: [`ice`, `dragon`] }),
	raid(`moon-lord`, `Moon Lord`, [`Terraria`], { counterProfiles: [`neutral`] }, { difficultyLabel: `Master`, counterProfiles: [`neutral`] }),
	raid(`hartalis`, `Hartalis`, [], { counterProfiles: [`electric`, `fire`] }, { difficultyLabel: `Ultra`, counterProfiles: [`electric`, `fire`, `dark`] }),
);

function completionRewards(encounter, variant) {
	const eggGroups = new Map();
	for (const reward of variant.gameEggRewards || []) {
		const group = eggGroups.get(reward.name) || { alpha: 0, total: 0 };
		group.total += reward.probability;
		if (reward.alpha) {
			group.alpha += reward.probability;
		}
		eggGroups.set(reward.name, group);
	}
	const eggRewards = [...eggGroups].map(([name, reward]) => {
		const total = Number(reward.total.toFixed(3));
		const alpha = Number(reward.alpha.toFixed(3));
		return `${name} Egg — ${total}%${alpha ? ` (${alpha}% Alpha)` : ``}`;
	});
	const gameRewards = (variant.gameRewards || []).map(reward => {
		const gameId = reward.ItemName?.Key;
		const itemName = itemByGameId.get(gameId)?.name || gameId;
		const quantity = reward.Min === reward.Max ? reward.Min : `${reward.Min}–${reward.Max}`;
		const probability = Number(Number(reward.Rate).toFixed(3));
		return `${itemName} ×${quantity} — ${probability}%${reward.firstClear ? ` (first clear)` : ``}`;
	});
	const explicit = [...gameRewards, ...(variant.completion || []), ...eggRewards];
	if (!explicit.length && encounter.kind !== `raid`) {
		return [`No item drops recorded in the installed boss manager.`];
	}
	return explicit;
}

function encountersFor(command, difficulty) {
	return ENCOUNTERS.filter(encounter => encounter.variants[difficulty] && (
		command === `tower` ?
			[`tower`, `story`, `tower-raid`].includes(encounter.kind) :
			encounter.kind === `raid` || (encounter.id === `zenara-astralym` && difficulty === `hard`)
	));
}

function findEncounter(command, difficulty, value) {
	const normalized = String(value || ``).trim().toLowerCase();
	return encountersFor(command, difficulty).find(encounter =>
		encounter.id === normalized || encounter.aliases.some(alias => alias.toLowerCase() === normalized));
}

module.exports = {
	completionRewards, derivedEncounterHp, encountersFor, ENCOUNTERS, findEncounter, GAME_MAX_LEVEL, REVIEWED_BUILD_ID, ROOT_DIR,
};
