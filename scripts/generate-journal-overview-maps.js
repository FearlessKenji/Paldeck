#!/usr/bin/env node
const path = require(`node:path`);
const { itemSourcePresentation, loadMap, renderMap, selectMarkers } = require(`./lib/item-map-rendering.js`);

const root = path.resolve(__dirname, `..`);
const cache = path.join(root, `tmp`, `paldb-map-cache`);
const definitions = [
	{
		key: `palpagos`, target: `palpagos-journals.png`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`,
		tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024],
	},
	{
		key: `worldtree`, target: `worldtree-journals.png`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`,
		tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912],
	},
];

async function main() {
	for (const definition of definitions) {
		const map = await loadMap(definition, cache);
		const display = itemSourcePresentation({ type: `Journals`, label: `Journals` });
		const markers = selectMarkers(map, [{ type: `Journals` }]);
		await renderMap(map, [{ ...display, markers }], path.join(root, `data`, `item-maps`, definition.target),
			definition.key === `worldtree`);
		console.log(`Rendered data/item-maps/${definition.target}`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
