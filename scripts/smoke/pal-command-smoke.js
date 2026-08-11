const { assert, requireFresh, serializeDiscordPayload } = require(`./shared.js`);

async function validatePaldeckFarmableSearch() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const searchCommand = paldeck.data.toJSON().options.find(option => option.name === `search`);
	const farmableOption = searchCommand?.options?.find(option => option.name === `farmable`);
	let autocompleteChoices = [];

	assert(farmableOption, `/paldeck search is missing the farmable option.`);
	assert(farmableOption.autocomplete === true, `/paldeck search farmable should use autocomplete.`);

	await paldeck.autocomplete({
		options: {
			getFocused: () => ({ name: `farmable`, value: `oil` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(autocompleteChoices.some(choice => choice.value === `High Quality Pal Oil`), `Farmable autocomplete did not include High Quality Pal Oil.`);
	assert(
		autocompleteChoices.every(choice => !choice.name.startsWith(`Yes - `) && !choice.value.startsWith(`Yes - `)),
		`Farmable autocomplete should not include the Yes - prefix.`,
	);
}

async function validatePaldeckSuitabilityListAutocomplete() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const searchCommand = paldeck.data.toJSON().options.find(option => option.name === `search`);
	const suitabilityOption = searchCommand?.options?.find(option => option.name === `suitability`);
	let autocompleteChoices = [];

	assert(suitabilityOption, `/paldeck search is missing the suitability option.`);
	assert(
		suitabilityOption.description.toLowerCase().includes(`comma-separated`),
		`/paldeck search should explain that suitability accepts a comma-separated list.`,
	);

	await paldeck.autocomplete({
		options: {
			getFocused: () => ({ name: `suitability`, value: `Mining 2, hand` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(
		autocompleteChoices.some(choice =>
			choice.name === `Mining 2, Handiwork 1` &&
			choice.value === `Mining 2, Handiwork 1`,
		),
		`Suitability autocomplete should preserve completed filters in both the displayed and submitted choice.`,
	);
	assert(
		autocompleteChoices.every(choice =>
			choice.name.startsWith(`Mining 2, `) &&
			choice.value.startsWith(`Mining 2, `),
		),
		`Suitability autocomplete dropped a completed filter from a choice label or value.`,
	);
	assert(
		autocompleteChoices.every(choice => !choice.value.slice(`Mining 2, `.length).startsWith(`Mining`)),
		`Suitability autocomplete should not suggest a suitability that is already selected.`,
	);
}

async function validateBreedAutocompleteUsesPalData() {
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	let autocompleteChoices = [];

	await breed.autocomplete({
		options: {
			getFocused: () => ({ name: `parent1`, value: `xeno` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(autocompleteChoices.some(choice => choice.value === `Xenovader`), `Breed parent autocomplete did not include Xenovader from palData.`);
	assert(autocompleteChoices.some(choice => choice.name === `Xenovader`), `Breed parent autocomplete should display plain Pal names.`);
	assert(
		autocompleteChoices.every(choice => !/\bTechnology\s+\d+\b/i.test(choice.name)),
		`Breed parent autocomplete should not expose Technology unlock text.`,
	);
}

async function runBreedCommand(breed, subcommand, values) {
	let replyPayload = null;

	await breed.execute({
		options: {
			getString: name => values[name],
			getSubcommand: () => subcommand,
		},
		reply: payload => {
			replyPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	return replyPayload;
}

async function validateBreedResultsUsePlainNames() {
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	const numberPrefixedPalPattern = /#\d{1,3}[A-Z]?\s+[A-Za-z]/;
	const formulaDetailLabels = [
		`Child Rank`,
		`Gender-specific known result`,
		`Method`,
		`Parent Ranks`,
		`Same species`,
		`Source override`,
		`Standard rank`,
		`Target rank`,
		`Unique combination`,
	];
	const resultPayload = await runBreedCommand(breed, `result`, {
		parent1: `Lamball`,
		parent2: `Lamball`,
	});
	const uniqueResultPayload = await runBreedCommand(breed, `result`, {
		parent1: `Relaxaurus`,
		parent2: `Sparkit`,
	});
	const parentsPayload = await runBreedCommand(breed, `parents`, {
		child: `Lamball`,
	});
	const uniqueParentsPayload = await runBreedCommand(breed, `parents`, {
		child: `Relaxaurus Lux`,
	});
	const partnerPayload = await runBreedCommand(breed, `partner`, {
		child: `Lamball`,
		parent: `Lamball`,
	});
	const uniquePartnerPayload = await runBreedCommand(breed, `partner`, {
		child: `Relaxaurus Lux`,
		parent: `Relaxaurus`,
	});
	const serializedOutput = [
		serializeDiscordPayload(resultPayload),
		serializeDiscordPayload(uniqueResultPayload),
		serializeDiscordPayload(parentsPayload),
		serializeDiscordPayload(uniqueParentsPayload),
		serializeDiscordPayload(partnerPayload),
		serializeDiscordPayload(uniquePartnerPayload),
	].join(`\n`);

	assert(resultPayload?.embeds?.length, `/breed result did not produce an embed.`);
	assert(uniqueResultPayload?.embeds?.length, `/breed result did not produce a unique-combination embed.`);
	assert(parentsPayload?.embeds?.length, `/breed parents did not produce an embed.`);
	assert(uniqueParentsPayload?.embeds?.length, `/breed parents did not produce a unique-combination embed.`);
	assert(partnerPayload?.embeds?.length, `/breed partner did not produce an embed.`);
	assert(uniquePartnerPayload?.embeds?.length, `/breed partner did not produce a unique-combination embed.`);
	assert(serializedOutput.includes(`Lamball`), `/breed command smoke output should include the test Pal name.`);
	assert(!numberPrefixedPalPattern.test(serializedOutput), `/breed results should show plain Pal names without number prefixes.`);
	for (const label of formulaDetailLabels) {
		assert(!serializedOutput.includes(label), `/breed results should not show formula detail label: ${label}.`);
	}
}

async function validatePaldeckBreedingButton() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	let paldeckPayload = null;
	let breedingPayload = null;

	await paldeck.execute({
		options: {
			getString: () => `Lamball`,
			getSubcommand: () => `name`,
		},
		reply: payload => {
			paldeckPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			paldeckPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	const serializedPaldeck = serializeDiscordPayload(paldeckPayload);
	const buttonCustomId = paldeckPayload?.components?.[0]?.components?.[0]?.data?.custom_id;

	assert(
		buttonCustomId === `breed:parents:Lamball:smoke-test-user:001`,
		`/paldeck should include an owned breeding-parent button with its Pal origin.`,
	);
	assert(serializedPaldeck.includes(`Breeding Parents`), `/paldeck breeding-parent button should have a clear label.`);
	assert(!serializedPaldeck.includes(`palworld.gg/breeding-calculator`), `/paldeck rarity should not link to an external breeding calculator.`);
	assert(serializedPaldeck.includes(`palworld.fandom.com/wiki/Lamball`), `/paldeck Pal name should retain its Fandom wiki link.`);
	assert(serializedPaldeck.includes(`Wool ×1–3: 100%`), `/paldeck should show structured drop quantities and probabilities with colons.`);

	await breed.handleButton({
		customId: buttonCustomId,
		update: payload => {
			breedingPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	const serializedBreeding = serializeDiscordPayload(breedingPayload);

	assert(breedingPayload?.embeds?.length, `/paldeck breeding-parent button did not produce an embed.`);
	assert(serializedBreeding.includes(`Parent pairs that produce Lamball.`), `/paldeck breeding-parent button returned the wrong child results.`);
	assert(serializedBreeding.includes(`Back to Pal`), `Breeding results opened from a Pal should include Back to Pal navigation.`);
}

async function validatePaldeckLearnedMoves() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	let palPayload = null;
	let movesPayload = null;
	await paldeck.execute({
		options: { getString: () => `Lamball`, getSubcommand: () => `name` },
		reply: payload => { palPayload = payload; },
		user: { id: `moves-owner` },
	});

	const movesButton = palPayload.components[0].components.find(component => component.data.label === `Learned Moves`);
	assert(movesButton, `Pal cards should include Learned Moves when level-up data is available.`);
	await paldeck.handleButton({
		customId: movesButton.data.custom_id,
		update: payload => { movesPayload = payload; },
		user: { id: `moves-owner` },
	});

	const serializedMoves = serializeDiscordPayload(movesPayload);
	assert(serializedMoves.includes(`Lamball — Learned Moves`), `Learned Moves should identify the selected Pal.`);
	assert(serializedMoves.includes(`Lv. 1`) && serializedMoves.includes(`Roly Poly`), `Learned Moves should show move levels and names.`);
	assert(serializedMoves.includes(`Back to Pal`), `Learned Moves should provide Back to Pal navigation.`);
	assert(!serializedMoves.includes(`replaces`), `Learned Moves should not invent move-replacement relationships.`);
}

async function validateGroupedPalDrops() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const render = async name => {
		let payload;
		await paldeck.execute({
			options: { getString: () => name, getSubcommand: () => `name` },
			reply: value => { payload = value; },
			deferReply: () => undefined,
			editReply: value => { payload = value; },
			user: { id: `grouped-drop-owner` },
		});
		return serializeDiscordPayload(payload);
	};
	const dandilord = await render(`Dandilord`);
	const bellanoir = await render(`Bellanoir`);
	const bellanoirLibero = await render(`Bellanoir Libero`);
	const blazamutRyu = await render(`Blazamut Ryu`);
	const xenolord = await render(`Xenolord`);
	const hartalis = await render(`Hartalis`);
	const lamball = await render(`Lamball`);

	assert(lamball.includes(`Pal Drops — Alpha`), `Lamball should identify its Alpha drop table.`);
	assert(
		lamball.match(/Wool ×1–3: 100%/g)?.length === 2 &&
		lamball.match(/Lamball Mutton ×1: 100%/g)?.length === 2,
		`Lamball's Alpha table should repeat its inherited normal drops.`,
	);
	assert(lamball.includes(`Ancient Civilization Parts ×1–2: 100%`) && lamball.includes(`Precious Pelt ×1–2: 100%`), `Lamball's Alpha table should include its Alpha-only drops.`);
	assert(lamball.indexOf(`Lamball Mutton ×1: 100%`) < lamball.indexOf(`Wool ×1–3: 100%`), `Equal-chance Pal drops should use alphabetical tie-breaking.`);
	assert(dandilord.includes(`Pal Drops — Normal`) && dandilord.includes(`Pal Drops — World Tree: Lvl 70`), `Dandilord should separate normal and World Tree Pal drops.`);
	assert(dandilord.includes(`Ancient Civilization Core ×1: 100%`), `Dandilord should show its butcherable Ancient Civilization Core drop.`);
	assert(
		dandilord.includes(`Pal Drops — Story Boss: Lvl 78`) &&
		dandilord.includes(`Dandilord's Petal ×1: 100%`),
		`Dandilord should combine its boss rows and show its progression drop once.`,
	);
	assert(dandilord.match(/Dandilord's Petal/g)?.length === 1, `Dandilord's Petal should not be duplicated outside the Boss group.`);
	assert(
		dandilord.includes(`Decayed Ancient Relic ×1–10: 10%`) &&
		dandilord.includes(`Dormant Ancient Relic ×1–5: 5%`),
		`Detailed Pal cards should keep Ancient Relic tiers separate when their drop rates differ.`,
	);
	assert(!dandilord.includes(`• Ancient Relics`), `Detailed Pal cards should not flatten percentage-bearing Ancient Relic rows.`);
	assert(bellanoir.includes(`Pal Drops — Normal`) && bellanoir.includes(`Dark Fragment ×2–3: 100%`), `Bellanoir should retain its normal captured-Pal drops.`);
	assert(bellanoir.includes(`Pal Drops — Alpha`), `Bellanoir should keep its Alpha drops separate from Summoning Altar rewards.`);
	assert(bellanoir.includes(`Pal Drops — Summoning Altar: Lvl 35`), `Bellanoir should separate Summoning Altar rewards.`);
	assert(bellanoir.includes(`Huge Dark Egg (Bellanoir) ×1: 100%`), `Bellanoir's Raid Boss rewards should include its guaranteed egg.`);
	assert(bellanoir.includes(`Ancient Civilization Core ×1–3: 100%`), `Bellanoir should use its complete current Summoning Altar table.`);
	assert(
		bellanoirLibero.includes(`Pal Drops — Summoning Altar: Lvl 45`) &&
		bellanoirLibero.includes(`Pal Drops — Summoning Altar: Lvl 80 (Ultra)`),
		`Bellanoir Libero should show both its base and Ultra Summoning Altar tables.`,
	);
	assert(bellanoirLibero.includes(`Witch's Crown ×1: 100%`), `Bellanoir Libero's Ultra table should include Witch's Crown.`);
	for (const [name, card, egg, ultraReward] of [
		[`Blazamut Ryu`, blazamutRyu, `Huge Dragon Egg (Blazamut Ryu)`, `Horns of Supremacy`],
		[`Xenolord`, xenolord, `Huge Dark Egg (Xenolord)`, `Xenolord's head`],
		[`Hartalis`, hartalis, `Huge Common Egg (Hartalis)`, `Crown of Salvation`],
	]) {
		assert(
			card.includes(`Pal Drops — Summoning Altar`) && card.includes(`Pal Drops — Summoning Altar: Lvl 80 (Ultra)`),
			`${name} should show both its base and Ultra Summoning Altar tables.`,
		);
		assert(card.includes(`${egg} ×1: 100%`), `${name}'s Summoning Altar tables should include its guaranteed egg.`);
		assert(card.includes(`${ultraReward} ×1: 100%`), `${name}'s Ultra table should include ${ultraReward}.`);
	}
}

function validateEncounterDropData() {
	const encounterFile = requireFresh(`data`, `palEncounterData.json`);
	const palFile = requireFresh(`data`, `palData.json`);
	const visibleNames = new Set(palFile.Pals.filter(pal => !pal.hidden).map(pal => pal.name));
	const keys = new Set();
	const affectedPals = new Set();

	for (const encounter of encounterFile.Encounters) {
		const key = `${encounter.pal}\0${encounter.source}\0${encounter.level}\0${encounter.variant || ``}`;
		assert(visibleNames.has(encounter.pal), `Encounter drops reference unknown Pal ${encounter.pal}.`);
		assert(!keys.has(key), `Encounter drops contain duplicate source ${key}.`);
		assert(encounter.source === `Summoning Altar`, `${encounter.pal} has an unsupported encounter source.`);
		assert(Number.isInteger(encounter.level) && encounter.level > 0, `${encounter.pal} encounter is missing a valid level.`);
		assert(encounter.drops.length > 0, `${encounter.pal} encounter has no drops.`);
		assert(encounter.drops.every(drop => drop.item && drop.quantity && drop.probability), `${encounter.pal} encounter has an incomplete drop row.`);
		assert(encounter.drops.some(drop => / Egg \(/.test(drop.item) && drop.probability === `100%`), `${encounter.pal} encounter is missing its guaranteed egg.`);
		keys.add(key);
		affectedPals.add(encounter.pal);
	}

	assert(affectedPals.size === 5, `Expected five Pal lookups with Summoning Altar reward tables.`);
}

function palDropMenuControls(menuPayload) {
	const menu = menuPayload?.components?.[1]?.components?.[0];
	return {
		menuData: menu?.toJSON?.() || menu?.data,
		menuBackButton: menuPayload?.components?.[2]?.components?.[0],
	};
}

async function openPalDropMenu(paldeck) {
	let paldeckPayload = null;
	let menuPayload = null;
	await paldeck.execute({
		options: {
			getString: () => `Lamball`,
			getSubcommand: () => `name`,
		},
		reply: payload => {
			paldeckPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			paldeckPayload = payload;
		},
		user: { id: `drop-owner` },
	});

	const dropButton = paldeckPayload.components[0].components.find(component => component.data.label === `Look Up Drops`);

	assert(dropButton, `Lamball's Pal lookup should include a Look Up Drops button.`);
	await paldeck.handleButton({
		customId: dropButton.data.custom_id,
		message: { components: paldeckPayload.components },
		update: payload => {
			menuPayload = payload;
		},
		user: { id: `drop-owner` },
	});

	const { menuBackButton, menuData } = palDropMenuControls(menuPayload);

	assert(menuData?.options?.some(option => option.label === `Wool`), `Lamball's drop menu should include Wool.`);
	assert(menuBackButton?.data?.label === `Back to Pal`, `The Pal drop menu should include Back to Pal navigation.`);
	return menuData;
}

async function selectPalDrop(paldeck, menuData) {
	let itemPayload = null;
	await paldeck.handleSelectMenu({
		customId: menuData.custom_id,
		update: payload => {
			itemPayload = payload;
		},
		user: { id: `drop-owner` },
		values: [`wool`],
	});

	const serializedItem = serializeDiscordPayload(itemPayload);

	assert(itemPayload?.embeds?.length, `Selecting Wool should send an item embed.`);
	assert(!itemPayload.flags, `Successful drop item lookups should be public.`);
	assert(serializedItem.includes(`Drop Chance: **100%**`), `Wool should show its Lamball drop chance.`);
	assert(serializedItem.includes(`Quantity: **1–3**`), `Wool should show its Lamball drop quantity.`);
	assert(!serializedItem.includes(`Items/Wool`) && !serializedItem.includes(`paldb.cc`), `Item embeds should hide internal codes and PalDB links.`);
	const itemBackButton = itemPayload.components[0].components.find(component => component.data.label === `Back to Pal`);
	const droppingPalsButton = itemPayload.components[0].components.find(component => component.data.label === `View Dropping Pals`);

	assert(itemBackButton, `Items opened from a Pal should retain Back to Pal navigation.`);
	return { itemBackButton, itemPayload, droppingPalsButton };
}

async function validatePalDropNavigation(context) {
	const { droppingPalsButton, itemBackButton, itemCommand, menuData, paldeck } = context;
	let droppingPalsPayload = null;
	let restoredPalPayload = null;
	let unauthorizedPayload = null;
	await itemCommand.handleButton({
		customId: droppingPalsButton.data.custom_id,
		update: payload => {
			droppingPalsPayload = payload;
		},
		user: { id: `drop-owner` },
	});
	assert(
		serializeDiscordPayload(droppingPalsPayload).includes(`Back to Pal`),
		`Dropping-Pal results should retain Back to Pal when reached from a Pal lookup.`,
	);
	await paldeck.handleButton({
		customId: itemBackButton.data.custom_id,
		update: payload => {
			restoredPalPayload = payload;
		},
		user: { id: `drop-owner` },
	});
	assert(serializeDiscordPayload(restoredPalPayload).includes(`Lamball`), `Back to Pal should restore the originating Pal card.`);

	await paldeck.handleSelectMenu({
		customId: menuData.custom_id,
		reply: payload => {
			unauthorizedPayload = payload;
		},
		user: { id: `someone-else` },
		values: [`wool`],
	});

	assert(unauthorizedPayload?.content === `I'm not your button, pal!`, `Unauthorized drop controls should use the requested response.`);
}

async function validatePaldeckDropLookup() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const itemCommand = requireFresh(`commands`, `globalCommands`, `utility`, `item.js`);
	const menuData = await openPalDropMenu(paldeck);
	const selectedDrop = await selectPalDrop(paldeck, menuData);
	await validatePalDropNavigation({ ...selectedDrop, itemCommand, menuData, paldeck });
}

module.exports = {
	validateBreedAutocompleteUsesPalData, validateBreedResultsUsePlainNames, validateEncounterDropData,
	validateGroupedPalDrops, validatePaldeckBreedingButton, validatePaldeckDropLookup,
	validatePaldeckLearnedMoves,
	validatePaldeckFarmableSearch, validatePaldeckSuitabilityListAutocomplete,
};
