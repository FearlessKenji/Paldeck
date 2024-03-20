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
				.setDescription('List pals based on element type.')
				.addChoices(
					{ name: 'Neutral', value: 'Neutral' },
					{ name: 'Fire', value: 'Fire' },
					{ name: 'Water', value: 'Water' },
					{ name: 'Grass', value: 'Grass' },
					{ name: 'Electric', value: 'Electric' },
					{ name: 'Ice', value: 'Ice' },
					{ name: 'Ground', value: 'Ground' },
					{ name: 'Dark', value: 'Dark' },
					{ name: 'Dragon', value: 'Dragon' },
				))
		.addStringOption(option =>
			option
				.setName('suitability')
				.setDescription('List pals based on suitabilities.'),
			/* .setChoices(
					{ name: 'Kindling', value: 'Kindling' },
					{ name: 'Watering', value: 'Watering' },
					{ name: 'Planting', value: 'Planting' },
					{ name: 'Generating Electricity', value: 'Generating Electricity' },
					{ name: 'Handiwork', value: 'Handiwork' },
					{ name: 'Gathering', value:'Gathering' },
					{ name: 'Lumbering', value: 'Lumbering' },
					{ name: 'Mining', value: 'Mining' },
					{ name: 'Medicine Production', value: 'Medicine Production' },
					{ name: 'Cooling', value: 'Cooling' },
					{ name: 'Transporting', value: 'Transporting' },
					{ name: 'Farming', value: 'Farming' },
				)*/)
		.addStringOption(option =>
			option
				.setName('rarity')
				.setDescription('List pals based on rarity.')
				.addChoices(
					{ name: 'Common', value: 'Common' },
					{ name: 'Rare', value: 'Rare' },
					{ name: 'Epic', value: 'Epic' },
					{ name: 'Legendary', value: 'Legendary' },
				))
		.addStringOption(option =>
			option
				.setName('drops')
				.setDescription('Lists pals based on drops.')),

	async execute(interaction) {
		const palName = interaction.options.getString('name') || '';
		let palNumber = interaction.options.getString('number') || '';
		const palElement = interaction.options.getString('element') || '';
		const palSuitability = interaction.options.getString('suitability') || '';
		const palRarity = interaction.options.getString('rarity') || '';
		const palDrops = interaction.options.getString('drops') || '';

		if (!Number(palNumber)) {
			palNumber = palNumber.padStart(4, 0);
		}
		else {
			palNumber = palNumber.padStart(3, 0);
		}

		let rarity = '';
		const resNames = [];
		const resElement = [];
		const resRarity = [];
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
			const matchesDrops = palDrops !== '' && palData.drops.toLowerCase().includes(palDrops.toLowerCase());
			// Solo Element
			if (matchesElement && palSuitability === '' && palRarity === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Element + Suitability
			else if (matchesElement && matchesSuitability && palRarity === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Element + Rarity
			else if (matchesElement && matchesRarity && palSuitability === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Element + Drops
			else if (matchesElement && matchesDrops && palSuitability === '' && palRarity === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Element + Suitability + Rarity
			else if (matchesElement && matchesSuitability && matchesRarity && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Element + Suitability + Rarity + Drops
			else if (matchesElement && matchesSuitability && matchesRarity && matchesDrops) {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Solo Suitability
			else if (matchesSuitability && palElement === '' && palRarity === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Suitability + Rarity
			else if (matchesSuitability && matchesRarity && palElement === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Suitabiliy + Drops
			else if (matchesSuitability && matchesDrops && palElement === '' && palRarity === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Suitability + Rarity + Drops
			else if (matchesSuitability && matchesRarity && matchesDrops && palElement === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Solo Rarity
			else if (matchesRarity && palElement === '' && palSuitability === '' && palDrops === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Rarity + Drops
			else if (matchesRarity && matchesDrops && palElement === '' && palSuitability === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
			// Solo Drops
			else if (matchesDrops && palElement === '' && palSuitability === '' && palRarity === '') {
				resNames.push(palData.name);
				resElement.push(palData.element);
				resRarity.push(rarity);
			}
		}
		if (resNames[0] && resElement[0] && resRarity[0]) {
			const palEmbed = new EmbedBuilder()
				.setTitle('Matching:')
				.setDescription(`Element: ${palElement}\nSuitability: ${palSuitability}\nRarity:        ${palRarity}\n Drops:        ${palDrops}`)
				.addFields(
					{ name: 'Name\n-------\n', value: resNames.join('\n-------\n'), inline:true },
					{ name: 'Element\n-------\n', value: resElement.join('\n-------\n'), inline:true },
					{ name: 'Rarity\n-------\n', value: resRarity.join('\n-------\n'), inline: true },
				);
				// .setDescription(results.map((e, i) => (i + 1 + '') + '. ' + e).join('\n'));
			await interaction.reply({ embeds: [palEmbed] });
			return;
		}
		else {
			await interaction.reply({ content: 'Nothing found.', ephemeral: true });
			return;
		}
	},
};