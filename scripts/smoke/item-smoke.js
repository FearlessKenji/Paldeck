const {
	createItemSmokeContext, validateDroppingPalLookup, validateItemAutocomplete, validateItemSourceSearch,
	validateMerchantItemControls, validateSchematicNavigation,
} = require(`./item-interactions.js`);
const { createCoreItemFixtures, createMappedItemFixtures, validateCoreItemPresentation, validateItemSourceDetails, validateWorkbenchAndFixedSources } = require(`./item-presentation.js`);
const { validateRegionalItemMaps, validateTreasureAndTowerItems } = require(`./item-maps.js`);
const { validateItemCardConsistency, validateItemDescriptions, validateSchematicAndRelicItems } = require(`./item-consistency.js`);

async function validateItemLookupAndDroppingPals() {
	const context = createItemSmokeContext();
	const dropButton = await validateItemAutocomplete(context);
	await validateDroppingPalLookup(context.itemCommand, dropButton);
	await validateMerchantItemControls(context);
	await validateItemSourceSearch(context);
	await validateSchematicNavigation(context);
	const coreFixtures = createCoreItemFixtures(context);
	const fixtures = { ...coreFixtures, ...createMappedItemFixtures(context, coreFixtures) };
	validateCoreItemPresentation(context, fixtures);
	validateWorkbenchAndFixedSources(context, fixtures);
	await validateItemSourceDetails(context, fixtures);
	const regionalSummaries = validateRegionalItemMaps(context, fixtures);
	validateTreasureAndTowerItems(context, fixtures, regionalSummaries);
	const searchableItems = validateItemDescriptions(context);
	validateSchematicAndRelicItems(context, searchableItems);
	validateItemCardConsistency(context, searchableItems);
}

module.exports = { validateItemLookupAndDroppingPals };
