# Native Breeding Audit

This audit applies to Palworld Steam build `24575825` (shipping executable SHA-256 `fe3c15064524bae1947852467c4f92bc22469acc033a3d3c8031eab4324e41e8`). Addresses are image virtual addresses from that build and must be rediscovered after an update.

## Mutated egg species

The mutation generator is at `0x142e6b990`; its candidate resolver is at `0x142e69eb0`. For parent breeding ranks `a` and `b`, the native defaults and positive-number rounding produce:

```text
lower   = min(a, b)
base    = round(lower * 0.5)
penalty = round(abs(a - b) * 0.4)
span    = max(1, round(lower * 0.1))
target  = base + penalty + uniformInteger(1, span)
```

The resolver rejects boss rows (`IsBoss`, Pal parameter offset `0xCC`) and rows marked `IgnoreCombi` (offset `0x108`). Unlike normal rank breeding, mutation resolution does not reject eligible variant species. It selects the smallest absolute distance from `target` to `CombiRank` (`0x100`); equal-distance candidates use the larger `CombiDuplicatePriority` (`0x104`).

The relevant `UPalGameSetting` defaults are mutation rate `0.01`, rank coefficient `0.5`, rank-difference penalty `0.4`, random coefficient `0.1`, minimum mutation talent `90`, and initial rank `3`. The generator rolls every talent independently from 90 through 100. `FUN_142e6c460` dispatches to the mutation generator when its mutation-egg argument is set; otherwise it follows the normal same-species, fixed-combination, and rank-fallback path.

`FUN_142df4b80` adds `MutationRateBonusPercent * 0.01` to the base mutation rate and clamps the result to 0–1 before rolling. Normal fallback adds the breeding item's `CombiRankBonus`, clamped to 0–10, to `floor((rankA + rankB + 1) / 2)`. The normal resolver excludes `IgnoreCombi` rows and every species used as a `DT_PalCombiUnique` child; this latter predicate is `FUN_142e62c90`.

The current fixed-combination table contains 258 rows: 122 redundant same-species rows and 136 non-redundant rows. Rows 80 and 81 make Katress + Wixen gender-dependent: male Katress + female Wixen produces Wixen Noct, while female Katress + male Wixen produces Katress Ignis.

## Confirmed checks

- Hartalis + Hartalis resolves only to Aegidron.
- Aegidron + Aegidron resolves only to Aegidron.
- Ophydia + Ophydia resolves only to Eidrolon Ignis. Its target range is 116–138, and the variant remains eligible because its game row has `IgnoreCombi: false`.
- Whalaska + Whalaska has target range 356–426. Its complete file-derived pool is Whalaska Ignis, Moldron Cryst, Flaracle, Blazamut, Azurmane, and Starryon Primo; observed hatches currently confirm Flaracle, Blazamut, and Azurmane.

The Ghidra-only string, reflection-property, address, and decompilation helpers used for this trace are external development tooling and are not stored in this runtime repository. `scripts/breeding/scan-native-offsets.js` provides a JavaScript first pass for locating code that references the mutation setting offsets in a later executable.
