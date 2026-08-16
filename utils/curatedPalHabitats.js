// Scripted and event encounters that are not represented by PalDB's ordinary day/night habitat distribution.
const CURATED_PAL_HABITATS = {
	Mau: { file: `027-mau.png`, map: `palpagos`, href: [`Ravine_Grotto`, `Mountain_Stream_Grotto`], label: `Dungeon`, style: `diamond`, color: `#ff9600` },
	"Katress Ignis": { file: `075b-katress-ignis.png`, map: `palpagos`, href: [`Cherry_Blossom_Cave`], label: `Dungeon`, style: `diamond`, color: `#ff9600` },
	Xenovader: {
		file: `145-xenovader.png`, map: `palpagos`,
		supplyPools: [`Grass_Supply`, `Forest_Supply`, `Desert_Supply`, `Volcano_Supply`, `Snow_Supply`, `DarkIsland_Supply`, `SkyIsland_Supply`],
		label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
	},
	Xenogard: {
		file: `146-xenogard.png`, map: `palpagos`,
		supplyPools: [`Desert_Supply`, `Volcano_Supply`, `Snow_Supply`, `DarkIsland_Supply`, `SkyIsland_Supply`],
		label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
	},
	Selyne: {
		file: `190-selyne.png`, map: `palpagos`, supplyPools: [`Sakurajima_Supply`], appendExistingPanel: true,
		label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
	},
	Silvance: { file: `193-silvance.png`, map: `worldtree`, href: `Immortal_Shade_Silvance`, label: `Alpha`, style: `special` },
	Dandilord: { file: `194-dandilord.png`, map: `worldtree`, href: `Bewitching_Lurker_Dandilord`, label: `Alpha`, style: `special` },
	Panthalus: { file: `203-panthalus.png`, map: `palpagos`, items: [`Deserted Islet`], label: `Alpha`, style: `special` },
	Astralym: { file: `204-astralym.png`, map: `worldtree`, href: `Nullstar_Calamity_Zenara_%26_Astralym`, label: `Alpha`, style: `special` },
	Eidrolon: {
		file: `171-eidrolon.png`, map: `palpagos`, href: `Wings_of_Freedom_Eidrolon`, label: `Alpha`, style: `special`,
		extraGroups: [{ href: `Sunreach_Skies`, label: `Dungeon`, style: `diamond`, color: `#ff9600` }],
	},
};

function curatedPalHabitats(pals) {
	const definitions = Object.fromEntries(Object.entries(CURATED_PAL_HABITATS)
		.map(([name, definition]) => [name, { ...definition }]));
	for (const pal of pals.filter(value => value.spawnTime === `Sealed Realm of Terraria`)) {
		definitions[pal.name] = {
			file: `terraria-sealed-realm.png`, map: `palpagos`, items: [`Sealed Realm of Terraria`],
			label: `Sealed Realm of Terraria`, style: `special`,
		};
	}
	return definitions;
}

module.exports = { curatedPalHabitats };
