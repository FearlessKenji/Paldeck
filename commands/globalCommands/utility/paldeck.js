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
						.setDescription('Name of a pal.')
						.setAutocomplete(true)))
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

		if (focusedOption.name === 'name') {
			 // Add actual pal names here
			choices = ['Lamball', 'Cattiva', 'Chikipi', 'Lifmunk', 'Foxparks', 'Foxparks Cryst', 'Fuack', 'Fuack Ignis', 'Sparkit', 'Tanzee', 'Rooby', 'Pengullet', 'Bengullet Lux', 'Penking', 'Penking Lux', 'Jolthog', 'Jolthog Cryst', 'Gumoss', 'Vixy', 'Hoocrates', 'Teafant', 'Depresso', 'Cremis', 'Daedream', 'Rushoar', 'Nox', 'Fuddler', 'Killamari', 'Killamari Primo', 'Mau', 'Mau Cryst', 'Celaray', 'Celaray Lux', 'Direhowl', 'Tocotoco', 'Flopie', 'Mozzarina', 'Bristla', 'Gobfin', 'Gobfin Ignis', 'Hangyu', 'Hangyu Cryst', 'Mossanda', 'Mossanda Lux', 'Woolipop', 'Caprity', 'Caprity Noct', 'Melpaca', 'Eikthyrdeer', 'Eikthyrdeer Terra', 'Nitewing', 'Ribbuny', 'Ribbuny Botan', 'Incineram', 'Incineram Noct', 'Cinnamoth', 'Arsox', 'Dumud', 'Dumud Gild', 'Cawgnito', 'Leezpunk', 'Leezpunk Ignis', 'Loupmoon', 'Loupmoon Cryst', 'Galeclaw', 'Robinquil', 'Robinquil Terra', 'Gorirat', 'Gorirat Terra', 'Beegarde', 'Elizabee', 'Grintale', 'Swee', 'Sweepa', 'Chillet', 'Chillet Ignis', 'Univolt', 'Foxcicle', 'Pyrin', 'Pyrin Noct', 'Reindrix', 'Rayhound', 'Kitsun', 'Kitsun Noct', 'Dazzi', 'Dazzi Noct', 'Lunaris', 'Dinossom', 'Dinossom Lux', 'Surfent', 'Surfent Terra', 'Maraith', 'Digitoise', 'Tombat', 'Lovander', 'Flambelle', 'Vanwyrm', 'Vanwyrm Cryst', 'Bushi', 'Bushi Noct', 'Beakon', 'Ragnahawk', 'Katress', 'Katress Ignis', 'Wixen', 'Wixen Noct', 'Verdash', 'Vaelet', 'Sibelyx', 'Elphidran', 'Elphidran Aqua', 'Kelpsea', 'Kelpsea Ignis', 'Azurobe', 'Azurobe Cryst', 'Cryolinx', 'Cryolinx Terra', 'Blazehowl', 'Blazehowl Noct', 'Relaxaurus', 'RElaxaurus Lux', 'Broncherry', 'Broncherry Aqua', 'Petallia', 'Reptyro', 'Reptyro Cryst', 'Kingpaca', 'Kingpaca Cryst', 'Mammorest', 'Mammorest Cryst', 'Wumpo', 'Wumpo Botan', 'Warsect', 'Warsect Terra', 'Fenglope', 'Fenglope Lux', 'Felbat', 'Quivern', 'Quivern Botan', 'Blazamut', 'Blazamut Ryu', 'Helzephyr', 'Helzephyr Lux', 'Astegon', 'Menasting', 'Menasting Terra', 'Anubis', 'Jormuntide', 'Jormuntide Ignis', 'Suzaku', 'Suzaku Aqua', 'Grizzbolt', 'Lyleen', 'Lyleen Noct', 'Faleris', 'Faleris Aqua', 'Orserk', 'Shadowbeak', 'Paladius', 'Necromus', 'Frostallion', 'Frostallion Noct', 'Jetragon', 'Bellanoir', 'Bellanoir Libero', 'Selyne', 'Croajiro', 'Croajiro Noct', 'Lullu', 'Shroomer', 'Shroomer Noct', 'Kikit', 'Sootseer', 'Prixter', 'Knocklem', 'Yakumo', 'Dogen', 'Dazemu', 'Mimog', 'Xenovader', 'Xenogard', 'Xenolord', 'Nitemary', 'Starryon', 'Silvegis', 'Smokie', 'Celesdir', 'Omascul', 'Splatterina', 'Tarantriss', 'Azurmane', 
				'Bastigor', 'Prunelia', 'Nyafia', 'Gildane', 'Herbil', 'Icelyn', 'Frostplume', 'Palumba', 'Braloha', 'Munchill', 'Polapup', 'Turtacle', 'Turtacle Terra', 'Jellroy', 'Jelliette', 'Gloopie', 'Finsinder', 'Finsider Ignis', 'Ghangler', 'Ghangler Ignis', 'Whalaska', 'Whalaska Ignis', 'Neptilius'];
		}

		if (focusedOption.name === 'suitability') {
			// Add actual suitabilities here
			choices = ['Kindling', 'Kindling 1', 'Kindling 2', 'Kindling 3', 'Kindling 4', 'Watering', 'Watering 1', 'Watering 2', 'Watering 3', 'Watering 4', 'Planting', 'Planting 1', 'Planting 2', 'Planting 3', 'Planting 4', 'Generating Electricity', 'Generating Electricity 1', 'Generating Electricity 2', 'Generating Electricity 3', 'Generating Electricity 4', 'Handiwork', 'Handiwork 1', 'Handiwork 2', 'Handiwork 3', 'Handiwork 4', 'Gathering', 'Gathering 1', 'Gathering 2', 'Gathering 3', 'Gathering 4', 'Lumbering', 'Lumbering 1', 'Lumbering 2', 'Lumbering 3', 'Lumbering 4', 'Mining', 'Mining 1', 'Mining 2', 'Mining 3', 'Mining 4', 'Medicine Production', 'Medicine Production 1', 'Medicine Production 2', 'Medicine Production 3', 'Medicine Production 4', 'Cooling', 'Cooling 1', 'Cooling 2', 'Cooling 3', 'Cooling 4', 'Transporting', 'Transporting 1', 'Transporting 2', 'Transporting 3', 'Transporting 4', 'Farming', 'Farming 1', 'Farming 2', 'Farming 3', 'Farming 4'];
		}

		if (focusedOption.name === 'drops') {
			 // Add actual drop options here
			choices = ['Wool', 'Lamball Mutton', 'Red Berries', 'Egg', 'Chikipi Poultry', 'Berry Seeds', 'Low Grade Medical Supplies', 'Leather', 'Flame Organ', 'Pal Fluids', 'Electric Organ', 'Mushroom', 'Ice Organ', 'Penking Plume', 'Gumoss Leaf', 'Bone', 'Fiber', 'High Grade Technical Manual', 'Venom Gland', 'Small Pal Soul', 'Rushoar Pork', 'Gold Coin', 'Sapphire', 'Ruby', 'Gunpowder', 'Tocotoco Feather', 'Wheat Seeds', 'Mozzarina Steak', 'Milk', 'Lettuce Seeds', 'Tomato Seeds', 'Cotton Candy', 'High Quality Pal Oil', 'Caprity Meat', 'Horn', 'Eikthyrdeer Venison', 'Beautiful Flower', 'Honey', 'Raw Dumud', 'Copper Key', 'Silver Key', 'Galeclaw Poultry', 'Arrow', 'Elizabee\'s Staff', 'Reindrix Venison', 'Paldium Fragment', 'Ore', 'Cake', 'Suspicious Juice', 'Strange Juice', 'Memory Wiping Medicine', 'Ingot', 'Kattress Hair', 'High Quality Cloth', 'Raw Kelpsea', 'Precious Dragon Stone', 'Broncherry Meat', 'Mammorest Meat', 'Cloth', 'Coal', 'Medium Pal Soul', 'Pal Metal Ingot', 'Pure Quartz', 'Large Pal Soul', 'Innovative Technical Manual', 'Diamond', 'Polymer', 'Carbon Fiber', 'Huge Dark Egg', 'Bellanoir Libero (Ultra) Slab', 'Ancient Civilization Core', 'Power Fruit', 'Stout Fruit', 'Life Fruit', 'Multiclimate Undershirt', 'Training Crystal', 'Training Manual (XL)', 'Meteorite Fragment'];
		}

		const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase()));

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
				return { keyword: keyword/*.trim()*/, level: parseInt(level/*.trim()*/) };
			});

			// Split palData into individual keyword/level pairs
			const palSuitabilityPairs = input.split(',').map(entry => {
				const parts = entry.split(/\s+(\d+)/);
				const keyword = parts[0]/*.trim()*/;
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
					.setAuthor({ name: `Rarity: ${rarity}`, url: `https://palworld.gg/breeding-calculator` }) //?child=${breed}&parent1=${breed}`)
					.setDescription(palData.description)
					.setColor(palData.color)
					.setTitle(palData.name)
					.setURL(`https://palworld.fandom.com/wiki/${wiki}`)
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