const {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
} = require(`discord.js`);
const crypto = require(`node:crypto`);
const path = require(`node:path`);
const { Op } = require(`sequelize`);
const { SearchSessions } = require(`../../../database/dbObjects.js`);
const palFile = require(`../../../data/palData.json`);
const itemFile = require(`../../../data/itemData.json`);
const encounterFile = require(`../../../data/palEncounterData.json`);
const { getPalColor } = require(`../../../utils/palColors.js`);

const PALS = palFile.Pals.filter(pal => !pal.hidden);
const PAL_COLORS = palFile.Colors?.[0] || {};
const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`, `..`);
const RESULTS_PER_PAGE = 25;
const SEARCH_TTL_MS = 15 * 60 * 1000;
const searchCache = new Map();
const ITEMS_BY_ID = new Map(itemFile.Items.map(item => [item.id, item]));
const ITEMS_BY_NAME = new Map(itemFile.Items.map(item => [normalizeText(item.name), item]));
const ENCOUNTERS_BY_PAL = new Map();

for (const encounter of encounterFile.Encounters) {
	const key = normalizeText(encounter.pal);
	ENCOUNTERS_BY_PAL.set(key, [...(ENCOUNTERS_BY_PAL.get(key) || []), encounter]);
}
const WORLD_TREE_BOSS_LEVELS = new Map([
	[`dandilord`, 78],
	[`silvance`, 78],
]);
const ITEM_RARITY_COLORS = {
	Common: 0x9ca3af,
	Uncommon: 0x22c55e,
	Rare: 0x3b82f6,
	Epic: 0xa855f7,
	Legendary: 0xf59e0b,
};
const UNAUTHORIZED_CONTROL_MESSAGE = `I'm not your button, pal!`;

const ELEMENT_CHOICES = [
	{ name: `Neutral`, value: `Neutral` },
	{ name: `Fire`, value: `Fire` },
	{ name: `Water`, value: `Water` },
	{ name: `Grass`, value: `Grass` },
	{ name: `Electric`, value: `Electric` },
	{ name: `Ice`, value: `Ice` },
	{ name: `Ground`, value: `Ground` },
	{ name: `Dark`, value: `Dark` },
	{ name: `Dragon`, value: `Dragon` },
	{ name: `None`, value: `None` },
];

const RARITY_CHOICES = [
	{ name: `Unknown`, value: `Unknown` },
	{ name: `Common`, value: `Common` },
	{ name: `Rare`, value: `Rare` },
	{ name: `Epic`, value: `Epic` },
	{ name: `Legendary`, value: `Legendary` },
];
const ANCIENT_RELIC_LABEL = `Ancient Relics`;
const ANCIENT_RELIC_DROPS = new Set([
	`Decayed Ancient Relic`,
	`Dormant Ancient Relic`,
	`Glistening Ancient Relic`,
	`Glowing Ancient Relic`,
	`Gorgeous Ancient Relic`,
].map(value => value.toLowerCase()));

function splitValues(value) {
	return String(value || ``)
		.split(`,`)
		.map(entry => entry.trim())
		.filter(Boolean);
}

function uniqueSorted(values) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function worldTreeDropEntries(pal) {
	return Object.entries(pal.worldTreeDrops || {})
		.filter(([, value]) => String(value || ``).trim())
		.sort(([firstLevel], [secondLevel]) => Number(firstLevel) - Number(secondLevel));
}

function worldTreeDropValues(pal) {
	return worldTreeDropEntries(pal).flatMap(([, value]) => splitValues(value));
}

function encounterDropValues(pal) {
	return (ENCOUNTERS_BY_PAL.get(normalizeText(pal.name)) || [])
		.flatMap(encounter => encounter.drops.map(drop => drop.item));
}

function isAncientRelicDrop(value) {
	return ANCIENT_RELIC_DROPS.has(String(value || ``).trim().toLowerCase());
}

function collapseAncientRelicDrops(values) {
	const collapsed = [];
	let addedRelicLabel = false;

	for (const value of values) {
		// Keep exact relic names in palData, but avoid repeating five relic variants in the embed.
		if (isAncientRelicDrop(value)) {
			if (!addedRelicLabel) {
				collapsed.push(ANCIENT_RELIC_LABEL);
				addedRelicLabel = true;
			}

			continue;
		}

		collapsed.push(value);
	}

	return collapsed;
}

function searchableDropValues(pal) {
	const values = [
		...splitValues(pal.drops),
		...worldTreeDropValues(pal),
		...encounterDropValues(pal),
	];

	if (values.some(isAncientRelicDrop)) {
		values.push(ANCIENT_RELIC_LABEL);
	}

	return values;
}

