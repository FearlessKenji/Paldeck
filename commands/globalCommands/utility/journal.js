// Searches the installed-game journal catalog and displays the localized note with its individual location map.
const path = require(`node:path`);
const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } = require(`discord.js`);
const journalData = require(`../../../data/journalData.json`);
const { resolvedItemData } = require(`../../../utils/itemData.js`);

const JOURNALS = journalData.Journals;
const JOURNAL_ITEMS = resolvedItemData().Items.filter(item => item.journalEntry);
const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`, `..`);

function normalize(value) {
	return String(value || ``).normalize(`NFKD`).replace(/[’']/gu, ``).replace(/[^a-z0-9]+/giu, ``).toLowerCase();
}

function chunks(value, limit = 4096) {
	const output = [];
	let current = ``;
	for (const paragraph of String(value || ``).split(/\n{2,}/u)) {
		const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
		if (candidate.length > limit && current) {
			output.push(current);
			current = paragraph;
		} else {
			current = candidate;
		}
	}
	if (current) {
		output.push(current);
	}
	return output;
}

module.exports = {
	data: new SlashCommandBuilder().setName(`journal`).setDescription(`Look up a Palworld journal or note.`)
		.addStringOption(option => option.setName(`name`).setDescription(`Journal or note to look up.`).setAutocomplete(true).setRequired(true)),

	async autocomplete(interaction) {
		const needle = normalize(interaction.options.getFocused());
		await interaction.respond(JOURNALS.filter(journal => normalize(journal.title).includes(needle)).slice(0, 25)
			.map(journal => ({ name: journal.title.slice(0, 100), value: journal.id })));
	},

	async execute(interaction) {
		const query = interaction.options.getString(`name`);
		const journal = JOURNALS.find(value => value.id === query) || JOURNALS.find(value => normalize(value.title) === normalize(query));
		if (!journal) {
			await interaction.reply({ content: `Nothing found.`, ephemeral: true });
			return;
		}
		const descriptions = chunks(journal.description || `No journal text is available.`);
		const embeds = descriptions.map((description, index) => new EmbedBuilder()
			.setTitle(index ? `${journal.title} (continued)` : journal.title).setDescription(description).setColor(0x9ca3af));
		const files = [];
		const journalItem = JOURNAL_ITEMS.find(item => normalize(item.journalEntry?.sourceName || item.name) === normalize(journal.title));
		const individualMap = journalItem?.acquisition?.map || journal.map;
		if (individualMap) {
			const mapPath = path.resolve(PROJECT_ROOT, individualMap);
			const name = path.basename(mapPath);
			files.push(new AttachmentBuilder(mapPath, { name }));
			embeds[0].setImage(`attachment://${name}`);
		}
		await interaction.reply({ embeds, files });
	},
};
