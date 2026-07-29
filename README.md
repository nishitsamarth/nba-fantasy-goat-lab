# NBA Fantasy GOAT Lab

Build a legal all-time five from random franchise-season draws, then face the
best lineup an optimizer could construct from the exact same luck.

NBA Fantasy GOAT Lab is a free, browser-only historical basketball game. It
combines a five-round role draft, two scoring lenses, a lineup optimizer, an
82-game strength model, postgame coaching, and direct player-season comparisons.

## Game loop

1. Choose Fantasy Points or Category Balance.
2. Spin a random NBA franchise and season.
3. Compare the players using their visible box-score statistics—internal model
   scores are deliberately hidden while drafting.
4. Pick a qualified player and choose which open lineup role he fills.
5. Reassign or swap drafted players with visible role buttons—there are no
   hidden position menus.
6. Fill one guard slot, two wing slots, one big slot and one extra slot.
7. Compare the legal five with the optimizer's best legal combination from the
   identical ordered spins.
8. Start a new draft from the results screen; the board clears and returns to
   round one automatically.

One real player may appear only once. Drafting one LeBron James season removes
every other LeBron season from that draft, and the optimizer obeys the same
rule.

## Scoring

### Film-room explanation

Completed drafts receive a deterministic lineup diagnosis rather than only a record. The film room describes the five’s strongest collective trait, weakest relative category, largest single decision swing, same-spin alternative, and projected-win cost. The language changes for Fantasy Points and Category Balance and is produced locally without generated text or API calls.

### Fantasy Points

The transparent per-game formula is:

```text
PTS + 1.2×REB + 1.5×AST + 3×STL + 3×BLK − TOV
```

### Category Balance

The category model measures a player against the league environment from his
own season across points, rebounds, assists, steals, blocks, three-point
percentage, field-goal percentage, free-throw percentage, and turnovers. It
then applies a penalty when a completed lineup has one badly exposed category,
so five individually strong seasons are not automatically the best collective
five. It is a transparent category-balance model, not a literal implementation
of a specific fantasy platform's nine-category rules.

## Lineup roles

The build joins the NBA season archive to a 5,000-player historical position
reference. Listed positions cover 98% of qualified player-season rows. Career
position order is preserved so a primary center is not converted into a wing
merely because his secondary listing says forward.

- **Primary Guard:** Guard and Wing.
- **Primary Forward:** Wing and Big; a secondary Guard listing also adds Guard.
- **Primary Center:** Big. A secondary Forward listing does not turn a primary
  center such as Nikola Jokić into a wing.
- **Extra:** every qualified player.

A deliberately strict positionless test adds Guard, Wing and Big eligibility
only when a season combines 20+ PPG, 5+ APG, 7+ RPG and 1.3+ SPG. This preserves
the anywhere-on-the-board behavior for genuinely unusual seasons such as peak
LeBron without applying it to every playmaking big.

Assignments are never permanently locked: the interface permits legal moves at
any time and swaps two players when both remain eligible for their new roles.
The remaining 1.9% of unmatched rows receive a documented statistical fallback.

The current audited archive contains three-point percentage but not three-point
makes or attempts. Percentage is shown as a drafting statistic but is
deliberately excluded from role inference because percentage without volume can
misclassify tiny samples. A future data refresh can add combined volume and
accuracy once FG3M/FG3A are retained in the source snapshot.

## Projected record

The legal five's strength is translated into an 82-game expectation with a
logistic curve. Fantasy Points and Category Balance use separate calibrated
centers. The output is a comparison model, not a claim that players from
different seasons literally shared an NBA schedule.

The repeatable harness in [`scripts/simulate.mjs`](scripts/simulate.mjs) runs
500 random-spin drafts per scoring mode and compares:

- a human-error proxy selecting randomly from the five strongest options;
- a greedy strong drafter;
- the optimizer.

Elite records are attainable but are not the default. The optimizer evaluates
legal role assignments across the exact same five ordered spins.

The redesigned harness also enforces the five lineup roles. In a 500-draft
calibration, strong play averaged roughly 61 wins in Fantasy Points and 65 wins
in Category Balance. The optimizer averaged roughly 61 and 67 respectively.
Elite outcomes remained possible without becoming automatic.

### Calibration distributions

| Fantasy Points record | Random top-five | Strong | Optimizer |
| --- | ---: | ---: | ---: |
| 0–19 | 7.4% | 0.0% | 0.0% |
| 20–39 | 40.0% | 0.8% | 0.4% |
| 40–59 | 44.8% | 43.2% | 39.8% |
| 60–74 | 7.4% | 52.6% | 56.2% |
| 75–81 | 0.4% | 3.4% | 3.6% |

| Category Balance record | Random top-five | Strong | Optimizer |
| --- | ---: | ---: | ---: |
| 0–19 | 5.4% | 0.0% | 0.0% |
| 20–39 | 31.2% | 2.2% | 1.4% |
| 40–59 | 43.2% | 20.4% | 16.2% |
| 60–74 | 19.4% | 59.2% | 61.0% |
| 75–81 | 0.8% | 18.2% | 21.4% |

The separation between casual, strong, and optimized play remains visible while
role assignment adds a second decision layer beyond simply choosing the largest
number.

## Data architecture

```text
NBA.com season records       Historical position reference
          │                    (5,000+ players)
          ▼                           │
Era Battle audited archive           ▼
          └──────────────┬────────────┘
                         ▼
scripts/build-data.mjs
  - regular seasons
  - team rows (no aggregate TOT rows)
  - 20+ games and 12+ MPG
  - fantasy and league-relative category inputs
  - normalized-name position join
  - Guard/Wing/Big/Extra eligibility
  - strict positionless and unmatched-row fallbacks
                         │
                         ▼
public/data/player-seasons.json
  - 10,317 qualified player-seasons
                         │
                         ▼
Browser-only legal-lineup draft, optimizer, record model and comparison
```

The source archive covers the league broadly from 1996 onward and includes
verified full-career records for selected earlier legends. The generated site
has no runtime database, API key, rate limit, or paid request.

The build-time position reference is the public
[V2 NBA Player Database](https://www.kaggle.com/datasets/flynn28/v2-nba-player-database),
which identifies itself as Basketball-Reference-derived. It is bundled only for
static data generation; the live game makes no position-data request.

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
