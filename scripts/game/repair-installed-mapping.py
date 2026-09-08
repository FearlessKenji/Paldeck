#!/usr/bin/env python3
"""Repair supported usmap schemas from the installed Windows executable's reflection records.

This reads the PE file without launching or modifying the game. Unknown descriptor
layouts/types fail closed; the output includes the build and native property evidence.
"""
import argparse
import hashlib
import json
import mmap
import re
import struct
from pathlib import Path


class NativeReflection:
    def __init__(self, executable):
        self.file = executable.open("rb")
        self.data = mmap.mmap(self.file.fileno(), 0, access=mmap.ACCESS_READ)
        pe = self.number(0x3C, "I")
        if self.data[pe:pe + 4] != b"PE\0\0" or self.number(pe + 24, "H") != 0x20B:
            raise ValueError("Expected a 64-bit Windows PE executable")
        self.base = self.number(pe + 48, "Q")
        section_start = pe + 24 + self.number(pe + 20, "H")
        self.sections = []
        for index in range(self.number(pe + 6, "H")):
            offset = section_start + index * 40
            self.sections.append((self.number(offset + 12, "I"),
                                  self.number(offset + 20, "I"), self.number(offset + 16, "I")))

    def number(self, offset, kind="Q"):
        return struct.unpack_from("<" + kind, self.data, offset)[0]

    def offset(self, address):
        for relative, raw, size in self.sections:
            if self.base + relative <= address < self.base + relative + size:
                return raw + address - self.base - relative
        return None

    def address(self, offset):
        for relative, raw, size in self.sections:
            if raw <= offset < raw + size:
                return self.base + relative + offset - raw
        return None

    def matches(self, needle):
        offset = 0
        while True:
            offset = self.data.find(needle, offset)
            if offset < 0:
                return
            yield offset
            offset += len(needle)

    def references(self, address):
        return self.matches(struct.pack("<Q", address))

    def text(self, address):
        offset = self.offset(address)
        if offset is None:
            return None
        end = self.data.find(b"\0", offset, offset + 128)
        try:
            return self.data[offset:end].decode("ascii") if end > offset else None
        except UnicodeDecodeError:
            return None

    def descriptor(self, address):
        offset = self.offset(address)
        if offset is None or offset + 72 > len(self.data) or self.number(offset + 28, "I") != 0x45:
            return None
        name = self.text(self.number(offset))
        if not name or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name):
            return None
        return {"name": name, "flag": self.number(offset + 24, "I"),
                "descriptor": hex(address), "arraySize": self.number(offset + 32, "I")}

    def property_array(self, schema):
        # A native property pointer array is bounded by non-descriptor pointers.
        # Require all existing field names to avoid mistaking another class's array for this one.
        expected = {prop["name"].lower() for prop in schema["props"]}
        candidates = {}
        for anchor in schema["props"][-4:]:
            for string_offset in self.matches(anchor["name"].encode() + b"\0"):
                address = self.address(string_offset)
                if address is None:
                    continue
                for descriptor_offset in self.references(address):
                    descriptor_address = self.address(descriptor_offset)
                    if not descriptor_address or not self.descriptor(descriptor_address):
                        continue
                    for array_offset in self.references(descriptor_address):
                        low = high = array_offset
                        while low >= 8 and self.descriptor(self.number(low - 8)):
                            low -= 8
                        while high + 16 <= len(self.data) and self.descriptor(self.number(high + 8)):
                            high += 8
                        rows = [self.descriptor(self.number(pos)) for pos in range(low, high + 1, 8)]
                        if expected <= {row["name"].lower() for row in rows}:
                            candidates[low] = rows
        if len(candidates) != 1:
            raise ValueError(f"Cannot uniquely identify native property array: {len(candidates)} candidates")
        return next(iter(candidates.values()))

    def registered_struct(self, name):
        candidates = {}
        for string_offset in self.matches(name.encode() + b"\0"):
            address = self.address(string_offset)
            if address is None:
                continue
            for reference in self.references(address):
                array_offset = self.offset(self.number(reference + 24))
                count = self.number(reference + 32, "I")
                if array_offset is None or not 0 < count < 1024:
                    continue
                rows = [self.descriptor(self.number(array_offset + index * 8)) for index in range(count)]
                if all(rows):
                    candidates[array_offset] = rows
        if len(candidates) != 1:
            raise ValueError(f"Cannot uniquely identify reflection registration for {name}")
        return next(iter(candidates.values()))


