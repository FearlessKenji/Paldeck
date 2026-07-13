# Paldeck Patch Notes

These notes are written for server owners and moderators. They include changes
that affect setup, day-to-day use, or visible bot behavior. For the full
developer history, see [CHANGELOG.md](https://github.com/FearlessKenji/Paldeck/blob/main/CHANGELOG.md).

## Unreleased

### Paldeck Updates

- Server admins can subscribe a channel to Paldeck Updates with
  `/updates channel`.
- Server admins can unsubscribe with `/updates clear`.
- Server admins can send the latest local patch notes to their configured
  channel with `/updates send-latest`.

## v1.3.0 - 2026-07-13

### Paldeck

- Rebuilt habitat maps using the latest available PalDB map data.
- Added updated World Tree location coverage where available.
- Replaced old/stale habitat images across the Paldeck with freshly generated maps.
- Added combined habitat maps for Pals that appear in multiple regions.
- Added day/night habitat coloring:
  - Red: appears during both day and night
  - Orange: day-only
  - Purple: night-only
- Improved handling for unavailable habitat data so Pals without confirmed map data use the unknown habitat image instead of an empty map.
- Added local thumbnails for Clovee, Amione, and Panthalus.
- Corrected Relaxaurus Lux work suitabilities to Generating Electricity 4 and Transporting 3.
- Updated the app version to 1.3.0.
