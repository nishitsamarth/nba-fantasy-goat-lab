import { readFile } from "node:fs/promises";
const data=JSON.parse(await readFile("public/data/player-seasons.json","utf8")).seasons;
const modes=["points","categories"];
const value=(p,mode)=>mode==="points"?p.fantasy:p.category*4+28;
const record=(players,mode)=>{
  const total=players.reduce((sum,p)=>sum+value(p,mode),0);
  const center=mode==="points"?180:240;
  return Math.max(0,Math.min(82,Math.round(82/(1+Math.exp(-(total-center)/25)))));
};
const draws=[...new Map(data.map(p=>[`${p.team}-${p.season}`,{team:p.team,season:p.season}])).values()];
const pools=new Map(draws.map(draw=>[`${draw.team}-${draw.season}`,data.filter(p=>p.team===draw.team&&p.season===draw.season)]));
function options(draw,used){return (pools.get(`${draw.team}-${draw.season}`)??[]).filter(p=>!used.has(p.name))}
function optimize(selected,mode){
  let states=[{score:0,picks:[]}];
  for(const draw of selected){
    const next=[];
    for(const state of states)for(const p of options(draw,new Set(state.picks.map(x=>x.name)))){
      next.push({score:state.score+value(p,mode),picks:[...state.picks,p]});
    }
    states=next.sort((a,b)=>b.score-a.score).slice(0,800);
  }
  const beam=states[0]?.picks??[];
  const greedy=[];const used=new Set();
  for(const draw of selected){const pick=options(draw,used).sort((a,b)=>value(b,mode)-value(a,mode))[0];if(pick){greedy.push(pick);used.add(pick.name)}}
  return record(greedy,mode)>record(beam,mode)?greedy:beam;
}
for(const mode of modes){
  const totals={random:0,strong:0,optimal:0,topRandom:0,topStrong:0,topOptimal:0,maxRandom:0,maxStrong:0,maxOptimal:0};
  const bands=Object.fromEntries(["random","strong","optimal"].map(key=>[key,{"0-19":0,"20-39":0,"40-59":0,"60-74":0,"75-81":0,"82-0":0}]));
  const runs=500;
  for(let run=0;run<runs;run++){
    const selected=[...draws].sort(()=>Math.random()-.5).slice(0,5);
    const random=[],strong=[];const randomUsed=new Set(),strongUsed=new Set();
    for(const draw of selected){
      const randomOptions=options(draw,randomUsed).sort((a,b)=>value(b,mode)-value(a,mode)).slice(0,5);
      const randomPick=randomOptions[Math.floor(Math.random()*randomOptions.length)];
      const strongPick=options(draw,strongUsed).sort((a,b)=>value(b,mode)-value(a,mode))[0];
      if(randomPick){random.push(randomPick);randomUsed.add(randomPick.name)}
      if(strongPick){strong.push(strongPick);strongUsed.add(strongPick.name)}
    }
    const best=optimize(selected,mode);
    for(const [key,picks] of [["random",random],["strong",strong],["optimal",best]]){
      const cap=key[0].toUpperCase()+key.slice(1);
      const wins=record(picks,mode);totals[key]+=wins;if(wins>=75)totals[`top${cap}`]++;
      totals[`max${cap}`]=Math.max(totals[`max${cap}`],wins);
      const band=wins===82?"82-0":wins>=75?"75-81":wins>=60?"60-74":wins>=40?"40-59":wins>=20?"20-39":"0-19";
      bands[key][band]++;
    }
  }
  console.log(mode,Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,k.startsWith("top")||k.startsWith("max")?v:(v/runs).toFixed(1)])));
  console.log("distribution",Object.fromEntries(Object.entries(bands).map(([key,counts])=>[key,Object.fromEntries(Object.entries(counts).map(([band,count])=>[band,`${(count/runs*100).toFixed(1)}%`]))])));
}
