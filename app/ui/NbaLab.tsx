"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "guard" | "wing" | "big" | "extra";
type Player = {
  id: string; name: string; season: string; team: string; games: number; mpg: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; tov: number;
  fgPct: number; threePct: number; ftPct: number; tsPct: number; threes: number; fantasy: number;
  category: number; cats: number[]; roles: Exclude<Role, "extra">[];
  position: string; positionSource: "listed" | "inferred";
};
type Dataset = { generatedAt: string; source: string; seasons: Player[] };
type Mode = "points" | "categories";
type Draw = { team: string; season: string };
type Slot = { key: Role | "wing2"; label: string; role: Role };
type Pick = { player: Player; slotKey: Slot["key"]; draw: Draw };

const SLOTS: Slot[] = [
  { key: "guard", label: "Guard", role: "guard" },
  { key: "wing", label: "Wing 1", role: "wing" },
  { key: "wing2", label: "Wing 2", role: "wing" },
  { key: "big", label: "Big", role: "big" },
  { key: "extra", label: "Extra", role: "extra" },
];
const CAT_LABELS = ["PTS", "REB", "AST", "STL", "BLK", "3P%", "FG%", "FT%", "TOV"];
const eligible = (player: Player, slot: Slot) => slot.role === "extra" || player.roles.includes(slot.role);
const playerValue = (player: Player, mode: Mode) => mode === "points" ? player.fantasy : player.category * 4 + 28;

function lineupValue(players: Player[], mode: Mode) {
  if (mode === "points") return players.reduce((sum, player) => sum + player.fantasy, 0);
  const totals = CAT_LABELS.map((_, index) => players.reduce((sum, player) => sum + (player.cats[index] ?? 0), 0));
  const base = 140 + totals.reduce((sum, value) => sum + value * 4, 0);
  const balanceAdjustment = Math.min(...totals) * 3;
  return base + balanceAdjustment;
}

function projectedRecord(players: Player[], mode: Mode) {
  if (players.length !== 5) return 0;
  const total = lineupValue(players, mode);
  const center = mode === "points" ? 180 : 218;
  const spread = 25;
  return Math.max(0, Math.min(82, Math.round(82 / (1 + Math.exp(-(total - center) / spread)))));
}

function optimize(draws: Draw[], players: Player[], mode: Mode) {
  const pools = new Map<string, Player[]>();
  players.forEach((player) => {
    const key = `${player.team}-${player.season}`;
    pools.set(key, [...(pools.get(key) ?? []), player]);
  });
  type State = { mask: number; picks: Pick[]; value: number };
  let states: State[] = [{ mask: 0, picks: [], value: 0 }];
  draws.forEach((draw) => {
    const options = pools.get(`${draw.team}-${draw.season}`) ?? [];
    const next: State[] = [];
    states.forEach((state) => {
      SLOTS.forEach((slot, slotIndex) => {
        if (state.mask & (1 << slotIndex)) return;
        options.filter((player) => eligible(player, slot)).forEach((player) => {
          if (state.picks.some((pick) => pick.player.name === player.name)) return;
          const picks = [...state.picks, { player, slotKey: slot.key, draw }];
          const value = mode === "points"
            ? state.value + player.fantasy
            : lineupValue(picks.map((pick) => pick.player), mode);
          next.push({ mask: state.mask | (1 << slotIndex), picks, value });
        });
      });
    });
    states = next.sort((a, b) => b.value - a.value).slice(0, 2500);
  });
  return states.find((state) => state.mask === (1 << SLOTS.length) - 1)?.picks ?? [];
}

function teamProfile(players: Player[]) {
  const values = {
    scoring: players.reduce((sum, p) => sum + p.ppg, 0) / players.length / 25,
    rebounding: players.reduce((sum, p) => sum + p.rpg, 0) / players.length / 8,
    playmaking: players.reduce((sum, p) => sum + p.apg, 0) / players.length / 6,
    defense: players.reduce((sum, p) => sum + p.spg + p.bpg, 0) / players.length / 2,
    efficiency: players.reduce((sum, p) => sum + p.tsPct, 0) / players.length / .57,
  };
  return Object.entries(values).sort((a, b) => b[1] - a[1]);
}

