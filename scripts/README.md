# Developer Scripts

Use the stable commands in `package.json` for normal workflows. Script entry points are grouped by the data or artifact they maintain:

- `breeding/`: breeding audits, synchronization, updates, and native inspection.
- `game/`: installed-game snapshot inspection and cross-table audits.
- `items/`: item validation, synchronization, compaction, and PalDB updates.
- `journals/`: installed-game and PalDB journal synchronization.
- `maps/`: Pal, item, journal, and source-map generation and maintenance.
- `pals/`: Pal validation, synchronization, location audits, and PalDB updates.
- `maintenance/`: narrow, repeatable catalog and map corrections.
- `lib/`: reusable helpers grouped by item, map, PalDB, and shared concerns.
- `smoke/`: repository and interaction regression suites used by `smokeTest.js`.

Naming conventions:

- `audit` compares local data with an external or installed authoritative source without writing.
- `validate` enforces local repository invariants.
- `sync` derives local data from an authoritative source and writes only with the documented write option.
- `update` fetches and merges upstream PalDB data.
- `generate` produces derived artifacts such as maps.
- `apply` performs a narrow maintenance correction and defaults to validation when supported.
