// Resolves compact item-data presets at runtime and regenerates deterministic, readable preset references.
const crypto = require(`node:crypto`);
const rawItemData = require(`../data/itemData.json`);

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

function resolveItem(itemData, item) {
	return {
		...item,
		acquisition: resolvePreset(itemData, item, `acquisition`, `AcquisitionPresets`),
		merchantLocations: resolvePreset(itemData, item, `merchantLocations`, `MerchantLocationSets`),
	};
}

function resolvedItemData(itemData = rawItemData) {
	return {
		...itemData,
		Items: itemData.Items.map(item => resolveItem(itemData, item)),
	};
}

function slug(value) {
	return String(value || ``).toLowerCase().replace(/[^a-z0-9]+/g, `-`).replace(/^-|-$/g, ``);
}

function acquisitionLabel(value) {
	// Scope and source names make references reviewable; the hash below separates similar pools.
	const mapSources = value.mapSources || {};
	const scope = mapSources.maps?.length ? `combined` : slug(mapSources.map || `text-only`);
	const types = [...new Set((value.sources || []).map(source => {
		const type = slug(source.type);
		return scope === `worldtree` ? type.replace(/^world-tree-/, ``) : type;
	}).filter(Boolean))];
	return [scope, ...types].join(`-`);
}

function merchantLabel(value) {
	const shops = new Set((value.entries || []).map(entry => entry.shop));
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

function presetId(prefix, value) {
	const label = prefix === `acquisition` ? acquisitionLabel(value) : merchantLabel(value);
	const hash = crypto.createHash(`sha256`).update(JSON.stringify(value)).digest(`hex`).slice(0, 6);
	return `${prefix === `acquisition` ? `acq` : `merchants`}-${label}-${hash}`;
}

function compactItemData(itemData) {
	const acquisitions = {};
	const merchants = {};
	const acquisitionCounts = new Map();

	// Count first so only genuinely shared acquisitions become presets; unique records stay beside their item.
	for (const item of itemData.Items) {
		if (item.acquisition) {
			const encoded = JSON.stringify(item.acquisition);
			acquisitionCounts.set(encoded, (acquisitionCounts.get(encoded) || 0) + 1);
		}
	}

	const items = itemData.Items.map(item => {
		const compact = { ...item };

		if (compact.acquisition) {
			const encoded = JSON.stringify(compact.acquisition);
			if (acquisitionCounts.get(encoded) > 1) {
				const id = presetId(`acquisition`, compact.acquisition);
				acquisitions[id] = compact.acquisition;
				compact.acquisitionRef = id;
				delete compact.acquisition;
			} else {
				delete compact.acquisitionRef;
			}
		}
		if (compact.merchantLocations) {
			const id = presetId(`merchants`, compact.merchantLocations);
			merchants[id] = compact.merchantLocations;
			compact.merchantLocationsRef = id;
			delete compact.merchantLocations;
		}

		return compact;
	});

	return {
		Sources: itemData.Sources,
		AcquisitionPresets: acquisitions,
		MerchantLocationSets: merchants,
		Items: items,
	};
}

module.exports = { compactItemData, rawItemData, resolvedItemData };
