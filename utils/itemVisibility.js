// Centralizes file-backed visibility rules so data refreshes, validation, and lookup tests agree.

const UNAVAILABLE_ITEM_IDS = new Set([
	`antibiotic-good`,
	`antibiotic-normal`,
	`antibiotic-super`,
	`gasoline`,
	`handgun-shield`,
	`pal-egg-mutation-pal`,
	`pal-growth-stone-l`,
	`pal-growth-stone-m`,
	`pal-growth-stone-s`,
	`pal-growth-stone-xl`,
	`pal-sphere-robbery`,
	`pickaxe-tier-03`,
	`propellant`,
	`skill-unlock-dark-mutant`,
	`sky-heavy-bullet`,
	`sky-light-bullet`,
]);

const REVIEW_EXEMPT_ITEM_IDS = new Set([
	// Ultra raids intentionally reuse the normal slab; this stray recipe is not an obtainable fragment.
	`pal-summon-night-lady-dark-parts-2`,
]);

function hasPlaceholderItemText(item) {
	const description = String(item?.description || ``).trim();
	const name = String(item?.name || ``).trim();

	return !description ||
		/^[a-z]{2}[_ ]text(?:\b|')/iu.test(description) ||
		/^\[WIP\]/iu.test(description) ||
		name === `-` ||
		description === `-` ||
		/^en[_ ]text(?:\b|')/iu.test(name);
}

function shouldHideItem(item) {
	return UNAVAILABLE_ITEM_IDS.has(item?.id) || hasPlaceholderItemText(item);
}

function availabilityEvidence(item) {
	const evidence = [];

	if (item?.recipes?.length) {
		evidence.push(`recipe`);
	}
	if (item?.droppedBy?.length) {
		evidence.push(`Pal drop`);
	}
	if (item?.acquisition?.sources?.length) {
		evidence.push(`acquisition source`);
	}
	if (item?.merchantLocations) {
		evidence.push(`merchant`);
	}

	return evidence;
}

function needsAvailabilityReview(item) {
	return item?.searchable === false &&
		!hasPlaceholderItemText(item) &&
		!REVIEW_EXEMPT_ITEM_IDS.has(item.id) &&
		availabilityEvidence(item).length > 0;
}

module.exports = {
	UNAVAILABLE_ITEM_IDS,
	availabilityEvidence,
	hasPlaceholderItemText,
	needsAvailabilityReview,
	shouldHideItem,
};
