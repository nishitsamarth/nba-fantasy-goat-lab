import { readFile, writeFile, mkdir } from "node:fs/promises";

const source = JSON.parse(
  await readFile("/Users/nishitsamarth/Desktop/era-battle/src/data/player-seasons.json", "utf8"),
);
const value = (input) => Number.isFinite(input) ? input : 0;

const rows = source
  .filter((row) =>
    row.seasonType === "Regular Season" &&
    row.team !== "TOT" &&
    row.games >= 20 &&
    row.mpg >= 12
  )
  .map((row) => ({
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
    ftPct: value(row.ftPct),
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
  const metrics = ["ppg", "rpg", "apg", "spg", "bpg", "threes", "fgPct", "ftPct"];
  const means = Object.fromEntries(metrics.map((metric) => [
    metric,
    seasonRows.reduce((sum, row) => sum + row[metric], 0) / seasonRows.length,
  ]));
  const stds = Object.fromEntries(metrics.map((metric) => [
    metric,
    Math.sqrt(seasonRows.reduce((sum, row) => sum + (row[metric] - means[metric]) ** 2, 0) / seasonRows.length) || 1,
  ]));
  for (const row of seasonRows) {
    const positive = metrics.reduce((sum, metric) => sum + (row[metric] - means[metric]) / stds[metric], 0);
    const turnovers = (row.tov - 1.8) / 0.9;
    row.category = positive - turnovers;
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
