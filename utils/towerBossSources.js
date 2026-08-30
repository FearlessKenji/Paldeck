const curatedTowerBossMarkers = require(`../data/curatedTowerBossMarkers.json`);
const gameBossData = require(`../data/gameBossData.json`);

function towerBossSources(itemData) {
	const byGameId = new Map(itemData.Items.map(item => [String(item.code || ``).split(`/`).at(-1), item]));
	const sources = {};
	for (const bossEntry of gameBossData.bosses) {
		const bossType = bossEntry.key.replace(`EPalBossType::`, ``);
		const config = curatedTowerBossMarkers[bossType];
		if (!config) {
			continue;
		}
		const marker = config.marker;
		const rewards = [];
		for (const item of bossEntry.value.OneTimeRewards || []) {
			rewards.push({ gameId: item.Key, difficulty: `Normal`, firstClear: true, quantity: `1`, probability: `100%` });
		}
		const hard = bossEntry.value.DifficultyParameter.find(entry => entry.key.endsWith(`::Hard`))?.value;
		for (const item of hard?.SuccessItemList || []) {
			rewards.push({ gameId: item.ItemName.Key, difficulty: `Hard`, firstClear: false,
				quantity: item.Min === item.Max ? String(item.Min) : `${item.Min}–${item.Max}`, probability: `${item.Rate}%` });
		}
		for (const reward of rewards) {
			const item = byGameId.get(reward.gameId);
			if (!item) {
				throw new Error(`Unknown tower reward item ${reward.gameId}.`);
			}
			const source = sources[item.id] ||= { entries: [], markers: [], map: config.map };
			source.entries.push({ location: `${config.name}, ${reward.difficulty}${reward.firstClear ? `, first clear only` : ``}`,
				quantity: reward.quantity, probability: reward.probability });
			if (!source.markers.some(value => value.href === marker.href)) {
				source.markers.push(JSON.parse(JSON.stringify(marker)));
			}
		}
	}
	return sources;
}

function withoutTowerMarkers(panel) {
	if (!panel?.markers) {
		return panel;
	}
	return { ...panel, markers: panel.markers.filter(marker => marker.legendType !== `Tower Boss`) };
}

function applyTowerBossSources(itemData) {
	const decodedTowerBossSources = towerBossSources(itemData);
	for (const item of itemData.Items) {
		const tower = decodedTowerBossSources[item.id];
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
		panels.push({ map: tower.map || `palpagos`, markers });
		const mergedPanels = [];
		for (const panel of panels) {
			const existing = mergedPanels.find(value => value.map === panel.map);
			if (existing) {
				existing.markers.push(...panel.markers);
			} else {
				mergedPanels.push(panel);
			}
		}
		item.acquisition.map = `data/item-maps/${item.id}-tower-sources.png`;
		item.acquisition.mapSources = mergedPanels.length === 1 ? mergedPanels[0] : { maps: mergedPanels };
	}
	return itemData;
}

module.exports = { applyTowerBossSources, curatedTowerBossMarkers, towerBossSources };
