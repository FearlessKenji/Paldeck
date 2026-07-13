import argparse
import html
import json
import math
import re
import shutil
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PAL_DATA_PATH = ROOT / "data" / "palData.json"
MAP_DIR = ROOT / "data" / "maps"
UNKNOWN_HABITAT = "data/maps/unknown-habitat.png"
CACHE_DIR = ROOT / "tmp" / "paldb-map-cache"

USER_AGENT = "Mozilla/5.0"
PALDB = "https://paldb.cc"
CDN = "https://cdn.paldb.cc"

MAPS = {
    "palpagos": {
        "page": f"{PALDB}/en/Palpagos_Islands",
        "data_script": f"{PALDB}/js/map_data_en.js?_=1783945617",
        "renderer": f"{CDN}/js/map.4135cf4160a774b6.js",
        "tile_dir": "image/map8",
        "crop": (0, 0, 1024, 1024),
    },
    "worldtree": {
        "page": f"{PALDB}/en/The_World_Tree",
        "data_script": f"{PALDB}/js/treemap_data_en.js?_=1783945617",
        "renderer": f"{CDN}/js/treemap.d119f703810c1363.js",
        "tile_dir": "image/treemap8",
        "crop": (0, 112, 1024, 912),
    },
}

COLORS = {
    "both": (255, 0, 0),
    "day": (255, 120, 0),
    "night": (89, 60, 242),
    "fixed": (255, 0, 0),
}


def cache_path(url):
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", url.replace("https://", ""))
    return CACHE_DIR / safe


def fetch_bytes(url):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = cache_path(url)
    if path.exists():
        return path.read_bytes()

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = response.read()
    path.write_bytes(data)
    return data


def fetch_text(url):
    return fetch_bytes(url).decode("utf-8", errors="ignore")


def fetch_json(url):
    return json.loads(fetch_text(url))


def slugify(value):
    value = value.lower().replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def pal_page_url(name):
    slug = urllib.parse.quote(name.replace(" ", "_"), safe="")
    return f"{PALDB}/en/{slug}"


def parse_json_var(script, name):
    match = re.search(rf"var\s+{re.escape(name)}\s*=\s*(.*?);var\s+", script, re.S)
    if not match:
        match = re.search(rf"var\s+{re.escape(name)}\s*=\s*(.*?);$", script, re.S)
    if not match:
        raise ValueError(f"Could not find {name} in PalDB script")
    return json.loads(match.group(1))


def parse_config(script):
    match = re.search(r"var\s+config\s*=\s*(.*?);var\s+", script, re.S)
    if not match:
        raise ValueError("Could not find config in PalDB script")
    return json.loads(match.group(1))


def parse_options(page_html, config):
    match = re.search(r"const\s+perPixel\s*=\s*([0-9.]+);.*?const\s+options\s*=\s*\{(.*?)\};", page_html, re.S)
    if not match:
        raise ValueError("Could not find map options")

    per_pixel = float(match.group(1))
    body = match.group(2)

    def literal_option(name):
        option = re.search(rf"{name}\s*:\s*([-+]?\d+(?:\.\d+)?)\s*,", body)
        return float(option.group(1)) if option else None

    def expression_option(name):
        option = re.search(
            rf"{name}\s*:\s*1000\+\(([-+0-9.]+)-config\.landScapeRealPositionMin\.([XY])\)/perPixel",
            body,
        )
        if not option:
            return None
        absolute_value = float(option.group(1))
        axis = option.group(2)
        return 1000 + (absolute_value - config["landScapeRealPositionMin"][axis]) / per_pixel

    return {
        "per_pixel": per_pixel,
        "transform_x_pixel": (
            config["landScapeRealPositionMax"]["X"] - config["landScapeRealPositionMin"]["X"]
        )
        / per_pixel,
        "transform_y_pixel": (
            config["landScapeRealPositionMax"]["Y"] - config["landScapeRealPositionMin"]["Y"]
        )
        / per_pixel,
        "ingame_x_start": (
            literal_option("ingame_x_start")
            if literal_option("ingame_x_start") is not None
            else expression_option("ingame_x_start")
        ),
        "ingame_y_start": (
            literal_option("ingame_y_start")
            if literal_option("ingame_y_start") is not None
            else expression_option("ingame_y_start")
        ),
    }


