const curatedTowerBossSources = require(`../data/curatedTowerBossSources.json`);

function withoutTowerMarkers(panel) {
	if (!panel?.markers) {
		return panel;
	}
	return { ...panel, markers: panel.markers.filter(marker => marker.legendType !== `Tower Boss`) };
}

function applyTowerBossSources(itemData) {
	for (const item of itemData.Items) {
		const tower = curatedTowerBossSources[item.id];
		if (!tower) {
			continue;
		}
		item.acquisition ||= { sources: [] };
		item.acquisition.sources = (item.acquisition.sources || []).filter(source => source.type !== `Tower Boss`);
		item.acquisition.sources.push({ type: `Tower Boss`, entries: JSON.parse(JSON.stringify(tower.entries)) });
		const markers = JSON.parse(JSON.stringify(tower.markers || [tower.marker]));
		if (item.id.startsWith(`key-sphere-`)) {
			item.acquisition.mapSources = { map: `palpagos`, markers };
			continue;
		}
		const current = item.acquisition.mapSources?.maps || [item.acquisition.mapSources].filter(Boolean);
		const panels = current.map(withoutTowerMarkers).filter(panel => panel?.markers?.length);
		panels.push({ map: `palpagos`, markers });
		item.acquisition.map = `data/item-maps/${item.id}-tower-sources.png`;
		item.acquisition.mapSources = { maps: panels };
	}
	return itemData;
}

module.exports = { applyTowerBossSources, curatedTowerBossSources };