function autocompleteDropValues(pal) {
	return [
		...splitValues(pal.drops),
		...collapseAncientRelicDrops(worldTreeDropValues(pal)),
		...encounterDropValues(pal),
	];
}

function distinctPalDrops(pal) {
	const structuredNames = itemFile.Items
		.filter(item => (item.droppedBy || []).some(drop => normalizeText(drop.pal) === normalizeText(pal.name)))
		.map(item => item.name);
	return uniqueSorted([
		...splitValues(pal.drops),
		...worldTreeDropValues(pal),
		...encounterDropValues(pal),
		...structuredNames,
	]);
}

function structuredPalDrops(pal) {
	const groups = new Map();

	for (const item of itemFile.Items) {
		for (const drop of item.droppedBy || []) {
			if (normalizeText(drop.pal) !== normalizeText(pal.name)) {
				continue;
			}

			const label = drop.variant || `Normal`;
			const key = `${label}\0${drop.level || ``}`;
			const group = groups.get(key) || { label, level: drop.level, drops: [] };
			group.drops.push({ item: item.name, probability: drop.probability, quantity: drop.quantity });
			groups.set(key, group);
		}
	}

	const worldTreeBossLevel = WORLD_TREE_BOSS_LEVELS.get(normalizeText(pal.name));
	const encounters = ENCOUNTERS_BY_PAL.get(normalizeText(pal.name)) || [];

	if (!worldTreeBossLevel) {
		const normalDrops = groups.get(`Normal\0`)?.drops || [];

		for (const group of groups.values()) {
			if (group.label !== `Alpha`) {
				continue;
			}

			// Alpha characters inherit the species' normal table in addition to their Alpha-only rows.
			const explicitNames = new Set(group.drops.map(drop => normalizeText(drop.item)));
			group.drops = [...normalDrops.filter(drop => !explicitNames.has(normalizeText(drop.item))), ...group.drops];
		}
	}

	if (worldTreeBossLevel) {
		// The game exposes generic and level-specific rows for these story bosses; present one actual encounter table.
		const bossGroups = [...groups.entries()].filter(([, group]) => group.label === `Alpha`);
		const mergedDrops = [];
		const seen = new Set();

		for (const [key, group] of bossGroups) {
			groups.delete(key);
			for (const drop of group.drops) {
				const dropKey = `${drop.item}\0${drop.quantity}\0${drop.probability}`;
				if (!seen.has(dropKey)) {
					seen.add(dropKey);
					mergedDrops.push(drop);
				}
			}
		}

		if (mergedDrops.length) {
			groups.set(`Story Boss\0${worldTreeBossLevel}`, { label: `Story Boss`, level: worldTreeBossLevel, drops: mergedDrops });
		}
	}

	for (const encounter of encounters) {
		const key = `${encounter.source}\0${encounter.level}\0${encounter.variant || ``}`;
		groups.set(key, {
			drops: encounter.drops,
			label: encounter.source,
			level: encounter.level,
			variant: encounter.variant,
		});
	}

	return [...groups.values()]
		.filter(group => group.drops.length)
		.sort((first, second) => {
			const order = { Normal: 0, Alpha: 1, "World Tree": 2, "Story Boss": 3, Rampaging: 4, "Summoning Altar": 5 };
			return (order[first.label] ?? 99) - (order[second.label] ?? 99) || (first.level || 0) - (second.level || 0);
		});
}

function formatPalDrop(drop) {
	return `• ${drop.item} ×${drop.quantity}: ${drop.probability}`;
}

function palDropFields(pal) {
	const groups = structuredPalDrops(pal);

	if (!groups.length) {
		return [{ name: `Pal Drops:`, value: splitValues(pal.drops).map(item => `• ${item}`).join(`\n`) || `None` }];
	}

	return groups.map(group => {
		const context = ` — ${group.label}${group.level ? `: Lvl ${group.level}` : ``}${group.variant ? ` (${group.variant})` : ``}`;
		return {
			name: `Pal Drops${context}`,
			value: group.drops.map(formatPalDrop).join(`\n`).slice(0, 1024),
		};
	});
}

function findItemByDropName(dropName) {
	return ITEMS_BY_NAME.get(normalizeText(dropName));
}

function palByNumber(number) {
	return PALS.find(pal => normalizeNumber(pal.number) === normalizeNumber(number));
}

