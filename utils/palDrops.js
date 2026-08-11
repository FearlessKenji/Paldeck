// Normalizes Pal drop sources and builds drop-specific Discord controls and fields.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require(`discord.js`);
const encounterFile = require(`../data/palEncounterData.json`);
const { resolvedItemData } = require(`./itemData.js`);

function normalize(value) {
	return String(value || ``).trim().toLowerCase();
}
function splitValues(value) {
	return String(value || ``).split(`,`).map(entry => entry.trim()).filter(Boolean);
}
function uniqueSorted(values) {
	return [...new Set(values)].sort((first, second) => first.localeCompare(second));
}

const itemFile = resolvedItemData();
const itemsByName = new Map(itemFile.Items.map(item => [normalize(item.name), item]));
const encountersByPal = new Map();
for (const encounter of encounterFile.Encounters) {
	const key = normalize(encounter.pal);
	encountersByPal.set(key, [...(encountersByPal.get(key) || []), encounter]);
}
const WORLD_TREE_BOSS_LEVELS = new Map([[`dandilord`, 78], [`silvance`, 78]]);
const ANCIENT_RELIC_LABEL = `Ancient Relics`;
const ANCIENT_RELIC_DROPS = new Set([
	`Decayed Ancient Relic`, `Dormant Ancient Relic`, `Glistening Ancient Relic`,
	`Glowing Ancient Relic`, `Gorgeous Ancient Relic`,
].map(normalize));

function worldTreeDropValues(pal) {
	return Object.entries(pal.worldTreeDrops || {}).filter(([, value]) => String(value || ``).trim())
		.sort(([first], [second]) => Number(first) - Number(second)).flatMap(([, value]) => splitValues(value));
}

function encounterDropValues(pal) {
	return (encountersByPal.get(normalize(pal.name)) || []).flatMap(encounter => encounter.drops.map(drop => drop.item));
}

function searchableDropValues(pal) {
	const values = [...splitValues(pal.drops), ...worldTreeDropValues(pal), ...encounterDropValues(pal)];
	if (values.some(value => ANCIENT_RELIC_DROPS.has(normalize(value)))) {
		values.push(ANCIENT_RELIC_LABEL);
	}
	return values;
}

function autocompleteDropValues(pal) {
	const collapsed = [];
	let relicAdded = false;
	for (const value of worldTreeDropValues(pal)) {
		if (!ANCIENT_RELIC_DROPS.has(normalize(value))) {
			collapsed.push(value);
		} else if (!relicAdded) {
			collapsed.push(ANCIENT_RELIC_LABEL);
			relicAdded = true;
		}
	}
	return [...splitValues(pal.drops), ...collapsed, ...encounterDropValues(pal)];
}

function distinctPalDrops(pal) {
	const structured = itemFile.Items.filter(item =>
		(item.droppedBy || []).some(drop => normalize(drop.pal) === normalize(pal.name))).map(item => item.name);
	return uniqueSorted([...splitValues(pal.drops), ...worldTreeDropValues(pal), ...encounterDropValues(pal), ...structured]);
}

function mergeInheritedAlphaDrops(groups) {
	const normalDrops = groups.get(`Normal\0`)?.drops || [];
	for (const group of groups.values()) {
		if (group.label !== `Alpha`) {
			continue;
		}
		const explicit = new Set(group.drops.map(drop => normalize(drop.item)));
		group.drops = [...normalDrops.filter(drop => !explicit.has(normalize(drop.item))), ...group.drops];
	}
}

function mergeStoryBossDrops(groups, bossLevel) {
	const merged = [];
	const seen = new Set();
	for (const [key, group] of [...groups.entries()].filter(([, value]) => value.label === `Alpha`)) {
		groups.delete(key);
		for (const drop of group.drops) {
			const dropKey = `${drop.item}\0${drop.quantity}\0${drop.probability}`;
			if (seen.has(dropKey)) {
				continue;
			}
			seen.add(dropKey);
			merged.push(drop);
		}
	}
	if (merged.length) {
		groups.set(`Story Boss\0${bossLevel}`, { label: `Story Boss`, level: bossLevel, drops: merged });
	}
}

