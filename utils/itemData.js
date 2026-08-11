// Resolves compact item-data presets at runtime and regenerates deterministic, readable preset references.
const rawItemData = require(`../data/itemData.json`);

const REGIONAL_CHEST_RULES = [
	{
		pool: `SkyIsland_Treasure`, map: `palpagos`, location: `76 Sunreach chest locations`,
		marker: { type: `Treasure`, href: `SkyIsland_Treasure` },
	},
	{
		pool: `WorldTree_Treasure`, map: `worldtree`, location: `38 World Tree chest locations`,
		marker: { type: `Treasure`, locationSet: `worldTreeTreasureChests` },
	},
];

function sameMarker(left, right) {
	return Object.entries(right).every(([key, value]) => left?.[key] === value);
}

function regionalChestMapPath(mapPath) {
	// The readable map name identifies one complete source definition, including derived regional chest panels.
	return mapPath;
}

function addMarkerToPanel(panel, marker) {
	panel.markers ||= [];
	if (panel.markers.some(existing => sameMarker(existing, marker))) {
		return false;
	}
	panel.markers.push({ ...marker });
	return true;
}

function regionalChestPanel(mapSources, rule) {
	let panel = mapSources.maps.find(entry => entry.map === rule.map);
	if (!panel) {
		panel = { map: rule.map, markers: [] };
		mapSources.maps.push(panel);
	}
	return panel;
}

function addRegionalChest(acquisition, rule) {
	if (!acquisition?.lootPools?.some(entry => entry.pool === rule.pool)) {
		return false;
	}
	acquisition.sources ||= [];
	let treasure = acquisition.sources.find(source => source.type === `Treasure`);
	if (!treasure) {
		treasure = { type: `Treasure`, entries: [] };
		acquisition.sources.push(treasure);
	}
	if (!treasure.entries.some(entry => entry.location === rule.location)) {
		treasure.entries.push({ location: rule.location, probability: `varies` });
	}
	if (!acquisition.map || !acquisition.mapSources) {
		return false;
	}

	if (acquisition.mapSources.maps) {
		return addMarkerToPanel(regionalChestPanel(acquisition.mapSources, rule), rule.marker);
	}

	if (acquisition.mapSources.map === rule.map) {
		return addMarkerToPanel(acquisition.mapSources, rule.marker);
	}
	acquisition.mapSources = { maps: [acquisition.mapSources, { map: rule.map, markers: [{ ...rule.marker }] }] };
	return true;
}

function deriveRegionalChests(acquisition) {
	if (!acquisition) {
		return acquisition;
	}
	const derived = JSON.parse(JSON.stringify(acquisition));
	let mapChanged = false;
	for (const rule of REGIONAL_CHEST_RULES) {
		mapChanged = addRegionalChest(derived, rule) || mapChanged;
	}
	if (mapChanged) {
		derived.map = regionalChestMapPath(derived.map, derived.mapSources);
	}
	return derived;
}

function consolidateMapPanels(acquisition) {
	const panels = acquisition?.mapSources?.maps;
	if (!Array.isArray(panels)) {
		return acquisition;
	}
	const merged = new Map();
	for (const panel of panels) {
		const current = merged.get(panel.map) || { ...panel, markers: [], unpinnedSources: [] };
		const markerKeys = new Set(current.markers.map(marker => JSON.stringify(marker)));
		for (const marker of panel.markers || []) {
			const key = JSON.stringify(marker);
			if (!markerKeys.has(key)) {
				current.markers.push(marker);
			}
			markerKeys.add(key);
		}
		current.unpinnedSources = [...new Set([...(current.unpinnedSources || []), ...(panel.unpinnedSources || [])])];
		if (!current.unpinnedSources.length) {
			delete current.unpinnedSources;
		}
		merged.set(panel.map, current);
	}
	const consolidated = [...merged.values()];
	// One physical region should render as one map, regardless of how many loot pools contribute pins.
	acquisition.mapSources = consolidated.length === 1 ? consolidated[0] : { maps: consolidated };
	return acquisition;
}