function dropContext(item, pal) {
	return (item.droppedBy || []).find(drop => normalizeText(drop.pal) === normalizeText(pal.name));
}

function formatNumber(value) {
	const number = Number(value);

	return Number.isFinite(number) ? number.toLocaleString(`en-US`) : String(value);
}

const AMMO_BY_WEAPON_CLASS = {
	Bow_Fire: `Fire Arrow`,
	Bow_Poison: `Poison Arrow`,
	BowGun_Fire: `Fire Arrow`,
	BowGun_Poison: `Poison Arrow`,
	ChargeLaserRifle: `Charge Rifle Ammo`,
	CompoundBow: `Reinforced Arrow`,
	ElectricArcAssaultRifle: `Plasma Rifle Ammo`,
	EnergyRocketLauncher: `Plasma Cartridge`,
	EnergyShotgun: `Energy Shotgun Ammo`,
	Flamethrower: `Flamethrower Fuel`,
	GatlingGun: `Gatling Gun Ammo`,
	GrenadeLauncher: `Grenade Ammo`,
	GuidedMissileLauncher: `Missile Ammo`,
	LaserGatlingGun: `Laser Gatling Cartridge`,
	LaserRifle: `Energy Cartridge`,
	Launcher_Meteor: `Meteorite Ammo`,
	MakeshiftAssaultRifle: `Coarse Ammo`,
	MakeshiftHandgun: `Coarse Ammo`,
	MakeshiftShotgun: `Coarse Ammo`,
	MakeshiftSubmachineGun: `Coarse Ammo`,
	MultiGuidedMissileLauncher: `Missile Ammo`,
	Musket: `Coarse Ammo`,
	NormalLauncher: `Rocket Ammo`,
	NormalPistol: `Handgun Ammo`,
	NormalRifle: `Assault Rifle Ammo`,
	NormalSniperRifle: `Rifle Ammo`,
	OldRevolver: `Magnum Ammo`,
	PalDopingShot: `Boost Gun Ammo`,
	PalDopingShot_2: `Boost Gun Ammo`,
	SemiAutoRifle: `Rifle Ammo`,
	SFBow: `Advanced Arrow`,
	SingleShotRifle: `Rifle Ammo`,
	SkyAssaultRifle: `Heavy Assault Rifle Ammo`,
	SkyBow: `Mechanical Bow Ammo`,
	SkyGrenadeLauncher: `Tactical Grenade Launcher Ammo`,
	SkyShotgun: `Prototype Shotgun Ammo`,
	SkySubmachineGun: `Combat SMG Ammo`,
	SubmachineGun: `Machine Gun Ammo`,
	WidePenetrateShotgun: `Beam Scatter Ammo`,
};

const AMMO_BY_WEAPON_TYPE = {
	WeaponBow: `Arrow`,
	WeaponCrossbow: `Arrow`,
	WeaponHandgun: `Handgun Ammo`,
	WeaponShotgun: `Shotgun Shell`,
};

function itemAmmoType(item) {
	const properties = item.properties || {};

	return AMMO_BY_WEAPON_CLASS[properties.itemActorClass] || AMMO_BY_WEAPON_TYPE[properties.typeB];
}

function itemEffect(item) {
	const properties = item.properties || {};

	if (properties.typeB === `Accessory`) {
		// PalDB appends the localized passive name to accessory descriptions when one exists.
		const description = String(item.description || ``);
		const passiveStart = description.indexOf(`. `);
		const value = properties.passiveSkillName && passiveStart >= 0 ? description.slice(passiveStart + 2) : description;
		return { label: `Accessory Effect:`, value };
	}

	if (properties.typeB === `Drug`) {
		return { label: `Medicine Effect:`, value: item.description };
	}

	return null;
}

