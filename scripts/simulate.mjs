import { readFile } from "node:fs/promises";

const data=JSON.parse(await readFile("public/data/player-seasons.json","utf8")).seasons;
const modes=["points","categories"];
const slots=[
  {key:"guard",role:"guard"},{key:"wing",role:"wing"},
  {key:"wing2",role:"wing"},{key:"big",role:"big"},{key:"extra",role:"extra"},
];
const eligible=(player,slot)=>slot.role==="extra"||player.roles.includes(slot.role);
const lineupValue=(players,mode)=>{
  if(mode==="points")return players.reduce((sum,p)=>sum+p.fantasy,0);
  const cats=Array.from({length:9},(_,index)=>players.reduce((sum,p)=>sum+(p.cats[index]??0),0));
  return 140+cats.reduce((sum,value)=>sum+value*4,0)+Math.min(...cats)*3;
};
const record=(players,mode)=>{
  const total=lineupValue(players,mode);
  const center=mode==="points"?180:218;
  const spread=25;
  return Math.max(0,Math.min(82,Math.round(82/(1+Math.exp(-(total-center)/spread)))));
};
const draws=[...new Map(data.map(p=>[`${p.team}-${p.season}`,{team:p.team,season:p.season}])).values()];
const pools=new Map(draws.map(draw=>[`${draw.team}-${draw.season}`,data.filter(p=>p.team===draw.team&&p.season===draw.season)]));
const options=(draw,used)=> (pools.get(`${draw.team}-${draw.season}`)??[]).filter(p=>!used.has(p.name));

function optimize(selected,mode){
  let states=[{mask:0,picks:[],value:0}];
  for(const draw of selected){
    const next=[];
    for(const state of states)for(let slotIndex=0;slotIndex<slots.length;slotIndex++){
      if(state.mask&(1<<slotIndex))continue;
      for(const player of options(draw,new Set(state.picks.map(p=>p.name))).filter(p=>eligible(p,slots[slotIndex]))){
        const picks=[...state.picks,player];
        next.push({mask:state.mask|(1<<slotIndex),picks,value:lineupValue(picks,mode)});
      }
    }
    states=next.sort((a,b)=>b.value-a.value).slice(0,2500);
  }
  return states.find(state=>state.mask===(1<<slots.length)-1)?.picks??[];
}

function draft(selected,mode,strong){
  const picks=[];const used=new Set();const filled=new Set();
  for(const draw of selected){
    const candidates=[];
    for(const player of options(draw,used))for(const slot of slots){
      if(filled.has(slot.key)||!eligible(player,slot))continue;
      candidates.push({player,slot,value:mode==="points"?player.fantasy:player.category*4+28});
    }
    candidates.sort((a,b)=>b.value-a.value);
    const choice=strong?candidates[0]:candidates[Math.floor(Math.random()*Math.min(candidates.length,5))];
    if(!choice) return [];
    picks.push(choice.player);used.add(choice.player.name);filled.add(choice.slot.key);
  }
  return picks;
}

for(const mode of modes){
  const bands=Object.fromEntries(["random","strong","optimal"].map(key=>[key,{"0-19":0,"20-39":0,"40-59":0,"60-74":0,"75-81":0,"82-0":0}]));
  const totals={random:0,strong:0,optimal:0,maxRandom:0,maxStrong:0,maxOptimal:0};
  const runs=500;
  for(let run=0;run<runs;run++){
    const selected=[...draws].sort(()=>Math.random()-.5).slice(0,5);
    const groups={random:draft(selected,mode,false),strong:draft(selected,mode,true),optimal:optimize(selected,mode)};
    if(Object.values(groups).some(picks=>picks.length!==5)){run--;continue}
    for(const [key,picks] of Object.entries(groups)){
      const wins=record(picks,mode);totals[key]+=wins;
      const cap=key[0].toUpperCase()+key.slice(1);totals[`max${cap}`]=Math.max(totals[`max${cap}`],wins);
      const band=wins===82?"82-0":wins>=75?"75-81":wins>=60?"60-74":wins>=40?"40-59":wins>=20?"20-39":"0-19";
      bands[key][band]++;
    }
  }
  console.log(mode,{
    averageRandom:(totals.random/runs).toFixed(1),averageStrong:(totals.strong/runs).toFixed(1),averageOptimal:(totals.optimal/runs).toFixed(1),
    maxRandom:totals.maxRandom,maxStrong:totals.maxStrong,maxOptimal:totals.maxOptimal,
  });
  console.log("distribution",Object.fromEntries(Object.entries(bands).map(([key,counts])=>[
    key,Object.fromEntries(Object.entries(counts).map(([band,count])=>[band,`${(count/runs*100).toFixed(1)}%`])),
  ])));
}