function stripDerivedRegionalChests(acquisition) {
	if (!acquisition) {
		return acquisition;
	}
	const stripped = JSON.parse(JSON.stringify(acquisition));
	stripped.map = stripped.map?.replace(/-with-(?:palpagos|worldtree|palpagos-and-worldtree|regional)-chests(?=\.png$)/u, ``)
		.replace(/-regional-chests-[a-f0-9]{8}(?=\.png$)/u, ``);
	for (const rule of REGIONAL_CHEST_RULES) {
		const treasure = stripped.sources?.find(source => source.type === `Treasure`);
		if (treasure) {
			treasure.entries = treasure.entries.filter(entry => entry.location !== rule.location);
		}
		stripped.sources = stripped.sources?.filter(source => source.type !== `Treasure` || source.entries.length);
		const panels = stripped.mapSources?.maps || (stripped.mapSources ? [stripped.mapSources] : []);
		for (const panel of panels) {
			panel.markers = panel.markers?.filter(marker => !sameMarker(marker, rule.marker));
		}
		if (stripped.mapSources?.maps) {
			stripped.mapSources.maps = stripped.mapSources.maps.filter(panel => panel.markers?.length);
			if (stripped.mapSources.maps.length === 1) {
				[stripped.mapSources] = stripped.mapSources.maps;
			}
		}
	}
	return stripped;
}

function resolvePreset(itemData, item, property, catalogName) {
	const reference = item[`${property}Ref`];
	if (!reference) {
		return item[property];
	}

	const preset = itemData[catalogName]?.[reference];
	if (!preset) {
		throw new Error(`Unknown ${catalogName} reference: ${reference}`);
	}

	return preset;
}

function indexedLootPools(itemData) {
	const indexed = new Map();
	for (const [pool, record] of Object.entries(itemData.LootPools || {})) {
		for (const [itemId, drops] of Object.entries(record.items || {})) {
			const entries = indexed.get(itemId) || [];
			const encodedDrops = Array.isArray(drops) ? drops : [drops];
			entries.push(...encodedDrops.map(drop => {
				if (Array.isArray(drop)) {
					return { pool, category: record.category, quantity: drop[0], probability: drop[1] };
				}
				const separator = drop.lastIndexOf(`: `);
				return { pool, category: record.category, quantity: drop.slice(0, separator), probability: drop.slice(separator + 2) };
			}));
			indexed.set(itemId, entries);
		}
	}
	return indexed;
}

function resolveItem(itemData, item, lootPools) {
	const acquisition = resolvePreset(itemData, item, `acquisition`, `AcquisitionPresets`);
	const resolvedAcquisition = acquisition ? JSON.parse(JSON.stringify(acquisition)) : acquisition;
	if (lootPools.has(item.id)) {
		resolvedAcquisition.lootPools = lootPools.get(item.id);
	}
	return {
		...item,
		acquisition: consolidateMapPanels(deriveRegionalChests(resolvedAcquisition)),
		merchantLocations: resolvePreset(itemData, item, `merchantLocations`, `MerchantLocationSets`),
	};
}

function resolvedItemData(itemData = rawItemData) {
	const lootPools = indexedLootPools(itemData);
	return {
		...itemData,
		Items: itemData.Items.map(item => resolveItem(itemData, item, lootPools)),
	};
}

function slug(value) {
	return String(value || ``).toLowerCase().replace(/[^a-z0-9]+/g, `-`).replace(/^-|-$/g, ``);
}

function acquisitionLabel(value) {
	// Scope and source names make references reviewable at every call site.
	const mapSources = value.mapSources || {};
	const scope = mapSources.maps?.length ? `combined` : slug(mapSources.map || `text-only`);
	const types = [...new Set((value.sources || []).map(source => {
		const type = slug(source.type);
		return scope === `worldtree` ? type.replace(/^world-tree-/, ``) : type;
	}).filter(Boolean))];
	return [scope, ...types].join(`-`);
}