function buildItemEmbed(item, pal, thumbnailUrl = item.iconUrl) {
	const stats = item.stats || {};
	const ammoType = itemAmmoType(item);
	let effect = itemEffect(item);

	if (normalizeText(effect?.value) === normalizeText(item.description)) {
		effect = null;
	}

	let description = item.description;

	if (effect?.label === `Accessory Effect:` && item.description.endsWith(effect.value)) {
		description = item.description.slice(0, -effect.value.length).trim();
	}
	const fields = [
		{ name: `Category:`, value: item.category, inline: true },
	];

	if (stats.weight !== undefined) {
		fields.push({ name: `Weight:`, value: formatNumber(stats.weight), inline: true });
	}

	if (stats.maxStackCount !== undefined) {
		fields.push({ name: `Maximum Stack:`, value: formatNumber(stats.maxStackCount), inline: true });
	}

	if (stats.buyPrice !== undefined) {
		fields.push({ name: `Buy Price:`, value: formatNumber(stats.buyPrice), inline: true });
	}

	if (stats.sellPrice !== undefined) {
		fields.push({ name: `Sell Price:`, value: formatNumber(stats.sellPrice), inline: true });
	}

	if (stats.buyPrice !== undefined || stats.sellPrice !== undefined) {
		// The contextual third cell keeps both price columns stable across every item category.
		fields.push(ammoType ?
			{ name: `Ammo Type:`, value: ammoType, inline: true } :
			{ name: `\u200b`, value: `\u200b`, inline: true });
	}

	const applicableStats = [
		[`Attack`, stats.attack],
		[`Defense`, stats.defense],
		[`Health`, stats.health],
		[`Shield`, stats.shield],
		[`Nutrition`, stats.nutrition],
		[`SAN`, stats.san],
		[`Capture Power`, stats.capturePower],
		[`Speed`, stats.speed],
		[`Stamina Drain`, stats.staminaDrain],
		[`Durability`, stats.durability],
		[`Magazine Size`, item.properties?.magazineSize],
		[`Skill Power`, stats.waza],
	].filter(([, value]) => value !== undefined);

	if (effect?.value) {
		fields.push({ name: effect.label, value: effect.value.slice(0, 1024) });
	} else if (applicableStats.length) {
		fields.push({
			name: `Stats:`,
			value: applicableStats.map(([label, value]) => `${label}: **${formatNumber(value)}**`).join(` • `),
		});
	}

	const recipe = item.recipes?.[0];

	if (recipe?.ingredients?.length) {
		const ingredients = recipe.ingredients.map(ingredient => `${ingredient.name} ×${ingredient.quantity}`).join(`\n`);
		const requirement = recipe.requirement ? `\n${recipe.requirement}` : ``;

		fields.push({ name: `Crafting Materials:`, value: `${ingredients}${requirement}`.slice(0, 1024) });
	}

	if (pal) {
		const drop = dropContext(item, pal);
		const details = drop ?
			[`Drop Chance: **${drop.probability}**`, `Quantity: **${drop.quantity}**`].join(`\n`) :
			`Drop details are not available.`;

		fields.push({ name: `Dropped by ${pal.name}:`, value: details });
	}

	const embed = new EmbedBuilder()
		.setAuthor({ name: `Rarity: ${item.rarity}` })
		.setDescription(description || `No description available.`)
		.setColor(ITEM_RARITY_COLORS[item.rarity] || ITEM_RARITY_COLORS.Common)
		.setTitle(item.name)
		.addFields(fields);

	if (thumbnailUrl) {
		embed.setThumbnail(thumbnailUrl);
	}

	return embed;
}

function buildBackToPalButton(palNumber, ownerId) {
	return new ButtonBuilder()
		.setCustomId(`paldeck:back:${encodeURIComponent(palNumber)}:${ownerId}`)
		.setLabel(`Back to Pal`)
		.setStyle(ButtonStyle.Secondary);
}

function buildItemResponse(item, pal, ownerId) {
	const thumbnail = resolveLocalImage(item.iconUrl);
	const actionButtons = new ActionRowBuilder();

	if ((item.droppedBy || []).length && ownerId) {
		actionButtons.addComponents(
			new ButtonBuilder()
				.setCustomId(`item:drops:${item.id}:${ownerId}:${pal ? encodeURIComponent(pal.number) : ``}`)
				.setLabel(`View Dropping Pals`)
				.setStyle(ButtonStyle.Secondary),
		);
	}

	if (pal && ownerId) {
		actionButtons.addComponents(buildBackToPalButton(pal.number, ownerId));
	}

	const components = actionButtons.components.length ? [actionButtons] : [];

	return {
		components,
		embeds: [buildItemEmbed(item, pal, thumbnail.url)],
		files: thumbnail.files,
	};
}

function buildDropSelect(pal, userId) {
	const options = distinctPalDrops(pal)
		.map(dropName => ({ dropName, item: findItemByDropName(dropName) }))
		.filter(entry => entry.item)
		.slice(0, 25)
		.map(({ dropName, item }) => ({
			label: dropName,
			value: item.id,
		}));

	if (!options.length) {
		return null;
	}

	return new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`paldeck:drop:${encodeURIComponent(pal.number)}:${userId}`)
			.setPlaceholder(`Choose one of ${pal.name}'s drops`)
			.addOptions(options),
	);
}

