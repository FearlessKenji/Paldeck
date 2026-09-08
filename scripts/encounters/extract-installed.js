#!/usr/bin/env node
const fs = require(`node:fs`);
const path = require(`node:path`);
const { loadInstalledSnapshot } = require(`../game/load-installed-snapshot.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const snapshot = loadInstalledSnapshot();
const decoded = snapshot.tables?._decodedTables || {};
const actorTable = decoded[`Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter`] || {};
const raidTable = decoded[`Pal/Content/Pal/Blueprint/RaidBoss/DT_PalRaidBoss`] || {};
const actorIds = new Set([
	`GYM_ElecPanda`, `GYM_ElecPanda_2`, `GYM_LilyQueen`, `GYM_LilyQueen_2`, `GYM_ThunderDragonMan`, `GYM_ThunderDragonMan_2`,
	`GYM_Horus`, `GYM_Horus_2`, `GYM_BlackGriffon`, `GYM_BlackGriffon_2`, `GYM_MoonQueen`, `GYM_MoonQueen_2`,
	`GYM_SnowTigerBeastman`, `GYM_SnowTigerBeastman_2`, `GYM_BlueSkyDragon`, `GYM_BlueSkyDragon_2`,
	`BOSS_KingWhale`, `GYM_WorldTreeDragon`, `GYM_WorldTreeDragon_2`, `RAID_NightLady`, `RAID_NightLady_Dark`,
	`RAID_NightLady_Dark_2`, `RAID_KingBahamut_Dragon`, `RAID_KingBahamut_Dragon_2`, `RAID_DarkMechaDragon`,
	`RAID_DarkMechaDragon_2`, `RAID_YakushimaBoss002`, `RAID_YakushimaBoss002_2`, `RAID_LegendDeer`, `RAID_LegendDeer_2`,
]);
const output = {
	schemaVersion: 1,
	buildId: String(snapshot.buildId),
	extractedAt: new Date().toISOString(),
	sourceTables: {
		actors: `Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter`,
		raids: `Pal/Content/Pal/Blueprint/RaidBoss/DT_PalRaidBoss`,
	},
	actors: Object.fromEntries([...actorIds].map(id => [id, actorTable[id]])),
	raids: raidTable,
};
const target = path.join(ROOT, `data`, `gameEncounterData.json`);
if (!process.argv.includes(`--write`)) {
	console.log(`Decoded ${Object.keys(output.actors).length} encounter actors and ${Object.keys(output.raids).length} raid rows from build ${output.buildId}; run with --write.`);
} else {
	fs.writeFileSync(target, `${JSON.stringify(output, null, `\t`)}\n`);
	console.log(`Wrote installed encounter data for build ${output.buildId} to ${target}.`);
}
