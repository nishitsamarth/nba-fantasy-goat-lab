"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
  id: string; name: string; season: string; team: string; games: number; mpg: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; tov: number;
  fgPct: number; ftPct: number; threes: number; fantasy: number; category: number;
};
type Dataset = { generatedAt: string; source: string; seasons: Player[] };
type Mode = "points" | "categories";
type Draw = { team: string; season: string };

const score = (player: Player, mode: Mode) =>
  mode === "points" ? player.fantasy : player.category * 4 + 28;

function projectedRecord(players: Player[], mode: Mode) {
  if (!players.length) return 0;
  const total = players.reduce((sum, player) => sum + score(player, mode), 0);
  const center = mode === "points" ? 180 : 240;
  return Math.max(0, Math.min(82, Math.round(82 / (1 + Math.exp(-(total - center) / 25)))));
}

function optimize(draws: Draw[], players: Player[], mode: Mode) {
  const pools = new Map<string, Player[]>();
  for (const player of players) {
    const key = `${player.team}-${player.season}`;
    pools.set(key, [...(pools.get(key) ?? []), player]);
  }
  const states = new Map<string, { value: number; picks: Player[] }>();
  states.set("", { value: 0, picks: [] });
  for (const draw of draws) {
    const options = pools.get(`${draw.team}-${draw.season}`) ?? [];
    const next = new Map<string, { value: number; picks: Player[] }>();
    for (const state of states.values()) {
      for (const option of options) {
        if (state.picks.some((pick) => pick.name === option.name)) continue;
        const names = [...state.picks.map((pick) => pick.name), option.name].sort().join("|");
        const value = state.value + score(option, mode);
        if (!next.has(names) || next.get(names)!.value < value) {
          next.set(names, { value, picks: [...state.picks, option] });
        }
      }
    }
    const trimmed = [...next.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 800);
    states.clear();
    trimmed.forEach(([key, value]) => states.set(key, value));
  }
  const beam = [...states.values()].sort((a, b) => b.value - a.value)[0] ?? { value: 0, picks: [] };
  const greedy: Player[] = [];
  const used = new Set<string>();
  for (const draw of draws) {
    const pick = (pools.get(`${draw.team}-${draw.season}`) ?? [])
      .filter((player) => !used.has(player.name))
      .sort((a, b) => score(b, mode) - score(a, mode))[0];
    if (pick) { greedy.push(pick); used.add(pick.name); }
  }
  const greedyValue = greedy.reduce((sum, player) => sum + score(player, mode), 0);
  return greedyValue > beam.value ? greedy : beam.picks;
}

function nbaCoach(picks: Player[], optimal: Player[], draws: Draw[], mode: Mode) {
  const recordGap = Math.max(0, projectedRecord(optimal, mode) - projectedRecord(picks, mode));
  const averages = {
    scoring: picks.reduce((sum, p) => sum + p.ppg, 0) / picks.length,
    rebounding: picks.reduce((sum, p) => sum + p.rpg, 0) / picks.length,
    playmaking: picks.reduce((sum, p) => sum + p.apg, 0) / picks.length,
    defense: picks.reduce((sum, p) => sum + p.spg + p.bpg, 0) / picks.length,
    shooting: picks.reduce((sum, p) => sum + p.fgPct, 0) / picks.length,
  };
  const traits = Object.entries(averages).sort((a, b) => b[1] - a[1]);
  const normalized = {
    scoring: averages.scoring / 25,
    rebounding: averages.rebounding / 8,
    playmaking: averages.playmaking / 6,
    defense: averages.defense / 2,
    shooting: averages.shooting / .5,
  };
  const weakest = Object.entries(normalized).sort((a, b) => a[1] - b[1])[0][0];
  const regrets = draws.map((draw, index) => {
    const user = picks[index];
    const alternative = optimal.find((player) => player.team === draw.team && player.season === draw.season);
    return { user, alternative, gap: user && alternative ? score(alternative, mode) - score(user, mode) : 0 };
  }).filter((item) => item.user && item.alternative).sort((a, b) => b.gap - a.gap);
  const regret = regrets[0];
  const star = [...picks].sort((a, b) => score(b, mode) - score(a, mode))[0];
  return {
    headline: recordGap === 0 ? "You built at the optimizer’s level." : `${recordGap} projected ${recordGap === 1 ? "win" : "wins"} separated the two lineups.`,
    strength: `${star.name} drove the lineup, while ${traits[0][0]} was its clearest collective advantage.`,
    weakness: `${weakest[0].toUpperCase()}${weakest.slice(1)} was the lineup’s weakest relative category. That imbalance matters more in ${mode === "categories" ? "nine-category scoring" : "a five-player points lineup"}.`,
    regret: regret && regret.gap > .05
      ? `The largest swing came on ${regret.user.team} ${regret.user.season}: ${regret.user.name} scored ${regret.gap.toFixed(1)} model points below ${regret.alternative!.name}, who was available on the same spin.`
      : "No individual choice created a meaningful gap; the two constructions were effectively even.",
    verdict: recordGap === 0 ? "Championship construction. Your choices survived the full combination check." : recordGap <= 5 ? "A contender with one exploitable lineup imbalance." : "The talent is real, but one costly spin and a category weakness capped the ceiling.",
  };
}