function farmableValues(pal) {
	const farmable = String(pal.farmable || ``).trim();

	if (!farmable.startsWith(`Yes - `)) {
		return [];
	}

	return splitValues(farmable.slice(`Yes - `.length));
}

const AUTOCOMPLETE_CHOICES = {
	name: uniqueSorted(PALS.map(pal => pal.name)),
	suitability: uniqueSorted(PALS.flatMap(pal => splitValues(pal.suitability))),
	drops: uniqueSorted(PALS.flatMap(autocompleteDropValues)),
	farmable: uniqueSorted(PALS.flatMap(farmableValues)),
};

function normalizeText(value) {
	return String(value || ``).trim().toLowerCase();
}

function autocompleteChoices(optionName, input) {
	const choices = AUTOCOMPLETE_CHOICES[optionName] || [];

	if (optionName !== `suitability`) {
		return choices
			.filter(choice => normalizeText(choice).includes(normalizeText(input)))
			.slice(0, 25)
			.map(choice => ({ name: choice, value: choice }));
	}

	// Preserve completed suitability filters while autocomplete replaces only the active segment.
	const segments = String(input || ``).split(`,`);
	const activeInput = segments.pop().trim();
	const completed = segments.map(segment => segment.trim()).filter(Boolean);
	const completedNames = new Set(completed.map(entry => parseSuitability(entry).name));

	return choices
		.filter(choice =>
			normalizeText(choice).includes(normalizeText(activeInput)) &&
			!completedNames.has(parseSuitability(choice).name),
		)
		.map(choice => {
			const value = [...completed, choice].join(`, `);
			// Discord displays the choice name after selection, so keep it identical to the stored value.
			return { name: value, value };
		})
		.filter(choice => choice.value.length <= 100)
		.slice(0, 25);
}

function normalizeNumber(value) {
	const trimmed = String(value || ``).trim();
	const match = trimmed.match(/^(\d+)([a-z])?$/i);

	if (!match) {
		return trimmed.toLowerCase();
	}

	return `${match[1].padStart(3, `0`)}${(match[2] || ``).toLowerCase()}`;
}

function getRarity(pal) {
	if (!Number.isFinite(pal.rarity) || pal.rarity <= 0) {
		return `Unknown`;
	}

	if (pal.rarity <= 4) {
		return `Common`;
	}

	if (pal.rarity <= 7) {
		return `Rare`;
	}

	if (pal.rarity <= 10) {
		return `Epic`;
	}

	return `Legendary`;
}

function isRemoteImage(value) {
	return /^https?:\/\//i.test(String(value || ``));
}

function resolveLocalImage(imagePath) {
	const localPath = String(imagePath || ``).trim();

	if (!localPath || isRemoteImage(localPath)) {
		return { url: localPath, files: [] };
	}

	const filePath = path.resolve(PROJECT_ROOT, localPath);
	const relativePath = path.relative(PROJECT_ROOT, filePath);

	if (relativePath.startsWith(`..`) || path.isAbsolute(relativePath)) {
		return { url: localPath, files: [] };
	}

	const name = path.basename(filePath);

	return {
		url: `attachment://${name}`,
		files: [new AttachmentBuilder(filePath, { name })],
	};
}

function parseSuitability(entry) {
	const match = String(entry || ``).trim().match(/^(.*?)(?:\s+(\d+))?$/);

	if (!match) {
		return { name: ``, level: `` };
	}

	return {
		name: normalizeText(match[1]),
		level: match[2] || ``,
	};
}

function matchesSuitabilities(input, value) {
	const required = splitValues(input).map(parseSuitability).filter(entry => entry.name);
	const available = splitValues(value).map(parseSuitability);

	if (!required.length) {
		return true;
	}

	return required.every(requiredEntry =>
		available.some(availableEntry =>
			availableEntry.name.includes(requiredEntry.name) &&
			(!requiredEntry.level || availableEntry.level === requiredEntry.level),
		),
	);
}

function matchesList(input, value) {
	const required = splitValues(input).map(normalizeText);
	const available = (Array.isArray(value) ? value : splitValues(value)).map(normalizeText);

	if (!required.length) {
		return true;
	}

	return required.every(requiredEntry =>
		available.some(availableEntry => availableEntry.includes(requiredEntry)),
	);
}

