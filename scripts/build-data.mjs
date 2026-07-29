import { readFile, writeFile, mkdir } from "node:fs/promises";

const source = JSON.parse(
  await readFile("/Users/nishitsamarth/Desktop/era-battle/src/data/player-seasons.json", "utf8"),
);
const parseCsvLine = (line) => {
  const values = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") { value += "\""; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
};
const normalizeName = (name) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const positionCsv = await readFile("scripts/data/NBA_PLAYERS.csv", "utf8");
const positionMap = new Map(positionCsv.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
  const [name,,, position] = parseCsvLine(line);
  return [normalizeName(name), position.match(/Guard|Forward|Center/g) ?? []];
}));
const value = (input) => Number.isFinite(input) ? input : 0;
const rolesFor = (row, listedPositions) => {
  const roles = new Set();
  const [primary, secondary] = listedPositions;
  if (primary === "Guard") { roles.add("guard"); roles.add("wing"); }
  if (primary === "Forward") { roles.add("wing"); roles.add("big"); }
  if (primary === "Center") roles.add("big");
  if (primary === "Forward" && secondary === "Guard") roles.add("guard");
  const positionless = row.ppg >= 20 && row.apg >= 5 && row.rpg >= 7 && row.spg >= 1.3;
  if (positionless) { roles.add("guard"); roles.add("wing"); roles.add("big"); }
  if (!roles.size) {
    const bigProfile = row.rpg >= 7.5 || row.bpg >= 1.2;
    if (row.apg >= 4 && !bigProfile) roles.add("guard");
    if (!bigProfile) roles.add("wing");
    if (bigProfile) roles.add("big");
  }
  return [...roles];
};

const rows = source
  .filter((row) =>
    row.seasonType === "Regular Season" &&
    row.team !== "TOT" &&
    row.games >= 20 &&
    row.mpg >= 12
  )
  .map((row) => ({
    listedPositions: positionMap.get(normalizeName(row.name)) ?? [],
    id: row.playerId,
    name: row.name,
    season: row.season,
    team: row.team,
    games: row.games,
    mpg: row.mpg,
    ppg: value(row.ppg),
    rpg: value(row.rpg),
    apg: value(row.apg),
    spg: value(row.spg),
    bpg: value(row.bpg),
    tov: value(row.tov),
    fgPct: value(row.fgPct),
    threePct: value(row.fg3Pct),
    ftPct: value(row.ftPct),
    tsPct: value(row.tsPct),
    threes: Math.max(0, ((row.fg3Pct ?? 0) * 6.2)),
    fantasy: value(row.ppg) + value(row.rpg) * 1.2 + value(row.apg) * 1.5 +
      value(row.spg) * 3 + value(row.bpg) * 3 - value(row.tov),
  }));

const bySeason = new Map();
for (const row of rows) {
  if (!bySeason.has(row.season)) bySeason.set(row.season, []);
  bySeason.get(row.season).push(row);
}

for (const seasonRows of bySeason.values()) {
  const metrics = ["ppg", "rpg", "apg", "spg", "bpg", "threePct", "fgPct", "ftPct"];
  const means = Object.fromEntries(metrics.map((metric) => [
    metric,
    seasonRows.reduce((sum, row) => sum + row[metric], 0) / seasonRows.length,
  ]));
  const stds = Object.fromEntries(metrics.map((metric) => [
    metric,
    Math.sqrt(seasonRows.reduce((sum, row) => sum + (row[metric] - means[metric]) ** 2, 0) / seasonRows.length) || 1,
  ]));
  for (const row of seasonRows) {
    const cats = metrics.map((metric) => (row[metric] - means[metric]) / stds[metric]);
    cats.push(-(row.tov - 1.8) / 0.9);
    row.cats = cats.map((metric) => Number(metric.toFixed(3)));
    row.category = cats.reduce((sum, metric) => sum + metric, 0);
    row.roles = rolesFor(row, row.listedPositions);
    row.position = row.listedPositions.join(" / ") || "Statistical fallback";
    row.positionSource = row.listedPositions.length ? "listed" : "inferred";
    delete row.listedPositions;
  }
}

await mkdir("public/data", { recursive: true });
await writeFile(
  "public/data/player-seasons.json",
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "NBA.com Stats via Era Battle static dataset",
    seasons: rows,
  }),
);
console.log(`Wrote ${rows.length} player-seasons.`);
const listed = rows.filter((row) => row.positionSource === "listed").length;
console.log(`Position coverage: ${listed}/${rows.length} rows (${(listed / rows.length * 100).toFixed(1)}%).`);