function nbaCoach(picks: Pick[], optimal: Pick[], mode: Mode) {
  const players = picks.map((pick) => pick.player);
  const optimalPlayers = optimal.map((pick) => pick.player);
  const recordGap = Math.max(0, projectedRecord(optimalPlayers, mode) - projectedRecord(players, mode));
  const profile = teamProfile(players);
  const regrets = picks.map((pick) => {
    const alternative = optimal.find((candidate) =>
      candidate.draw.team === pick.draw.team && candidate.draw.season === pick.draw.season)?.player;
    return { pick, alternative, gap: alternative ? playerValue(alternative, mode) - playerValue(pick.player, mode) : 0 };
  }).sort((a, b) => b.gap - a.gap);
  const regret = regrets[0];
  const star = [...players].sort((a, b) => playerValue(b, mode) - playerValue(a, mode))[0];
  return {
    headline: recordGap === 0 ? "You matched the optimizer’s projected record." : `${recordGap} projected ${recordGap === 1 ? "win" : "wins"} separated the lineups.`,
    strength: `${star.name} drove the lineup. ${profile[0][0][0].toUpperCase()}${profile[0][0].slice(1)} grades as its clearest collective strength.`,
    weakness: `${profile.at(-1)![0][0].toUpperCase()}${profile.at(-1)![0].slice(1)} is the weakest part of the team profile, even after every required lineup role is filled.`,
    regret: regret?.alternative && regret.gap > .05
      ? `On the ${regret.pick.draw.team} ${regret.pick.draw.season} spin, ${regret.alternative.name} offered ${regret.gap.toFixed(1)} more ${mode === "points" ? "fantasy" : "category"} value than ${regret.pick.player.name}.`
      : "No individual selection created a meaningful gap; the difference came from lineup-wide category balance.",
    verdict: recordGap === 0 ? "The roster passed both the talent and construction tests." : recordGap <= 5 ? "A contender with one identifiable upgrade." : "The names are good; the construction left too much value on the board.",
  };
}