function buildPalEmbed(pal, thumbnailUrl = pal.thumbnail, habitatUrl = pal.habitat) {
	const rarity = getRarity(pal);
	const wiki = encodeURIComponent(pal.name.replace(/\s+/g, `_`));
	const fields = [
		{ name: `Number:`, value: pal.number, inline: true },
		{ name: `Food:`, value: pal.food, inline: true },
		{ name: `Elements:`, value: pal.element, inline: true },
	];

	fields.push(...palDropFields(pal));

	fields.push(
		{ name: `Work Suitability:`, value: pal.suitability },
		{ name: `Partner Skill:`, value: pal.partner },
	);

	if (pal.tech) {
		fields.push({ name: `Tech:`, value: pal.tech });
	}

	const embed = new EmbedBuilder()
		.setAuthor({ name: `Rarity: ${rarity}` })
		.setDescription(pal.description)
		.setColor(getPalColor(pal, PAL_COLORS))
		.setTitle(pal.name)
		.setURL(`https://palworld.fandom.com/wiki/${wiki}`)
		.setFooter({ text: `Spawns: ${pal.spawnTime}. Farmable: ${pal.farmable}.` })
		.addFields(fields);

	if (thumbnailUrl) {
		embed.setThumbnail(thumbnailUrl);
	}

	if (habitatUrl) {
		embed.setImage(habitatUrl);
	}

	return embed;
}

function buildPalResponse(pal, userId) {
	const thumbnail = resolveLocalImage(pal.thumbnail);
	const habitat = resolveLocalImage(pal.habitat);
	const actionButtons = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`breed:parents:${encodeURIComponent(pal.name)}`)
			.setLabel(`Breeding Parents`)
			.setStyle(ButtonStyle.Primary),
	);
	const knownDrops = distinctPalDrops(pal).filter(dropName => findItemByDropName(dropName));

	if (knownDrops.length) {
		actionButtons.addComponents(
			new ButtonBuilder()
				.setCustomId(`paldeck:drops:${encodeURIComponent(pal.number)}:${userId}`)
				.setLabel(`Look Up Drops`)
				.setStyle(ButtonStyle.Secondary),
		);
	}

	return {
		embeds: [buildPalEmbed(pal, thumbnail.url, habitat.url)],
		files: [...thumbnail.files, ...habitat.files],
		components: [actionButtons],
	};
}

function criteriaHasValue(criteria) {
	return Object.values(criteria).some(value => String(value || ``).trim());
}

function buildCriteriaLine(criteria) {
	return `Element: ${criteria.element}\nSuitability: ${criteria.suitability}\nRarity:        ${criteria.rarity}\n Drops:        ${criteria.drops}\nFarmable:      ${criteria.farmable}`;
}

function findSearchResults(criteria) {
	return PALS.filter(pal => {
		if (criteria.element && !normalizeText(pal.element).includes(normalizeText(criteria.element))) {
			return false;
		}

		if (criteria.suitability && !matchesSuitabilities(criteria.suitability, pal.suitability)) {
			return false;
		}

		if (criteria.rarity && criteria.rarity !== getRarity(pal)) {
			return false;
		}

		if (criteria.drops && !matchesList(criteria.drops, searchableDropValues(pal))) {
			return false;
		}

		if (criteria.farmable && !matchesList(criteria.farmable, farmableValues(pal))) {
			return false;
		}

		return true;
	}).map(pal => ({
		element: pal.element,
		name: pal.name,
		number: pal.number,
		rarity: getRarity(pal),
	}));
}

function droppingPalResults(item) {
	const names = new Set((item.droppedBy || []).map(drop => normalizeText(drop.pal)));

	return PALS
		.filter(pal => names.has(normalizeText(pal.name)))
		.map(pal => ({
			element: pal.element,
			name: pal.name,
			number: pal.number,
			rarity: getRarity(pal),
		}));
}

async function replyWithDroppingPals(interaction, item, originPalNumber = null, ownerId = null) {
	const criteria = { element: ``, suitability: ``, rarity: ``, drops: item.name, farmable: `` };
	const results = droppingPalResults(item);

	if (!results.length) {
		await interaction.reply({ content: `No matching Pals were found.`, flags: MessageFlags.Ephemeral });
		return;
	}

	const page = 0;
	const totalPages = getTotalPages(results);
	const searchId = await storeSearch(interaction.user.id, criteria, results, originPalNumber, ownerId);

	await interaction.reply({
		embeds: [buildSearchEmbed(criteria, results, page)],
		components: buildSearchComponents(searchId, page, totalPages, originPalNumber, ownerId),
	});
}

function getTotalPages(results) {
	return Math.max(1, Math.ceil(results.length / RESULTS_PER_PAGE));
}

function clampPage(page, totalPages) {
	return Math.min(Math.max(page, 0), totalPages - 1);
}