function merchantLabel(value) {
	const shops = new Set((value.entries || []).flatMap(entry => entry.shops || [entry.shop]).filter(Boolean));
	if (shops.size === 5) {
		return `all-fixed`;
	}
	if (shops.size === 3 && [`Village_Shop_1`, `Desert_Shop_1`, `Volcano_Shop_1`].every(shop => shops.has(shop))) {
		return `all-general`;
	}
	if (shops.size === 2 && [`Desert_Shop_2`, `Volcano_Shop_2`].every(shop => shops.has(shop))) {
		return `all-weapons`;
	}
	const names = (value.entries || []).map(entry =>
		slug(String(entry.merchant || entry.shop).replace(/\b(?:wandering\s+)?merchant\b/gi, ``)),
	).filter(Boolean);
	return [...new Set(names)].join(`-`) || `locations`;
}

function presetBaseId(prefix, value) {
	const label = prefix === `acquisition` ? acquisitionLabel(value) : merchantLabel(value);
	return `${prefix === `acquisition` ? `acq` : `merchants`}-${label}`;
}

function readablePresetId(prefix, value, records, idsByValue) {
	const encoded = JSON.stringify(value);
	if (idsByValue.has(encoded)) {
		return idsByValue.get(encoded);
	}
	const baseId = presetBaseId(prefix, value);
	let id = baseId;
	let variant = 2;
	while (records[id] && JSON.stringify(records[id]) !== encoded) {
		id = `${baseId}-variant-${variant}`;
		variant += 1;
	}
	idsByValue.set(encoded, id);
	return id;
}

function compactItemData(itemData) {
	const acquisitions = {};
	const merchants = {};
	const acquisitionIdsByValue = new Map();
	const merchantIdsByValue = new Map();
	const lootPools = {};
	const acquisitionCounts = new Map();
	for (const item of itemData.Items) {
		for (const entry of item.acquisition?.lootPools || []) {
			const record = lootPools[entry.pool] || { category: entry.category, items: {} };
			record.items[item.id] ||= [];
			record.items[item.id].push(`${entry.quantity}: ${entry.probability}`);
			lootPools[entry.pool] = record;
		}
	}
	for (const record of Object.values(lootPools)) {
		for (const [itemId, drops] of Object.entries(record.items)) {
			if (drops.length === 1) {
				[record.items[itemId]] = drops;
			}
		}
	}

	// Count first so only genuinely shared acquisitions become presets; unique records stay beside their item.
	for (const item of itemData.Items) {
		if (item.acquisition) {
			const acquisition = stripDerivedRegionalChests(item.acquisition);
			delete acquisition.lootPools;
			const encoded = JSON.stringify(acquisition);
			acquisitionCounts.set(encoded, (acquisitionCounts.get(encoded) || 0) + 1);
		}
	}

	const items = itemData.Items.map(item => {
		const compact = { ...item };

		if (compact.acquisition) {
			compact.acquisition = stripDerivedRegionalChests(compact.acquisition);
			delete compact.acquisition.lootPools;
			const encoded = JSON.stringify(compact.acquisition);
			if (acquisitionCounts.get(encoded) > 1) {
				const id = readablePresetId(`acquisition`, compact.acquisition, acquisitions, acquisitionIdsByValue);
				acquisitions[id] = compact.acquisition;
				compact.acquisitionRef = id;
				delete compact.acquisition;
			} else {
				delete compact.acquisitionRef;
			}
		} else {
			// Sync passes resolved records through compaction; discard references whose acquisition was removed.
			delete compact.acquisitionRef;
		}
		if (compact.merchantLocations) {
			const id = readablePresetId(`merchants`, compact.merchantLocations, merchants, merchantIdsByValue);
			merchants[id] = compact.merchantLocations;
			compact.merchantLocationsRef = id;
			delete compact.merchantLocations;
		}

		return compact;
	});

	return {
		Sources: itemData.Sources,
		LootPools: Object.fromEntries(Object.entries(lootPools).sort(([left], [right]) => left.localeCompare(right))),
		AcquisitionPresets: acquisitions,
		MerchantLocationSets: merchants,
		Items: items,
	};
}

module.exports = { compactItemData, rawItemData, resolvedItemData };