function structuredPalDrops(pal) {
	const groups = new Map();
	for (const item of itemFile.Items) {
		for (const drop of item.droppedBy || []) {
			if (normalize(drop.pal) !== normalize(pal.name)) {
				continue;
			}
			const label = drop.variant || `Normal`;
			const key = `${label}\0${drop.level || ``}`;
			const group = groups.get(key) || { label, level: drop.level, drops: [] };
			group.drops.push({ item: item.name, probability: drop.probability, quantity: drop.quantity });
			groups.set(key, group);
		}
	}
	const bossLevel = WORLD_TREE_BOSS_LEVELS.get(normalize(pal.name));
	if (bossLevel) {
		mergeStoryBossDrops(groups, bossLevel);
	} else {
		mergeInheritedAlphaDrops(groups);
	}
	for (const encounter of encountersByPal.get(normalize(pal.name)) || []) {
		groups.set(`${encounter.source}\0${encounter.level}\0${encounter.variant || ``}`, {
			drops: encounter.drops, label: encounter.source, level: encounter.level, variant: encounter.variant,
		});
	}
	const order = { Normal: 0, Alpha: 1, 'World Tree': 2, 'Story Boss': 3, Rampaging: 4, 'Summoning Altar': 5 };
	return [...groups.values()].filter(group => group.drops.length).sort((first, second) =>
		(order[first.label] ?? 99) - (order[second.label] ?? 99) || (first.level || 0) - (second.level || 0));
}

function comparePalDrops(first, second) {
	const firstChance = Number.parseFloat(first.probability);
	const secondChance = Number.parseFloat(second.probability);
	if (Number.isFinite(firstChance) !== Number.isFinite(secondChance)) {
		return Number.isFinite(firstChance) ? -1 : 1;
	}
	if (Number.isFinite(firstChance) && firstChance !== secondChance) {
		return secondChance - firstChance;
	}
	return first.item.localeCompare(second.item, `en`, { sensitivity: `base` });
}

function palDropFields(pal) {
	const groups = structuredPalDrops(pal);
	if (!groups.length) {
		return [{ name: `Pal Drops:`, value: splitValues(pal.drops).map(item => `• ${item}`).join(`\n`) || `None` }];
	}
	return groups.map(group => {
		const context = ` — ${group.label}${group.level ? `: Lvl ${group.level}` : ``}${group.variant ? ` (${group.variant})` : ``}`;
		return { name: `Pal Drops${context}`, value: [...group.drops].sort(comparePalDrops)
			.map(drop => `• ${drop.item} ×${drop.quantity}: ${drop.probability}`).join(`\n`).slice(0, 1024) };
	});
}

function findItemByDropName(dropName) {
	return itemsByName.get(normalize(dropName));
}
function buildBackToPalButton(palNumber, ownerId) {
	return new ButtonBuilder().setCustomId(`paldeck:back:${encodeURIComponent(palNumber)}:${ownerId}`)
		.setLabel(`Back to Pal`).setStyle(ButtonStyle.Secondary);
}
function buildDropSelect(pal, userId) {
	const options = distinctPalDrops(pal).map(dropName => ({ dropName, item: findItemByDropName(dropName) }))
		.filter(entry => entry.item).slice(0, 25).map(({ dropName, item }) => ({ label: dropName, value: item.id }));
	if (!options.length) {
		return null;
	}
	return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
		.setCustomId(`paldeck:drop:${encodeURIComponent(pal.number)}:${userId}`)
		.setPlaceholder(`Choose one of ${pal.name}'s drops`).addOptions(options));
}
function farmableValues(pal) {
	const farmable = String(pal.farmable || ``).trim();
	return farmable.startsWith(`Yes - `) ? splitValues(farmable.slice(`Yes - `.length)) : [];
}

module.exports = {
	autocompleteDropValues, buildBackToPalButton, buildDropSelect, distinctPalDrops,
	farmableValues, findItemByDropName, palDropFields, searchableDropValues, splitValues, uniqueSorted,
};
