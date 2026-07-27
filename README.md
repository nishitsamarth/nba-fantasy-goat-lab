# NBA Fantasy GOAT Lab

Build an all-time five from random franchise-season draws, then face the best
lineup an optimizer could construct from the exact same luck.

NBA Fantasy GOAT Lab is a free, browser-only historical basketball game. It
combines a five-round spin draft, two fantasy scoring lenses, an optimizer, an
82-game strength model, and direct player-season comparisons.

## Game loop

1. Choose Fantasy Points or Nine Category.
2. Spin a random NBA franchise and season.
3. Pick any qualified player from that team-season.
4. Repeat for five rounds.
5. Compare your five with the optimizer's best unique-player combination from
   the identical ordered spins.

One real player may appear only once. Drafting one LeBron James season removes
every other LeBron season from that draft, and the optimizer obeys the same
rule.

## Scoring

### Fantasy Points

The transparent per-game formula is:

```text
PTS + 1.2×REB + 1.5×AST + 3×STL + 3×BLK − TOV
```

### Nine Category

The category index measures a player against the league environment from his
own season across points, rebounds, assists, steals, blocks, estimated threes,
field-goal percentage, free-throw percentage, and turnovers. The browser
converts the category composite into the same draft-strength scale used by the
game without claiming it is an official fantasy-platform score.

## Projected record

The five player values are summed and translated into an 82-game expectation
with a logistic curve. Fantasy Points and Nine Category use separate calibrated
centers. The output is a comparison model, not a claim that players from
different seasons literally shared an NBA schedule.

The repeatable harness in [`scripts/simulate.mjs`](scripts/simulate.mjs) runs
500 random-spin drafts per scoring mode and compares:

- a human-error proxy selecting randomly from the five strongest options;
- a greedy strong drafter;
- the optimizer.

Elite records are attainable but are not the default. The optimizer is also
guarded so it cannot finish below the greedy baseline.

In the final 500-draft calibration, a strong strategy reached 75+ wins in 3.2%
of Fantasy Points drafts and 11.4% of Nine Category drafts. The observed
maximums were 79 and 80 wins respectively; 82–0 remains mathematically
reachable with a rarer concentration of historically elite spins.

## Data architecture

```text
NBA.com Stats historical season records
               │
               ▼
Era Battle audited static archive
               │
               ▼
scripts/build-data.mjs
  - regular seasons
  - team rows (no aggregate TOT rows)
  - 20+ games and 12+ MPG
  - fantasy and league-relative category scores
               │
               ▼
public/data/player-seasons.json
  - 10,317 qualified player-seasons
               │
               ▼
Browser-only draft, optimizer, record model and comparison
```

The source archive covers the league broadly from 1996 onward and includes
verified full-career records for selected earlier legends. The generated site
has no runtime database, API key, rate limit, or paid request.

## Tech stack

- Next.js 16 App Router
- React 19 and TypeScript
- vinext/Vite for the alternate Cloudflare-compatible build
- native Next output for Vercel
- static JSON data
- responsive CSS
- no accounts, analytics, trackers, or paid APIs

## Local development

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm data
pnpm simulate
pnpm lint
pnpm build
pnpm test
```

`pnpm build` creates native Next.js output for Vercel. `pnpm test` also creates
the Vinext build and verifies that its worker server-renders the product rather
than the starter shell.

## Privacy and cost

Drafts and comparisons stay in the browser. There is no authentication or
stored user data. Static hosting can operate at $0.

NBA Fantasy GOAT Lab is not affiliated with or endorsed by the NBA.

## Author

Built by [Nishit Samarth](https://github.com/nishitsamarth).