class Mapping:
    def __init__(self, data):
        self.data = data
        self.position = 16
        # This repair deliberately supports only the inspected, uncompressed v4 layout.
        if data[:8] != bytes.fromhex("c4 30 04 00 00 00 00 00"):
            raise ValueError("Expected an uncompressed v4 usmap without package version overrides")
        if struct.unpack_from("<II", data, 8) != (len(data) - 16, len(data) - 16):
            raise ValueError("Mapping size mismatch")
        self.names = []
        for _ in range(self.read("I")):
            length = self.read("H")
            self.names.append(data[self.position:self.position + length].decode())
            self.position += length
        self.enum_start = self.position
        for _ in range(self.read("I")):
            self.read("I")
            enum_count = self.read("H")
            self.position += enum_count * 12
        self.struct_start = self.position
        self.schemas = {}
        for _ in range(self.read("I")):
            start = self.position
            name, parent, count, serialized = self.read("IIHH")
            properties = []
            for _ in range(serialized):
                index, dimension, property_name = self.read("HBI")
                properties.append({"index": index, "dim": dimension,
                                   "name": self.names[property_name], "type": self.read_type()})
            self.schemas[self.names[name]] = {"start": start, "end": self.position,
                "super": self.names[parent] if parent != 0xFFFFFFFF else None,
                "count": count, "props": properties}
        self.extension_start = self.position

    def read(self, kind):
        result = struct.unpack_from("<" + kind, self.data, self.position)
        self.position += struct.calcsize("<" + kind)
        return result[0] if len(result) == 1 else result

    def read_type(self):
        kind = self.read("B")
        if kind == 26:
            return [kind, self.read_type(), self.read("I")]
        if kind == 9:
            return [kind, self.read("I")]
        if kind in (8, 25, 28):
            return [kind, self.read_type()]
        if kind == 24:
            return [kind, self.read_type(), self.read_type()]
        return [kind]

    def name_index(self, name):
        if name not in self.names:
            self.names.append(name)
        return self.names.index(name)

    def encode_type(self, value):
        result = bytes([value[0]])
        if value[0] == 26:
            return result + self.encode_type(value[1]) + struct.pack("<I", value[2])
        if value[0] == 9:
            return result + struct.pack("<I", value[1])
        if value[0] in (8, 25, 28):
            return result + self.encode_type(value[1])
        if value[0] == 24:
            return result + self.encode_type(value[1]) + self.encode_type(value[2])
        return result

    def encode_schema(self, name, parent, properties):
        count = sum(prop["dim"] for prop in properties)
        result = struct.pack("<IIHH", self.name_index(name),
            self.name_index(parent) if parent else 0xFFFFFFFF, count, len(properties))
        index = 0
        for prop in properties:
            result += struct.pack("<HBI", index, prop["dim"], self.name_index(prop["name"]))
            result += self.encode_type(prop["type"])
            index += prop["dim"]
        return result

    def write(self, replacements):
        chunks = [replacements.get(name, self.data[schema["start"]:schema["end"]])
                  for name, schema in self.schemas.items()]
        chunks.extend(value for name, value in replacements.items() if name not in self.schemas)
        names = struct.pack("<I", len(self.names)) + b"".join(
            struct.pack("<H", len(name.encode())) + name.encode() for name in self.names)
        payload = (names + self.data[self.enum_start:self.struct_start] + struct.pack("<I", len(chunks))
                   + b"".join(chunks) + self.data[self.extension_start:])
        return self.data[:8] + struct.pack("<II", len(payload), len(payload)) + payload


def property_roots(rows):
    """Group postfix helper descriptors without assigning them serialized field indices."""
    roots = []
    for row in rows:
        count = {22: 1, 30: 1, 23: 2}.get(row["flag"], 0)
        if len(roots) < count:
            raise ValueError("Incomplete native property tree")
        node = {**row, "children": roots[-count:] if count else []}
        if count:
            del roots[-count:]
        roots.append(node)
    return roots


