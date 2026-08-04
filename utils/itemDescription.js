// Cleans PalDB link-boundary artifacts and lays out appended equipment effects for readable item cards.
const EFFECT_LABELS = [
	`Logging Yield Up`, `Mining Yield Up`, `Pal Attack Up`, `Pal Defense Up`, `Pal EXP Up`,
	`Cold Resistance`, `Heat Resistance`, `Electric Damage Reduction`, `Fire Damage Reduction`,
	`Grass Damage Reduction`, `Ground Damage Reduction`, `Ice Damage Reduction`, `Water Damage Reduction`,
	`Dark Damage Reduction`, `Dragon Damage Reduction`, `Neutral Damage Reduction`, `Damage Reduction`,
	`Damage Enhancement`, String.raw`Attack Up(?: \(S\))?`, `Defense Up`, `Health Up`, `EXP Up`,
	`Speedy Worker`, `Yield Up`, `Max Carrying Capacity`, `Carrying Capacity`,
];
const EFFECT_LABEL = `(?:${EFFECT_LABELS.join(`|`)})`;
const EFFECT_PATTERN = new RegExp(String.raw`${EFFECT_LABEL} Lv\. (?:\d+|\?+)`, `gu`);

function normalizeItemDescription(value, { formatEffects = false } = {}) {
	let description = String(value || ``)
		.replace(/\s+([,.;:!?])/gu, `$1`)
		.replace(/\s+'s\b/gu, `'s`)
		.replace(/\b([A-Za-z]+) s\b/gu, `$1s`)
		.replace(/(['"])[ \t]+|[ \t]+(['"])/gu, `$1$2`)
		.replace(/[ \t]{2,}/gu, ` `)
		// Repair a small set of confirmed English localization errors without changing stored game text.
		.replace(/\bA Incendiary Grenade\b/giu, `An Incendiary Grenade`)
		.replace(/\bA Ice Grenade\b/giu, `An Ice Grenade`)
		.replace(/\b(the (?:high-quality )?metal tip) give\b/giu, `$1 gives`)
		.replace(/\b(its sharpness and durability) has improved\b/giu, `$1 have improved`)
		.replace(/\ba Eikthyrdeer\b/giu, `an Eikthyrdeer`)
		.trim();

	if (formatEffects) {
		description = description.replace(
			new RegExp(String.raw`[ \t]+(${EFFECT_LABEL})(?= Lv\. (?:\d+|\?+))`, `gu`),
			`\n$1`,
		);
	}

	return description;
}

function itemDescriptionParts(value) {
	const normalized = normalizeItemDescription(value);
	const perks = [...normalized.matchAll(EFFECT_PATTERN)].map(match => match[0]);
	const description = normalized
		.replace(EFFECT_PATTERN, ``)
		.replace(/[ \t]{2,}/gu, ` `)
		.replace(/\s+$/gu, ``)
		.trim();

	return { description, perks };
}

module.exports = { itemDescriptionParts, normalizeItemDescription };