def build_map_meta():
    meta = {}
    for key, settings in MAPS.items():
        script = fetch_text(settings["data_script"])
        config = parse_config(script)
        page_html = fetch_text(settings["page"])
        meta[key] = {
            **settings,
            "config": config,
            "options": parse_options(page_html, config),
            "fixed_dungeon": parse_json_var(script, "fixedDungeon"),
        }
    return meta


def resolve_pal_code(name):
    page = fetch_text(pal_page_url(name))
    matches = re.findall(r'href="([^"]*\?pal=([^"&]+)&t=([^"]+))"', page)
    if not matches:
        return None
    return urllib.parse.unquote(html.unescape(matches[0][1]))


def row_locations(row, key):
    return ((row or {}).get(key) or {}).get("Locations") or []


def location_key(location):
    return json.dumps(location, sort_keys=True, separators=(",", ":"))


def rpos_to_pixel(location, meta):
    config = meta["config"]
    scale_x = (location["X"] - config["landScapeRealPositionMin"]["X"]) / (
        config["landScapeRealPositionMax"]["X"] - config["landScapeRealPositionMin"]["X"]
    )
    scale_y = (location["Y"] - config["landScapeRealPositionMin"]["Y"]) / (
        config["landScapeRealPositionMax"]["Y"] - config["landScapeRealPositionMin"]["Y"]
    )
    return scale_y * 1024, (1 - scale_x) * 1024


def ipos_to_pixel(location, meta):
    options = meta["options"]
    scale_x = (location["Y"] + options["ingame_x_start"]) / options["transform_x_pixel"]
    scale_y = (location["X"] + options["ingame_y_start"]) / options["transform_y_pixel"]
    return scale_y * 1024, (1 - scale_x) * 1024


def within_crop(point, crop):
    x, y = point
    left, top, right, bottom = crop
    return left <= x < right and top <= y < bottom


def load_tiles(meta):
    base = Image.new("RGBA", (1024, 1024), (221, 221, 221, 255))
    for x in range(2):
        for y in range(2):
            url = f"{CDN}/{meta['tile_dir']}/z1x{x}y{y}.webp"
            image = Image.open(cache_path(url) if cache_path(url).exists() else fetch_tile(url)).convert("RGBA")
            image = image.resize((512, 512), Image.Resampling.LANCZOS)
            base.alpha_composite(image, (x * 512, y * 512))
    return base


def fetch_tile(url):
    fetch_bytes(url)
    return cache_path(url)


def crop_canvas(canvas, crop):
    left, top, right, bottom = crop
    return canvas.crop((left, top, right, bottom))


def draw_dot(draw, x, y, color, radius):
    fill = color + (102,)
    outline = color + (255,)
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill, outline=outline, width=2)


def map_points_for_region(row, code, meta):
    day_locations = {location_key(item): item for item in row_locations(row, "dayTimeLocations")}
    night_locations = {location_key(item): item for item in row_locations(row, "nightTimeLocations")}
    all_keys = sorted(set(day_locations) | set(night_locations))
    crop = meta["crop"]
    points = []

    for key in all_keys:
        location = day_locations.get(key) or night_locations[key]
        point = rpos_to_pixel(location, meta)
        if not within_crop(point, crop):
            continue
        if key in day_locations and key in night_locations:
            kind = "both"
        elif key in day_locations:
            kind = "day"
        else:
            kind = "night"
        points.append((point[0] - crop[0], point[1] - crop[1], kind))

    fixed_points = []
    code_lower = code.lower()
    boss_lower = f"boss_{code_lower}"
    for item in meta["fixed_dungeon"]:
        fixed_id = str(item.get("id", "")).lower()
        if fixed_id not in {code_lower, boss_lower}:
            continue
        if item.get("pos"):
            point = rpos_to_pixel(item["pos"], meta)
        elif item.get("ipos"):
            point = ipos_to_pixel(item["ipos"], meta)
        else:
            continue
        if within_crop(point, crop):
            fixed_points.append((point[0] - crop[0], point[1] - crop[1], "fixed"))

    return points + fixed_points