function buildSearchEmbed(criteria, results, page) {
	const totalPages = getTotalPages(results);
	const currentPage = clampPage(page, totalPages);
	const pageResults = results.slice(currentPage * RESULTS_PER_PAGE, (currentPage + 1) * RESULTS_PER_PAGE);

	return new EmbedBuilder()
		.setTitle(`Matching:`)
		.setDescription(buildCriteriaLine(criteria))
		.setFooter({ text: `Page ${currentPage + 1}/${totalPages} | ${results.length} result(s)` })
		.addFields(
			{ name: `Name\n-------\n`, value: pageResults.map(result => result.name).join(`\n-------\n`), inline: true },
			{ name: `Element\n-------\n`, value: pageResults.map(result => result.element).join(`\n-------\n`), inline: true },
			{ name: `Rarity\n-------\n`, value: pageResults.map(result => result.rarity).join(`\n-------\n`), inline: true },
		);
}

function buildNumberMatchesEmbed(number, results) {
	return new EmbedBuilder()
		.setTitle(`Pals numbered ${number}:`)
		.setDescription(`Multiple Pals share this number.`)
		.addFields(
			{ name: `Name\n-------\n`, value: results.map(result => result.name).join(`\n-------\n`), inline: true },
			{ name: `Element\n-------\n`, value: results.map(result => result.element).join(`\n-------\n`), inline: true },
			{ name: `Rarity\n-------\n`, value: results.map(result => getRarity(result)).join(`\n-------\n`), inline: true },
		);
}

function buildSearchComponents(searchId, page, totalPages, originPalNumber = null, ownerId = null) {
	const rows = [];

	if (totalPages > 1) {
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`paldeck:page:${searchId}:${page - 1}`)
				.setLabel(`<`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`paldeck:page:${searchId}:${page + 1}`)
				.setLabel(`>`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= totalPages - 1),
		));
	}

	if (originPalNumber && ownerId) {
		rows.push(new ActionRowBuilder().addComponents(buildBackToPalButton(originPalNumber, ownerId)));
	}

	return rows;
}

async function storeSearch(userId, criteria, results, originPalNumber = null, ownerId = null) {
	const searchId = crypto.randomUUID();
	const expiresAt = Date.now() + SEARCH_TTL_MS;
	const state = { userId, criteria, results, expiresAt, originPalNumber, ownerId };
	const timeout = setTimeout(() => searchCache.delete(searchId), SEARCH_TTL_MS);

	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}

	searchCache.set(searchId, state);
	await SearchSessions.destroy({ where: { expires_at: { [Op.lte]: Date.now() } } });
	await SearchSessions.create({
		search_id: searchId,
		user_id: userId,
		criteria: JSON.stringify(criteria),
		results: JSON.stringify(results),
		expires_at: expiresAt,
	});

	return searchId;
}