def repair(mapping, native):
    targets = ["PalCharacterParameterDatabaseRow", "PalBaseCampTaskDataSet_TableRow",
               "PalOptionWorldSettings", "PalOptionWorldPresetRow", "PalNPCSpawnerBase",
               "PalGameSetting", "PalLevelObject_LockGimmickPalFight", "PPSkyCreator"]
    evidence = {name: native.property_array(mapping.schemas[name]) for name in targets}
    fishing = "PalFishingDifficultyUIDataRow"
    evidence[fishing] = native.registered_struct(fishing)
    # Verify the new fishing item's struct against an existing reflected item field's constructor.
    # Short field lists can also match unrelated structs; use the named registration.
    item_reference = native.registered_struct("PalBossBattleSuccessItemInfo")
    item_descriptor = next(row for row in item_reference if row["name"] == "ItemName")
    item_constructor = native.number(native.offset(int(item_descriptor["descriptor"], 16)) + 64)
    item_type = next(prop["type"] for prop in mapping.schemas["PalBossBattleSuccessItemInfo"]["props"]
                     if prop["name"] == "ItemName")
    primitives = {0: 0, 3: 2, 5: 20, 10: 3, 20: 5, 21: 10, 76: 1}
    waza_reference = native.registered_struct("PalWazaMasterLevelDataRow")
    waza_descriptor = next(row for row in waza_reference if row["name"] == "WazaID" and row["flag"] == 30)
    waza_constructor = native.number(native.offset(int(waza_descriptor["descriptor"], 16)) + 64)
    waza_type = next(prop["type"] for prop in mapping.schemas["PalWazaMasterLevelDataRow"]["props"]
                     if prop["name"] == "WazaID")
    replacements = {}
    for name, rows in evidence.items():
        old = mapping.schemas.get(name, {"super": "TableRowBase", "props": []})
        by_name = {prop["name"].lower(): prop for prop in old["props"]}
        # Reflection descriptors are postfix trees. A map's enum key consumes its
        # underlying descriptor too; counting only the two preceding slots shifts fields.
        roots = property_roots(rows)
        properties = []
        for row in roots:
            previous = by_name.get(row["name"].lower())
            value_type = previous["type"] if previous else None
            if row["flag"] in primitives:
                value_type = [primitives[row["flag"]]]
            elif row["flag"] == 22:
                inner = row["children"][0]
                if inner["flag"] in primitives:
                    value_type = [8, [primitives[inner["flag"]]]]
                elif name == fishing:
                    constructor = native.number(native.offset(int(inner["descriptor"], 16)) + 64)
                    if constructor != item_constructor:
                        raise ValueError("Fishing item array has an unexpected native struct")
                    value_type = [8, item_type]
                elif not value_type or value_type[0] != 8:
                    raise ValueError(f"Unsupported new array: {name}.{row['name']}")
            elif row["flag"] == 23 and not value_type:
                value, key = row["children"]
                constructor = native.number(native.offset(int(key["descriptor"], 16)) + 64)
                if key["flag"] != 30 or constructor != waza_constructor or value["flag"] not in primitives:
                    raise ValueError(f"Unsupported new map: {name}.{row['name']}")
                value_type = [24, waza_type, [primitives[value["flag"]]]]
            elif name == fishing and row["flag"] == 25:
                constructor = native.number(native.offset(int(row["descriptor"], 16)) + 64)
                if constructor != item_constructor:
                    raise ValueError("Fishing item has an unexpected native struct")
                value_type = item_type
            if value_type is None or not 0 < row["arraySize"] < 256:
                raise ValueError(f"Unsupported reflected field: {name}.{row['name']}")
            properties.append({"name": previous["name"] if previous else row["name"],
                               "type": value_type, "dim": row["arraySize"]})
        replacements[name] = mapping.encode_schema(name, old["super"], properties)
    return mapping.write(replacements), evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--steam-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    manifest = options.steam_manifest.read_text()
    build = re.search(r'"buildid"\s+"(\d+)"', manifest)
    if not build:
        raise ValueError("Steam manifest has no installed build ID")
    native = NativeReflection(options.exe)
    output, evidence = repair(Mapping(options.mapping.read_bytes()), native)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_bytes(output)
    report = {"buildId": build[1], "executable": str(options.exe.resolve()),
              "executableSha256": hashlib.sha256(native.data).hexdigest(),
              "sourceMappingSha256": hashlib.sha256(options.mapping.read_bytes()).hexdigest(),
              "mappingSha256": hashlib.sha256(output).hexdigest(), "nativeProperties": evidence}
    options.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Repaired {len(evidence)} schemas from installed build {build[1]}: {options.output}")


if __name__ == "__main__":
    main()