def render_region(meta, points):
    canvas = crop_canvas(load_tiles(meta), meta["crop"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    large = len(points) <= 2
    for x, y, kind in points:
        draw_dot(draw, x, y, COLORS[kind], 6 if large or kind == "fixed" else 2)
    return canvas


def stack_canvases(canvases):
    if len(canvases) == 1:
        return canvases[0]
    width = max(canvas.width for canvas in canvases)
    height = sum(canvas.height for canvas in canvases)
    out = Image.new("RGBA", (width, height), (8, 18, 24, 255))
    y = 0
    for canvas in canvases:
        out.alpha_composite(canvas, ((width - canvas.width) // 2, y))
        y += canvas.height
    return out


def pal_filename(pal):
    number = pal["number"].lower()
    prefix = number if number != "-1" else "terraria"
    return f"{prefix}-{slugify(pal['name'])}.png"


def write_pal_data(data):
    with PAL_DATA_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent="\t", ensure_ascii=False)
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser(description="Generate Paldeck habitat maps from PalDB Leaflet data.")
    parser.add_argument("--clean", action="store_true", help="Remove stale map PNGs that are no longer referenced.")
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N pals, for testing.")
    parser.add_argument("--skip-json", action="store_true", help="Write PNGs but do not update palData.json.")
    args = parser.parse_args()

    MAP_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(PAL_DATA_PATH.read_text(encoding="utf-8"))
    pals = data["Pals"][: args.limit or None]
    map_meta = build_map_meta()
    distribution = fetch_json(f"{PALDB}/DataTable/UI/DT_PaldexDistributionData.json?_=1730258749")[0]["Rows"]
    distribution_lower = {key.lower(): value for key, value in distribution.items()}

    generated = []
    unknown = []
    failures = []
    desired_paths = {UNKNOWN_HABITAT}

    for index, pal in enumerate(pals, start=1):
        try:
            code = resolve_pal_code(pal["name"])
            if not code:
                pal["habitat"] = UNKNOWN_HABITAT
                unknown.append((pal["number"], pal["name"], "no paldb code"))
                continue

            row = distribution.get(code) or distribution_lower.get(code.lower()) or {}
            canvases = []
            point_counts = {}
            for region in ("palpagos", "worldtree"):
                points = map_points_for_region(row, code, map_meta[region])
                point_counts[region] = len(points)
                if points:
                    canvases.append(render_region(map_meta[region], points))

            if not canvases:
                pal["habitat"] = UNKNOWN_HABITAT
                unknown.append((pal["number"], pal["name"], "no visible points"))
                continue

            filename = pal_filename(pal)
            output = MAP_DIR / filename
            stack_canvases(canvases).convert("RGB").save(output)
            pal["habitat"] = f"data/maps/{filename}"
            desired_paths.add(pal["habitat"])
            generated.append((pal["number"], pal["name"], code, point_counts, filename))
        except Exception as exc:
            pal["habitat"] = UNKNOWN_HABITAT
            failures.append((pal["number"], pal["name"], str(exc)))

        if index % 25 == 0:
            print(f"Processed {index}/{len(pals)}")

    if not args.skip_json and not args.limit:
        write_pal_data(data)

    if args.clean and not args.limit:
        desired_names = {Path(path).name for path in desired_paths if path.startswith("data/maps/")}
        for file in MAP_DIR.glob("*.png"):
            if file.name not in desired_names:
                file.unlink()

    summary = {
        "generated": len(generated),
        "unknown": len(unknown),
        "failures": len(failures),
        "unknownSample": unknown[:20],
        "failureSample": failures[:20],
    }
    summary_path = CACHE_DIR / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    started = time.time()
    main()
    print(f"Done in {time.time() - started:.1f}s")