async function getSearch(searchId) {
	const cachedState = searchCache.get(searchId);

	if (cachedState) {
		return cachedState;
	}

	const savedState = await SearchSessions.findOne({ where: { search_id: searchId } });

	if (!savedState) {
		return null;
	}

	if (savedState.expires_at <= Date.now()) {
		await SearchSessions.destroy({ where: { search_id: searchId } });
		return null;
	}

	const state = {
		userId: savedState.user_id,
		criteria: JSON.parse(savedState.criteria),
		results: JSON.parse(savedState.results),
		expiresAt: savedState.expires_at,
	};
	const timeout = setTimeout(
		() => searchCache.delete(searchId),
		Math.max(savedState.expires_at - Date.now(), 1),
	);

	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}

	searchCache.set(searchId, state);

	return state;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`paldeck`)
		.setDescription(`Access the paldeck.`)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`name`)
				.setDescription(`Search for a pal by name.`)
				.addStringOption(option =>
					option
						.setName(`name`)
						.setDescription(`Name of a pal.`)
						.setAutocomplete(true)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`number`)
				.setDescription(`Search for a pal by number.`)
				.addStringOption(option =>
					option
						.setName(`number`)
						.setDescription(`Number of a pal.`)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`search`)
				.setDescription(`Search for pals based on various criteria.`)
				.addStringOption(option =>
					option
						.setName(`element`)
						.setDescription(`List pals based on element type.`)
						.addChoices(...ELEMENT_CHOICES))
				.addStringOption(option =>
					option
						.setName(`suitability`)
						.setDescription(`Match all suitabilities in a comma-separated list.`)
						.setAutocomplete(true))
				.addStringOption(option =>
					option
						.setName(`rarity`)
						.setDescription(`List pals based on rarity.`)
						.addChoices(...RARITY_CHOICES))
				.addStringOption(option =>
					option
						.setName(`drops`)
						.setDescription(`Lists pals based on drops.`)
						.setAutocomplete(true))
				.addStringOption(option =>
					option
						.setName(`farmable`)
						.setDescription(`Lists pals based on farmed material.`)
						.setAutocomplete(true))),
	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
		await interaction.respond(autocompleteChoices(focusedOption.name, focusedOption.value));
	},

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === `name`) {
			const palName = interaction.options.getString(`name`);
			const pal = PALS.find(palData => normalizeText(palData.name) === normalizeText(palName));

			if (!pal) {
				await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await interaction.reply(buildPalResponse(pal, interaction.user.id));
			return;
		}

		if (subcommand === `number`) {
			const palNumber = normalizeNumber(interaction.options.getString(`number`));
			const matches = PALS.filter(palData => normalizeNumber(palData.number) === palNumber);

			if (!matches.length) {
				await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
				return;
			}

			if (matches.length > 1) {
				await interaction.reply({ embeds: [buildNumberMatchesEmbed(interaction.options.getString(`number`), matches)] });
				return;
			}

			await interaction.reply(buildPalResponse(matches[0], interaction.user.id));
			return;
		}

		const criteria = {
			element: interaction.options.getString(`element`) || ``,
			suitability: interaction.options.getString(`suitability`) || ``,
			rarity: interaction.options.getString(`rarity`) || ``,
			drops: interaction.options.getString(`drops`) || ``,
			farmable: interaction.options.getString(`farmable`) || ``,
		};

		if (!criteriaHasValue(criteria)) {
			await interaction.reply({ content: `Choose at least one search filter.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const results = findSearchResults(criteria);

		if (!results.length) {
			await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const page = 0;
		const totalPages = getTotalPages(results);
		const searchId = await storeSearch(interaction.user.id, criteria, results);

		await interaction.reply({
			embeds: [buildSearchEmbed(criteria, results, page)],
			components: buildSearchComponents(searchId, page, totalPages),
		});
	},

	async handleButton(interaction) {
		const [, action, searchId, rawPage] = interaction.customId.split(`:`);

		if (action === `back`) {
			if (rawPage !== interaction.user.id) {
				await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
				return;
			}

			const pal = palByNumber(decodeURIComponent(searchId));

			if (!pal) {
				await interaction.reply({ content: `That Pal is no longer available.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await interaction.update(buildPalResponse(pal, rawPage));
			return;
		}

		if (action === `drops`) {
			if (rawPage !== interaction.user.id) {
				await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
				return;
			}

			const pal = palByNumber(decodeURIComponent(searchId));
			const select = pal && buildDropSelect(pal, rawPage);

			if (!select) {
				await interaction.reply({ content: `No item details are available for this Pal's drops.`, flags: MessageFlags.Ephemeral });
				return;
			}

			// Keep navigation on the public Pal message so its owner can search repeatedly or return cleanly.
			const backRow = new ActionRowBuilder().addComponents(buildBackToPalButton(pal.number, rawPage));
			await interaction.update({ components: [interaction.message.components[0], select, backRow] });
			return;
		}

		if (action !== `page`) {
			await interaction.reply({ content: `Unknown Paldeck action.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const state = await getSearch(searchId);

		if (!state) {
			await interaction.reply({ content: `This search has expired. Run the command again.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (state.userId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		const totalPages = getTotalPages(state.results);
		const page = clampPage(Number(rawPage), totalPages);

		await interaction.update({
			embeds: [buildSearchEmbed(state.criteria, state.results, page)],
			components: buildSearchComponents(
				searchId,
				page,
				totalPages,
				state.originPalNumber,
				state.ownerId,
			),
		});
	},

	async handleSelectMenu(interaction) {
		const [, action, rawPalNumber, ownerId] = interaction.customId.split(`:`);

		if (action !== `drop`) {
			await interaction.reply({ content: `Unknown Paldeck menu.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (ownerId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		const pal = palByNumber(decodeURIComponent(rawPalNumber));
		const item = ITEMS_BY_ID.get(interaction.values[0]);

		if (!pal || !item || !distinctPalDrops(pal).some(drop => normalizeText(drop) === normalizeText(item.name))) {
			await interaction.reply({ content: `That drop is no longer available for this Pal.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply(buildItemResponse(item, pal, ownerId));
	},

	buildItemResponse,
	replyWithDroppingPals,
};
