#!/usr/bin/env node
// Fast first-pass locator for native functions that access several mutation-setting fields.
const fs = require(`node:fs`);
const { Buffer } = require(`node:buffer`);

const executablePath = process.argv[2];
if (!executablePath) {
	throw new Error(`Pass the Palworld shipping executable path.`);
}

const buffer = fs.readFileSync(executablePath);
const peOffset = buffer.readUInt32LE(0x3c);
const sectionCount = buffer.readUInt16LE(peOffset + 6);
const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
const optionalHeader = peOffset + 24;
const imageBase = Number(buffer.readBigUInt64LE(optionalHeader + 24));
const sectionTable = optionalHeader + optionalHeaderSize;
const sections = [];
for (let index = 0; index < sectionCount; index += 1) {
	const start = sectionTable + index * 40;
	sections.push({
		name: buffer.subarray(start, start + 8).toString(`ascii`).replace(/\0.*$/, ``),
		rawOffset: buffer.readUInt32LE(start + 20),
		rawSize: buffer.readUInt32LE(start + 16),
		virtualAddress: buffer.readUInt32LE(start + 12),
	});
}

const offsets = [0x1d68, 0x1d6c, 0x1d70, 0x1d74, 0x1d78, 0x1d7c, 0x1d80, 0x1d84, 0x1d88, 0x1d89];
const hits = [];
for (const offset of offsets) {
	const pattern = Buffer.alloc(4);
	pattern.writeUInt32LE(offset);
	for (let position = buffer.indexOf(pattern); position !== -1; position = buffer.indexOf(pattern, position + 1)) {
		const section = sections.find(value => position >= value.rawOffset && position < value.rawOffset + value.rawSize);
		if (section?.name === `.text`) {
			hits.push({
				address: imageBase + section.virtualAddress + position - section.rawOffset,
				offset,
				position,
			});
		}
	}
}
hits.sort((first, second) => first.position - second.position);

const clusters = [];
for (const hit of hits) {
	let cluster = clusters.at(-1);
	if (!cluster || hit.position - cluster.lastPosition > 0x1000) {
		cluster = { firstAddress: hit.address, hits: [], lastPosition: hit.position };
		clusters.push(cluster);
	}
	cluster.hits.push(hit);
	cluster.lastPosition = hit.position;
}

for (const cluster of clusters.filter(value => new Set(value.hits.map(hit => hit.offset)).size >= 2)) {
	console.log(JSON.stringify({
		firstAddress: `0x${cluster.firstAddress.toString(16)}`,
		hits: cluster.hits.map(hit => ({ address: `0x${hit.address.toString(16)}`, offset: `0x${hit.offset.toString(16)}` })),
	}));
}
