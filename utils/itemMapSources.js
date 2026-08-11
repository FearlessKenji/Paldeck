function isTreasureMapItem(item) {
	return /^treasure-map\d+$/u.test(item.id);
}

const MAPPABLE_CHEST_SELECTORS = new Set([
	`DarkIsland02`, `DarkIsland_Treasure`, `Desert01`, `Desert02`, `Forest01`, `Forest02`, `Grass01`, `Grass02`,
	`Sakurajima_Treasure`, `SkyIsland_Treasure`, `Snow01`, `Snow02`, `Volcano01`, `Volcano02`,
]);

function removeIndirectTreasureMapMarkers(itemData) {
	let changed = 0;
	for (const item of itemData.Items) {
		const acquisition = item.acquisition;
		if (!acquisition?.mapSources) {
			continue;
		}
		const treasureMapItem = isTreasureMapItem(item);
		const panels = acquisition.mapSources.maps || [acquisition.mapSources];
		const hasEnemyCampSource = (acquisition.sources || []).some(source => source.type === `Enemy Camps`) ||
			(acquisition.lootPools || []).some(pool => pool.category === `Enemy Camps`);
		const movedToPalpagos = [];
		const cleaned = panels.map(panel => ({
			...panel,
			markers: (panel.markers || []).filter(marker => {
				const type = marker.legendType || marker.type;
				const chestSelectors = [marker.href, marker.Spawn].flat().filter(Boolean);
				if (type === `Treasure` && !marker.locationSet &&
					chestSelectors.some(selector => !MAPPABLE_CHEST_SELECTORS.has(selector))) {
					return false;
				}
				if (panel.map === `worldtree` && marker.type === `Anti-Air Turret`) {
					movedToPalpagos.push(marker);
					return false;
				}
				if (type === `Treasure Map` && !treasureMapItem) {
					return false;
				}
				if (type === `Enemy Camp` && !hasEnemyCampSource) {
					return false;
				}
				return !/Ancient Relic|Fishing Pond|Supply Drop/iu.test(type);
			}),
		})).filter(panel => panel.markers.length);
		if (movedToPalpagos.length) {
			const palpagos = cleaned.find(panel => panel.map === `palpagos`);
			if (palpagos) {
				palpagos.markers.push(...movedToPalpagos);
			} else {
				cleaned.push({ map: `palpagos`, markers: movedToPalpagos });
			}
		}
		if (JSON.stringify(cleaned) === JSON.stringify(panels)) {
			continue;
		}
		changed += 1;
		if (!cleaned.length) {
			delete acquisition.map;
			delete acquisition.mapSources;
		} else {
			acquisition.mapSources = cleaned.length === 1 ? cleaned[0] : { maps: cleaned };
		}
	}
	return changed;
}

module.exports = { isTreasureMapItem, removeIndirectTreasureMapMarkers };
