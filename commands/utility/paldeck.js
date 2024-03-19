const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const palFile = require('../../palData.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('paldeck')
		.setDescription('Access the paldeck.')
		.addStringOption(option =>
			option
				.setName('name')
				.setDescription('Name of a pal.'))
		.addStringOption(option =>
			option
				.setName('number')
				.setDescription('Number of a pal.'))
		.addStringOption(option =>
			option
				.setName('element')
				.setDescription('List pals based on element type.'))
		.addStringOption(option =>
			option
				.setName('suitability')
				.setDescription('List pals based on suitabilities.'))
		.addStringOption(option =>
			option
				.setName('rarity')
				.setDescription('List pals based on rarity.')
				.addChoices(
					{ name: 'Common', value: 'Common' },
					{ name: 'Rare', value: 'Rare' },
					{ name: 'Epic', value: 'Epic' },
					{ name: 'Legendary', value: 'Legendary' },
				)),

	async execute(interaction) {
		const palName = interaction.options.getString('name') || '';
		let palNumber = interaction.options.getString('number') || '';
		const palElement = interaction.options.getString('element') || '';
		const palSuitability = interaction.options.getString('suitability') || '';
		const palRarity = interaction.options.getString('rarity') || '';

		if (!Number(palNumber)) {
			palNumber = palNumber.padStart(4, 0);
		}
		else {
			palNumber = palNumber.padStart(3, 0);
		}

		let rarity = '';
		const results = [];
		for (const palData of palFile.Pals) {
			if (palData.rarity <= 4) {
				rarity = 'Common';
			}
			else if (palData.rarity > 4 && palData.rarity <= 7) {
				rarity = 'Rare';
			}
			else if (palData.rarity > 7 && palData.rarity <= 10) {
				rarity = 'Epic';
			}
			else {
				rarity = 'Legendary';
			}
			if (palName.toLowerCase() === palData.name.toLowerCase() || palNumber === palData.number) {
				const breed = palData.name.toLowerCase().replace(' ', '-');
				const wiki = palData.name.toLowerCase().replace(' ', '_');
				const palEmbed = new EmbedBuilder()
					.setAuthor({ name: `Rarity: ${rarity}(${palData.rarity}) `, url: `https://palworld.fandom.com/wiki/${wiki}` })
					.setColor(palData.color)
					.setTitle(palData.name)
					.setURL(`https://paldex.gg/breeding-calculator?child=${breed}&parent1=${breed}`)
					.setThumbnail(palData.thumbnail)
					.setImage(palData.habitat)
					.setFooter({ text: `Spawns: ${palData.spawnTime}. Farmable: ${palData.farmable}.` })
					.addFields(
						{ name: 'Number:', value: palData.number, inline: true },
						{ name: 'Food:', value: palData.food, inline: true },
						{ name: 'Elements:', value: palData.element, inline: true },
						{ name: 'Drops:', value: palData.drops },
						{ name: 'Work Suitability:', value: palData.suitability },
						{ name: 'Partner Skill:', value: palData.partner },
						(palData.tech ? {	name: 'Tech:', value: palData.tech } : {	name: '\u200B',	value: '\u200B' }),
					);
				await interaction.reply({ embeds: [palEmbed] });
				return;
			}

			const matchesRarity = palRarity !== '' && palRarity === rarity;
			const matchesElement = palElement !== '' && palData.element.toLowerCase().includes(palElement.toLowerCase());
			const matchesSuitability = palSuitability !== '' && palData.suitability.toLowerCase().includes(palSuitability.toLowerCase());
			// Solo Element
			if (matchesElement && palSuitability === '' && palRarity === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Element + Suitability
			else if (matchesElement && matchesSuitability && palRarity === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Element + Rarity
			else if (matchesElement && matchesRarity && palSuitability === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Element + Suitability + Rarity
			else if (matchesElement && matchesSuitability && matchesRarity) {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Solo Suitability
			else if (matchesSuitability && palElement === '' && palRarity === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Suitability + Rarity
			else if (matchesSuitability && matchesRarity && palElement === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
			// Solo Rarity
			else if (matchesRarity && palElement === '' && palSuitability === '') {
				results.push(
					`${palData.name} | ${palData.element} | ${rarity}(${palData.rarity})`,
				);
			}
		}
		if (results[0]) {
			const palEmbed = new EmbedBuilder().setDescription(results.map((e, i) => (i + 1 + '') + '. ' + e).join('\n'));
			await interaction.reply({ embeds: [palEmbed] });
			return;
		}
		else {
			await interaction.reply({ content: 'Nothing found.', ephemeral: true });
			return;
		}
	},
};