export default function NbaLab() {
  const [data, setData] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<Mode>("points");
  const [draws, setDraws] = useState<Draw[]>([]);
  const [picks, setPicks] = useState<Player[]>([]);
  const [current, setCurrent] = useState<Draw | null>(null);
  const [compare, setCompare] = useState<[string, string]>(["", ""]);

  useEffect(() => {
    fetch("/data/player-seasons.json").then((response) => response.json()).then((payload: Dataset) => {
      setData(payload);
      const jordan = payload.seasons.find((p) => p.name === "Michael Jordan" && p.season === "1990-91");
      const lebron = payload.seasons.find((p) => p.name === "LeBron James" && p.season === "2012-13");
      setCompare([jordan?.id ?? payload.seasons[0]?.id, lebron?.id ?? payload.seasons[1]?.id]);
    });
  }, []);

  const drawPool = useMemo(() => {
    if (!data) return [];
    const used = new Set(draws.map((draw) => `${draw.team}-${draw.season}`));
    return [...new Map(data.seasons.map((p) => [`${p.team}-${p.season}`, { team: p.team, season: p.season }])).values()]
      .filter((draw) => !used.has(`${draw.team}-${draw.season}`));
  }, [data, draws]);
  const options = useMemo(() => !data || !current ? [] : data.seasons
    .filter((p) => p.team === current.team && p.season === current.season && !picks.some((pick) => pick.name === p.name))
    .sort((a, b) => score(b, mode) - score(a, mode)), [data, current, picks, mode]);
  const complete = picks.length === 5;
  const optimal = useMemo(() => data && complete ? optimize(draws, data.seasons, mode) : [], [data, complete, draws, mode]);
  const players = data?.seasons ?? [];
  const left = players.find((p) => p.id === compare[0]);
  const right = players.find((p) => p.id === compare[1]);
  const coach = complete ? nbaCoach(picks, optimal, draws, mode) : null;

  const spin = () => setCurrent(drawPool[Math.floor(Math.random() * drawPool.length)]);
  const draft = (player: Player) => {
    if (!current) return;
    setPicks((value) => [...value, player]);
    setDraws((value) => [...value, current]);
    setCurrent(null);
  };
  const reset = (nextMode = mode) => { setMode(nextMode); setPicks([]); setDraws([]); setCurrent(null); };

  if (!data) return <main className="loading">Opening the archive…</main>;
  return <main>
    <header className="topbar"><a href="#" className="brand"><b>GOAT</b><span>NBA LAB</span></a><nav><a href="#draft">Draft</a><a href="#compare">Compare</a><span>{data.seasons.length.toLocaleString()} seasons</span></nav></header>
    <section className="hero">
      <div className="hero-copy"><p className="kicker">THE ENTIRE LEAGUE. ONE IMPOSSIBLE DRAFT.</p><h1>Build a five that could go <em>82–0.</em></h1><p>Spin a franchise and season. Pick any player. Then see the perfect team an optimizer would have built from your exact luck.</p><a href="#draft" className="cta">ENTER THE DRAFT ↓</a></div>
      <div className="court-mark" aria-hidden="true"><span>5</span><b>ROUNDS</b></div>
    </section>
    <section className="marquee"><span>POINTS · NINE CAT · 82 GAMES · EVERY ERA · NO DUPLICATE PLAYERS · </span></section>

    <section className="draft" id="draft">
      <div className="section-head"><span>01 / THE SPIN DRAFT</span><h2>Same luck.<br/>Better decisions.</h2></div>
      <div className="mode-switch">
        <button className={mode === "points" ? "active" : ""} onClick={() => reset("points")}>Fantasy points</button>
        <button className={mode === "categories" ? "active" : ""} onClick={() => reset("categories")}>Nine category</button>
      </div>
      {!complete ? <div className="draft-stage">
        <aside><b>ROUND {picks.length + 1}</b><span>OF 5</span>{picks.map((pick, index) => <p key={pick.id}>{index + 1}. {pick.name}</p>)}</aside>
        <div className="spin-panel">
          {!current ? <><span className="ball">?</span><button onClick={spin}>SPIN<br/><small>TEAM + SEASON</small></button></> :
          <><div className="draw"><small>YOUR DRAW</small><strong>{current.team}</strong><b>{current.season}</b></div>
          <div className="choices">{options.slice(0, 9).map((player) => <button key={player.id} onClick={() => draft(player)}>
            <span><b>{player.name}</b><small>{player.ppg} PTS · {player.rpg} REB · {player.apg} AST</small></span><strong>{score(player, mode).toFixed(1)}</strong>
          </button>)}</div></>}
        </div>
      </div> : <div className="results">
        <article><small>YOUR FIVE</small><strong>{projectedRecord(picks, mode)}–{82 - projectedRecord(picks, mode)}</strong>{picks.map((p) => <p key={p.id}>{p.name} <span>{p.season}</span></p>)}</article>
        <div className="versus">VS</div>
        <article className="optimal"><small>PERFECT COMBINATION</small><strong>{projectedRecord(optimal, mode)}–{82 - projectedRecord(optimal, mode)}</strong>{optimal.map((p) => <p key={p.id}>{p.name} <span>{p.season}</span></p>)}</article>
        {coach && <section className="coach-report">
          <div><small>FILM ROOM</small><h3>{coach.headline}</h3><p>{coach.verdict}</p></div>
          <article><small>IDENTITY</small><p>{coach.strength}</p></article>
          <article><small>WEAK LINK</small><p>{coach.weakness}</p></article>
          <article><small>BIGGEST SWING</small><p>{coach.regret}</p></article>
        </section>}
        <button className="again" onClick={() => reset()}>RUN IT BACK</button>
      </div>}
      <p className="method">Projected records translate lineup strength into an 82-game expectation with a calibrated logistic curve. They are a comparison model—not a claim that these players literally shared a schedule.</p>
    </section>

    <section className="compare" id="compare">
      <div className="section-head light"><span>02 / SEASON DUEL</span><h2>Two seasons.<br/>No nostalgia.</h2></div>
      <div className="compare-pickers">{[0, 1].map((side) => <select key={side} value={compare[side]} onChange={(event) => setCompare(side === 0 ? [event.target.value, compare[1]] : [compare[0], event.target.value])}>
        {players.slice().sort((a,b) => a.name.localeCompare(b.name) || b.season.localeCompare(a.season)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.season} · {p.team}</option>)}
      </select>)}</div>
      {left && right && <div className="duel">
        {[left, right].map((p) => <article key={p.id}><small>{p.team} · {p.season}</small><h3>{p.name}</h3><b>{score(p, mode).toFixed(1)}</b><span>{mode === "points" ? "fantasy PPG" : "category index"}</span>
          <div><p>{p.ppg}<small>PTS</small></p><p>{p.rpg}<small>REB</small></p><p>{p.apg}<small>AST</small></p><p>{p.spg + p.bpg}<small>STOCKS</small></p></div>
        </article>)}
      </div>}
    </section>
    <footer><b>NBA FANTASY GOAT LAB</b><p>Static data. Transparent scoring. Zero accounts.</p><a href="https://github.com/nishitsamarth/nba-fantasy-goat-lab">SOURCE ↗</a></footer>
  </main>;
}
