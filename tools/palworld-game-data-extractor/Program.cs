using CUE4Parse.FileProvider;
using CUE4Parse.FileProvider.Vfs;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Engine;
using CUE4Parse.UE4.Objects.UObject;
using CUE4Parse.UE4.Versions;
using CUE4Parse.UE4.VirtualFileSystem;
using Newtonsoft.Json;

if (args.Length != 3)
{
    Console.Error.WriteLine("Usage: PalworldGameDataExtractor <pak-directory> <mapping.usmap> <output.json>");
    return 2;
}

var aliases = new Dictionary<string, string>
{
    ["items"] = @"Pal\Content\Pal\DataTable\Item\DT_ItemDataTable",
    ["recipes"] = @"Pal\Content\Pal\DataTable\Item\DT_ItemRecipeDataTable",
    ["palDrops"] = @"Pal\Content\Pal\DataTable\Character\DT_PalDropItem",
    ["itemLottery"] = @"Pal\Content\Pal\DataTable\Item\DT_ItemLotteryDataTable",
    ["itemPickup"] = @"Pal\Content\Pal\DataTable\Item\DT_ItemPickupDataTable",
    ["shopCreate"] = @"Pal\Content\Pal\DataTable\Item\Shop\DT_ItemShopCreateData_Common",
    ["shopLottery"] = @"Pal\Content\Pal\DataTable\Item\Shop\DT_ItemShopLotteryData_Common",
    ["shopSettings"] = @"Pal\Content\Pal\DataTable\Item\Shop\DT_ItemShopSettingData_Common",
    ["technology"] = @"Pal\Content\Pal\DataTable\Technology\DT_TechnologyRecipeUnlock",
    ["mapObjectLottery"] = @"Pal\Content\Pal\DataTable\MapObject\DT_MapObjectLotteryDataTable",
    ["mapObjectProducts"] = @"Pal\Content\Pal\DataTable\MapObject\DT_MapObjectItemProductDataTable",
    ["raidBoss"] = @"Pal\Content\Pal\Blueprint\RaidBoss\DT_PalRaidBoss",
    ["raidBossCommon"] = @"Pal\Content\Pal\Blueprint\RaidBoss\DT_PalRaidBoss_Common",
};

#pragma warning disable CS0618 // The path-based constructor is required for runtime-selected Steam libraries.
using var provider = new DefaultFileProvider(args[0], SearchOption.AllDirectories, false,
    new VersionContainer(EGame.GAME_UE5_1));
#pragma warning restore CS0618
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(args[1]);
provider.Initialize();

var archives = provider.UnloadedVfs.ToArray();
if (archives.Length == 0)
{
    throw new InvalidOperationException($"Could not find Palworld archives under {args[0]}.");
}
// Current builds distribute authoritative tables across the base pak and patch/chunk archives.
foreach (var archive in archives)
{
    archive.MountTo((FileProviderDictionary)provider.Files, StringComparer.OrdinalIgnoreCase);
}

var export = new Dictionary<string, object>();
var unavailable = new List<string>();
var decodedTables = new Dictionary<string, object>();
var decodedAssets = new Dictionary<string, object>();
var failures = new Dictionary<string, string>();
var decodedRows = 0;
var candidates = provider.Files.Keys
    .Where(file => file.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
    .Where(file => file.Contains("/DataTable/", StringComparison.OrdinalIgnoreCase) ||
        Path.GetFileName(file).StartsWith("DT_", StringComparison.OrdinalIgnoreCase))
    .OrderBy(file => file, StringComparer.OrdinalIgnoreCase)
    .ToArray();

// Candidate discovery covers tables in feature-specific folders and every mounted patch chunk.
foreach (var mountedPath in candidates)
{
    var packagePath = mountedPath[..^".uasset".Length];
    try
    {
#pragma warning disable CS0618 // Compatibility API remains available across the pinned CUE4Parse release.
        var table = provider.LoadPackageObjects(packagePath).OfType<UDataTable>().FirstOrDefault();
#pragma warning restore CS0618
        if (table is not null)
        {
            decodedTables[packagePath.Replace('\\', '/')] = table.RowMap;
            decodedRows += table.RowMap.Count;
        }
    }
    catch (Exception error)
    {
        failures[packagePath.Replace('\\', '/')] = $"{error.GetType().Name}: {error.Message}";
    }
}

// Treasure-box access requirements live on Blueprint defaults rather than in the reward DataTables.
// Decode this narrow asset family so audits can relate required keys to the lottery fields used at runtime.
var treasureBoxAssets = provider.Files.Keys
    .Where(file => file.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
    .Where(file => file.Contains("/MapObject/Object/TreasureBox/", StringComparison.OrdinalIgnoreCase))
    .OrderBy(file => file, StringComparer.OrdinalIgnoreCase)
    .ToArray();
foreach (var mountedPath in treasureBoxAssets)
{
    var packagePath = mountedPath[..^".uasset".Length];
    try
    {
#pragma warning disable CS0618 // Compatibility API remains available across the pinned CUE4Parse release.
        var objects = provider.LoadPackageObjects(packagePath);
#pragma warning restore CS0618
        decodedAssets[packagePath.Replace('\\', '/')] = objects.Select(value => new
        {
            value.Name,
            value.ExportType,
            ScriptBytecode = value is UStruct structure ? structure.ScriptBytecode.Select(expression => new
            {
                Type = expression.GetType().Name,
                Text = expression.ToString(),
            }).ToArray() : null,
            Properties = value.Properties.ToDictionary(
                property => property.Name.Text,
                property => property.Tag?.GenericValue),
        }).ToArray();
    }
    catch (Exception error)
    {
        failures[packagePath.Replace('\\', '/')] = $"{error.GetType().Name}: {error.Message}";
    }
}

foreach (var (name, asset) in aliases)
{
    try
    {
        var mountedPath = provider.Files.Keys.FirstOrDefault(file =>
            file.Equals($"{asset}.uasset", StringComparison.OrdinalIgnoreCase) ||
            file.EndsWith($"/{Path.GetFileName(asset)}.uasset", StringComparison.OrdinalIgnoreCase));
        var packagePath = mountedPath is null ? asset : mountedPath[..^".uasset".Length];
#pragma warning disable CS0618 // Compatibility API remains available across the pinned CUE4Parse release.
        var table = provider.LoadPackageObjects(packagePath).OfType<UDataTable>().FirstOrDefault();
#pragma warning restore CS0618
        if (table is null)
        {
            unavailable.Add(name);
            continue;
        }
        export[name] = table.RowMap;
    }
    catch (KeyNotFoundException)
    {
        unavailable.Add(name);
    }
}
export["_unavailable"] = unavailable;
export["_decodedTables"] = decodedTables;
export["_decodedAssets"] = decodedAssets;
export["_metadata"] = new
{
    mountedAssets = provider.Files.Count,
    candidateTables = candidates.Length,
    decodedTables = decodedTables.Count,
    decodedRows,
    decodedAssets = decodedAssets.Count,
    nonTableCandidates = candidates.Length - decodedTables.Count - failures.Count,
    failedCandidates = failures.Count,
    aliases = aliases.ToDictionary(pair => pair.Key, pair => pair.Value.Replace('\\', '/')),
    failures,
};

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[2]))!);
File.WriteAllText(args[2], JsonConvert.SerializeObject(export, Formatting.None));
Console.WriteLine($"Exported {decodedTables.Count} discovered tables and {aliases.Count - unavailable.Count} stable aliases to {args[2]}.");
return 0;