export default function NbaLab() {
  const [data, setData] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<Mode>("points");
  const [draws, setDraws] = useState<Draw[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
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

  const openSlots = SLOTS.filter((slot) => !picks.some((pick) => pick.slotKey === slot.key));
  const drawPool = useMemo(() => {
    if (!data) return [];
    const usedDraws = new Set(draws.map((draw) => `${draw.team}-${draw.season}`));
    const usedPlayers = new Set(picks.map((pick) => pick.player.name));
    return [...new Map(data.seasons.map((player) => [`${player.team}-${player.season}`, { team: player.team, season: player.season }])).values()]
      .filter((draw) => !usedDraws.has(`${draw.team}-${draw.season}`))
      .filter((draw) => data.seasons.some((player) =>
        player.team === draw.team && player.season === draw.season && !usedPlayers.has(player.name) &&
        openSlots.some((slot) => eligible(player, slot))));
  }, [data, draws, picks, openSlots]);
  const options = useMemo(() => {
    if (!data || !current) return [];
    const usedPlayers = new Set(picks.map((pick) => pick.player.name));
    return data.seasons.filter((player) =>
      player.team === current.team && player.season === current.season && !usedPlayers.has(player.name) &&
      openSlots.some((slot) => eligible(player, slot)))
      .sort((a, b) => playerValue(b, mode) - playerValue(a, mode));
  }, [data, current, picks, mode, openSlots]);
  const complete = picks.length === SLOTS.length;
  const optimal = useMemo(() => data && complete ? optimize(draws, data.seasons, mode) : [], [data, complete, draws, mode]);
  const players = data?.seasons ?? [];
  const left = players.find((player) => player.id === compare[0]);
  const right = players.find((player) => player.id === compare[1]);
  const yourPlayers = picks.map((pick) => pick.player);
  const optimalPlayers = optimal.map((pick) => pick.player);
  const coach = complete ? nbaCoach(picks, optimal, mode) : null;

  const spin = () => drawPool.length && setCurrent(drawPool[Math.floor(Math.random() * drawPool.length)]);
  const draft = (player: Player, slotKey: Slot["key"]) => {
    if (!current) return;
    setPicks((value) => [...value, { player, slotKey, draw: current }]);
    setDraws((value) => [...value, current]);
    setCurrent(null);
  };
  const reassign = (playerId: string, targetKey: Slot["key"]) => {
    setPicks((currentPicks) => {
      const moving = currentPicks.find((pick) => pick.player.id === playerId);
      const target = currentPicks.find((pick) => pick.slotKey === targetKey);
      if (!moving || moving.slotKey === targetKey) return currentPicks;
      const sourceSlot = SLOTS.find((slot) => slot.key === moving.slotKey)!;
      const targetSlot = SLOTS.find((slot) => slot.key === targetKey)!;
      if (!eligible(moving.player, targetSlot) || (target && !eligible(target.player, sourceSlot))) return currentPicks;
      return currentPicks.map((pick) =>
        pick.player.id === moving.player.id ? { ...pick, slotKey: targetKey } :
        target && pick.player.id === target.player.id ? { ...pick, slotKey: moving.slotKey } : pick);
    });
  };
  const canReassign = (pick: Pick, targetSlot: Slot) => {
    if (!eligible(pick.player, targetSlot)) return false;
    const occupant = picks.find((candidate) => candidate.slotKey === targetSlot.key);
    const sourceSlot = SLOTS.find((slot) => slot.key === pick.slotKey)!;
    return !occupant || occupant.player.id === pick.player.id || eligible(occupant.player, sourceSlot);
  };
  const reset = (nextMode = mode) => { setMode(nextMode); setPicks([]); setDraws([]); setCurrent(null); };
  if (!data) return <main className="loading">Opening the archive…</main>;

  return <main>
    <header className="topbar"><a href="#" className="brand"><b>GOAT</b><span>NBA LAB</span></a><nav><a href="#draft">Draft</a><a href="#compare">Compare</a><span>{data.seasons.length.toLocaleString()} seasons</span></nav></header>
    <section className="hero">
      <div className="hero-copy"><p className="kicker">TALENT ISN&apos;T ENOUGH. BUILD A REAL FIVE.</p><h1>Draft a lineup with <em>structure.</em></h1><p>Spin a franchise and season. Choose a player and the role he fills. The optimizer gets your exact luck—but it can punish bad roster construction.</p><a href="#draft" className="cta">ENTER THE DRAFT ↓</a></div>
      <div className="court-mark" aria-hidden="true"><span>5</span><b>ROLES</b></div>
    </section>
    <section className="marquee"><span>ONE GUARD · TWO WINGS · ONE BIG · ONE EXTRA · SAME SPINS · NO DUPLICATES · </span></section>

    <section className="draft" id="draft">
      <div className="section-head"><span>01 / THE LINEUP DRAFT</span><h2>Same luck.<br/>Real choices.</h2></div>
      <div className="mode-switch">
        <button className={mode === "points" ? "active" : ""} onClick={() => reset("points")}>Fantasy points</button>
        <button className={mode === "categories" ? "active" : ""} onClick={() => reset("categories")}>Category balance</button>
      </div>
      <div className="role-rules">{SLOTS.map((slot) => <span className={picks.some((pick) => pick.slotKey === slot.key) ? "filled" : ""} key={slot.key}>{slot.label}</span>)}</div>
      {!complete ? <div className="draft-stage">
        <aside><b>ROUND {picks.length + 1}</b><span>OF 5</span>{SLOTS.map((slot) => {
          const pick = picks.find((item) => item.slotKey === slot.key);
          return <p key={slot.key}><small>{slot.label}</small>{pick ? <><b>{pick.player.name}</b><select aria-label={`Move ${pick.player.name}`} value={pick.slotKey} onChange={(event) => reassign(pick.player.id, event.target.value as Slot["key"])}>
            {SLOTS.map((target) => <option key={target.key} value={target.key} disabled={!canReassign(pick, target)}>{target.label}</option>)}
          </select></> : "OPEN"}</p>;
        })}</aside>
        <div className="spin-panel">
          {!current ? <><span className="ball">?</span><button onClick={spin}>SPIN<br/><small>TEAM + SEASON</small></button></> :
          <><div className="draw"><small>YOUR DRAW</small><strong>{current.team}</strong><b>{current.season}</b></div>
          <div className="choices">{options.map((player) => {
            const roles = openSlots.filter((slot) => eligible(player, slot));
            return <article key={player.id}>
              <div className="choice-heading"><b>{player.name}</b><small>{player.position} · {player.games} GP · {player.mpg.toFixed(1)} MPG</small></div>
              <div className={`stat-line ${mode === "categories" ? "nine" : ""}`}>
                <span><b>{player.ppg}</b><small>PTS</small></span>
                <span><b>{player.rpg}</b><small>REB</small></span>
                <span><b>{player.apg}</b><small>AST</small></span>
                <span><b>{player.spg}</b><small>STL</small></span>
                <span><b>{player.bpg}</b><small>BLK</small></span>
                {mode === "points"
                  ? <span><b>{player.tov}</b><small>TOV</small></span>
                  : <>
                    <span><b>{(player.threePct * 100).toFixed(1)}</b><small>3P%</small></span>
                    <span><b>{(player.fgPct * 100).toFixed(1)}</b><small>FG%</small></span>
                    <span><b>{(player.ftPct * 100).toFixed(1)}</b><small>FT%</small></span>
                    <span><b>{player.tov}</b><small>TOV</small></span>
                  </>}
              </div>
              <div className="role-actions">{roles.map((slot) => <button key={slot.key} onClick={() => draft(player, slot.key)}>Draft as {slot.label}</button>)}</div>
            </article>;
          })}</div></>}
        </div>
      </div> : <div className="results">
        <article><small>YOUR FIVE</small><strong>{projectedRecord(yourPlayers, mode)}–{82 - projectedRecord(yourPlayers, mode)}</strong>{SLOTS.map((slot) => {
          const pick = picks.find((item) => item.slotKey === slot.key);
          return <p key={slot.key}><b>{slot.label}</b><span className="result-player">{pick?.player.name}<small>{pick?.player.season}</small>{pick && <select aria-label={`Reassign ${pick.player.name}`} value={pick.slotKey} onChange={(event) => reassign(pick.player.id, event.target.value as Slot["key"])}>
            {SLOTS.map((target) => <option key={target.key} value={target.key} disabled={!canReassign(pick, target)}>{target.label}</option>)}
          </select>}</span></p>;
        })}</article>
        <div className="versus">VS</div>
        <article className="optimal"><small>PERFECT LEGAL FIVE</small><strong>{projectedRecord(optimalPlayers, mode)}–{82 - projectedRecord(optimalPlayers, mode)}</strong>{SLOTS.map((slot) => {
          const pick = optimal.find((item) => item.slotKey === slot.key);
          return <p key={slot.key}><b>{slot.label}</b>{pick?.player.name}<span>{pick?.player.season}</span></p>;
        })}</article>
        {coach && <section className="coach-report">
          <div><small>FILM ROOM</small><h3>{coach.headline}</h3><p>{coach.verdict}</p></div>
          <article><small>IDENTITY</small><p>{coach.strength}</p></article>
          <article><small>WEAK LINK</small><p>{coach.weakness}</p></article>
          <article><small>BIGGEST SWING</small><p>{coach.regret}</p></article>
        </section>}
        <button className="again" onClick={() => reset()}>RUN IT BACK</button>
      </div>}
      <p className="method">A legal five must fill one guard slot, two wing slots, one big slot and one extra slot. Eligibility comes from listed career positions for 98% of the player pool, with primary position taking precedence. A deliberately strict positionless threshold allows rare seasons such as peak LeBron to fit every role without treating playmaking centers as wings. Category Balance mode compares nine available box-score dimensions and penalizes a lineup whose weakest category is badly exposed.</p>
    </section>

    <section className="compare" id="compare">
      <div className="section-head light"><span>02 / SEASON DUEL</span><h2>Two seasons.<br/>No nostalgia.</h2></div>
      <div className="compare-pickers">{[0, 1].map((side) => <select key={side} value={compare[side]} onChange={(event) => setCompare(side === 0 ? [event.target.value, compare[1]] : [compare[0], event.target.value])}>
        {players.slice().sort((a,b) => a.name.localeCompare(b.name) || b.season.localeCompare(a.season)).map((player) => <option key={player.id} value={player.id}>{player.name} · {player.season} · {player.team}</option>)}
      </select>)}</div>
      {left && right && <div className="duel">
        {[left, right].map((player) => <article key={player.id}><small>{player.team} · {player.season}</small><h3>{player.name}</h3><b>{playerValue(player, mode).toFixed(1)}</b><span>{mode === "points" ? "fantasy value" : "category value"}</span>
          <div><p>{player.ppg}<small>PTS</small></p><p>{player.rpg}<small>REB</small></p><p>{player.apg}<small>AST</small></p><p>{player.spg + player.bpg}<small>STOCKS</small></p></div>
          <p className="eligibility">{player.position} · Eligible: {player.roles.join(" · ")} · extra{player.positionSource === "inferred" ? " · statistical fallback" : ""}</p>
        </article>)}
      </div>}
    </section>
    <footer><b>NBA FANTASY GOAT LAB</b><p>Static data. Transparent roles. Zero accounts.</p><a href="https://github.com/nishitsamarth/nba-fantasy-goat-lab">SOURCE ↗</a></footer>
  </main>;
}
