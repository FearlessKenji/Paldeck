const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const palFile = require('../../../palData.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('paldeck')
		.setDescription('Access the paldeck.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('name')
				.setDescription('Search for a pal by name.')
				.addStringOption(option =>
					option
						.setName('name')
						.setDescription('Name of a pal.')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('number')
				.setDescription('Search for a pal by number.')
				.addStringOption(option =>
					option
						.setName('number')
						.setDescription('Number of a pal.')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('search')
				.setDescription('Search for pals based on various criteria.')
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
						.setDescription('List pals based on suitabilities.')
						.setAutocomplete(true))
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
						.setDescription('Lists pals based on drops.')
						.setAutocomplete(true))),
	async autocomplete(interaction) {
		if (!interaction.isAutocomplete()) return;
		const focusedOption = interaction.options.getFocused(true);
		let choices;

		if (focusedOption.name === 'suitability') {
			choices = ['Kindling', 'Watering', 'Planting', 'Generating Electricity', 'Handiwork', 'Gathering', 'Lumbering', 'Mining', 'Medicine Production', 'Cooling', 'Transporting', 'Farming']; // Add actual suitabilities here
		}

		if (focusedOption.name === 'drops') {
			choices = ['Wool', 'Lamball Mutton', 'Red Berries', 'Egg', 'Chikipi Poultry', 'Berry Seeds', 'Low Grade Medical Supplies', 'Leather', 'Flame Organ', 'Pal Fluids', 'Electric Organ', 'Mushroom', 'Ice Organ', 'Penking Plume', 'Gumoss Leaf', 'Bone', 'Fiber', 'High Grade Technical Manual', 'Venom Gland', 'Small Pal Soul', 'Rushoar Pork', 'Gold Coin', 'Sapphire', 'Ruby', 'Gunpowder', 'Tocotoco Feather', 'Wheat Seeds', 'Mozzarina Steak', 'Milk', 'Lettuce Seeds', 'Tomato Seeds', 'Cotton Candy', 'High Quality Pal Oil', 'Caprity Meat', 'Horn', 'Eikthyrdeer Venison', 'Beautiful Flower', 'Honey', 'Raw Dumud', 'Copper Key', 'Silver Key', 'Galeclaw Poultry', 'Arrow', 'Elizabee\'s Staff', 'Reindrix Venison', 'Paldium Fragment', 'Ore', 'Cake', 'Suspicious Juice', 'Strange Juice', 'Memory Wiping Medicine', 'Ingot', 'Kattress Hair', 'High Quality Cloth', 'Raw Kelpsea', 'Precious Dragon Stone', 'Broncherry Meat', 'Mammorest Meat', 'Cloth', 'Coal', 'Medium Pal Soul', 'Pal Metal Ingot', 'Pure Quartz', 'Large Pal Soul', 'Innovative Technical Manual', 'Diamond', 'Polymer', 'Carbon Fiber']; // Add actual drop options here
		}

		const filtered = choices.filter(choice => choice.toLowerCase().startsWith(focusedOption.value.toLowerCase()));

		let options;
		if (filtered.length > 25) {
			options = filtered.slice(0, 25);
		}
		else {
			options = filtered;
		}
		await interaction.respond(
			options.map(choice => ({ name: choice, value: choice })),
		);
	},

	async execute(interaction) {
		let palName = '', palNumber = '', palElement = '', palSuitability = '', palRarity = '', palDrops = '';
		if (interaction.options.getSubcommand() === 'name') {
			palName = interaction.options.getString('name') || '';

			// Your logic for searching by name
		}
		else if (interaction.options.getSubcommand() === 'number') {
			palNumber = interaction.options.getString('number') || '';

			// Your logic for searching by number
		}
		else if (interaction.options.getSubcommand() === 'search') {
			palElement = interaction.options.getString('element') || '';
			palSuitability = interaction.options.getString('suitability') || '';
			palRarity = interaction.options.getString('rarity') || '';
			palDrops = interaction.options.getString('drops') || '';
		}
		// Match Drops
		// Split the input into individual keywords
		function matchDrops(input, str) {
			const keywords = input.split(',').map(keyword => keyword.trim().toLowerCase());

			// Split the string into skill and level pairs
			const pairs = str.split(',').map(pair => pair.trim().toLowerCase());

			// Find matches
			let foundDrops = true;
			keywords.forEach(keyword => {
				let found = false;
				pairs.forEach(pair => {
					if (pair.includes(keyword)) {
						found = true;
					}
				});
				if (!found) {
					foundDrops = false;
				}
			});

			return foundDrops;
		}

		function matchSuitabilities(input, str) {
			// Split palData into individual keyword/level pairs
			const palDataPairs = str.split(',').map(entry => {
				const [keyword, level] = entry.split(/\s+(\d+)/);
				return { keyword: keyword.trim(), level: parseInt(level.trim()) };
			});

			// Split palData into individual keyword/level pairs
			const palSuitabilityPairs = input.split(',').map(entry => {
				const parts = entry.split(/\s+(\d+)/);
				const keyword = parts[0].trim();
				const level = parts.length > 1 ? parseInt(parts[1]) : 0;
				return { keyword, level };
			});
			const results = [];
			for (const dataPairs of palDataPairs) {
				for (const inputPairs of palSuitabilityPairs) {
					if (dataPairs.keyword.toLocaleLowerCase().includes(inputPairs.keyword.toLocaleLowerCase()) && (dataPairs.level === inputPairs.level || inputPairs.level === 0)) {
						results.push(`${dataPairs.keyword} ${dataPairs.level}`);
					}
				}
			}
			if (results.length === palSuitabilityPairs.length) {
				return true;
			}
			else {
				return false;
			}
		}

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
					.setAuthor({ name: `Rarity: ${rarity}`, url: `https://palworld.fandom.com/wiki/${wiki}` })
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
						(palData.tech ? { name: 'Tech:', value: palData.tech } : { name: '\u200B', value: '\u200B' }),
					);
				await interaction.reply({ embeds: [palEmbed] });
				return;
			}
			const matchesRarity = palRarity !== '' && palRarity === rarity;
			const matchesElement = palElement !== '' && palData.element.toLowerCase().includes(palElement.toLowerCase());
			const matchesSuitability = palSuitability !== '' && matchSuitabilities(palSuitability, palData.suitability);
			const matchesDrops = palDrops !== '' && matchDrops(palDrops, palData.drops);

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
			// Element + Rarity + Drops
			else if (matchesElement && matchesRarity && matchesDrops && palSuitability === '') {
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
					{ name: 'Name\n-------\n', value: resNames.join('\n-------\n'), inline: true },
					{ name: 'Element\n-------\n', value: resElement.join('\n-------\n'), inline: true },
					{ name: 'Rarity\n-------\n', value: resRarity.join('\n-------\n'), inline: true },
				);
			await interaction.reply({ embeds: [palEmbed] });
			return;
		}
		else {
			await interaction.reply({ content: 'Nothing found.', ephemeral: true });
			return;
		}
	},
};