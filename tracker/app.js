let D;const $=id=>document.getElementById(id);
fetch('data.json').then(r=>r.json()).then(d=>{D=d;init()});
function init(){$('updated').textContent=D.updated;
 $('legend').textContent='Readiness: '+Object.entries(D.levels).map(([k,v])=>k+' = '+v).join(' · ');
 const n=D.entries.length,sum=D.entries.reduce((a,e)=>a+e.level,0),pct=Math.round(sum/(n*5)*100);
 $('pct').textContent=pct+'%';setTimeout(()=>$('fill').style.width=pct+'%',50);
 $('method').textContent=`Method: every tracked system counts equally. Each system's readiness (0–5) is divided by 5, and the ${n} systems are averaged: ${sum} of ${n*5} possible points. This measures how close each replacement is to routine clinical use. It is not a measure of body mass or of how much of any one person has been replaced.`;
 ['sort','filter','q'].forEach(i=>$(i).addEventListener('input',render));render()}
function render(){const s=$('sort').value,f=$('filter').value,q=$('q').value.toLowerCase();
 let L=D.entries.filter(e=>f==='all'||(f==='4'?e.level>=4:f==='2'?e.level>=2&&e.level<=3:e.level<=1))
  .filter(e=>!q||JSON.stringify(e).toLowerCase().includes(q));
 L.sort((a,b)=>s==='name'?a.system.localeCompare(b.system):s==='level-asc'?a.level-b.level:b.level-a.level);
 $('cards').innerHTML=L.map(e=>`<article class="card"><h3>${e.system}<span class="lvl ${e.level<4?'low':''}">${e.level}/5 · ${D.levels[e.level]}</span></h3>
 <div class="dots">${[1,2,3,4,5].map(i=>`<i class="${i<=e.level?'on':''}"></i>`).join('')}</div>
 <span class="tag">${e.type}${e.aboveNeck?' · above the neck':''}</span><div class="ex">${e.example}</div><p>${e.status}</p>
 <p><b>Bottleneck:</b> ${e.bottleneck}</p>${e.goal?`<p class="goal">${e.goal}</p>`:''}
 <div class="src">${e.sources.map(x=>`<a href="${x.url}" target="_blank" rel="noopener">${x.label} (${x.date}) ↗</a>`).join('')}</div></article>`).join('')||'<p>No matches.</p>'}
