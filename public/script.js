const apiBase = '';
const ctx     = document.getElementById('sensorChart').getContext('2d');
let sensorChart, fullData = [];
let currentRange = 'week';
let locked = false;

// Fetch readings
async function fetchData() {
  const res = await fetch(`${apiBase}/readings`);
  fullData = (await res.json())
    .map(r => ({
      ts:  new Date(r.timestamp),
      temp: r.temperature ?? 0,
      door: r.door_open
    }))
    .sort((a,b)=>a.ts - b.ts);
}

// Build buckets for given range
function buildBuckets(range) {
  const now = Date.now();
  let stepMs, count, labelFn;
  switch(range) {
    case 'hour':  stepMs=5*60e3;   count=12; labelFn=d=>`${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; break;
    case 'day':   stepMs=60*60e3;  count=24; labelFn=d=>`${d.getHours()}:00`; break;
    case 'week':  stepMs=24*60*60e3; count=7; labelFn=d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]; break;
    case 'month': stepMs=24*60*60e3; count=30; labelFn=d=>`${d.getMonth()+1}/${d.getDate()}`; break;
  }
  return Array.from({length:count},(_,i)=>{
    const end   = now - (count - i -1)*stepMs;
    const start = end - stepMs;
    return {start,end,label:labelFn(new Date(end))};
  });
}

// Aggregate data into count + avg temp
function aggregate(range) {
  const buckets = buildBuckets(range);
  const counts  = buckets.map(()=>0);
  const temps   = buckets.map(()=>[]);
  fullData.forEach(d=>{
    buckets.forEach((b,i)=>{
      if (d.ts.getTime()>=b.start && d.ts.getTime()<b.end) {
        if (d.door) counts[i]++;
        temps[i].push(d.temp);
      }
    });
  });
  const avgTemps = temps.map(arr=>arr.length?arr.reduce((a,b)=>a+b)/arr.length:null);
  return {
    labels: buckets.map(b=>b.label),
    counts,
    avgTemps
  };
}

// Render line chart
function renderChart(range) {
  const {labels, counts, avgTemps} = aggregate(range);
  const cfg = {
    type:'line',
    data:{
      labels,
      datasets:[
        {
          label:'Door Opens',
          data:counts,
          borderColor:'#f5f5dc',
          fill:true,
          tension:0.3,
          yAxisID:'y1'
        },
        {
          label:'Avg Temp',
          data:avgTemps,
          borderColor:'#ef4444',
          fill:false,
          tension:0.4,
          spanGaps:true,
          yAxisID:'y2'
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        y1:{type:'linear',position:'left',ticks:{color:'#f5f5dc'}},
        y2:{type:'linear',position:'right',ticks:{color:'#f5f5dc'}},
        x:{ticks:{color:'#f5f5dc'}}
      },
      plugins:{legend:{labels:{color:'#f5f5dc'},position:'top'}}
    }
  };
  if (!sensorChart) sensorChart = new Chart(ctx, cfg);
  else {
    sensorChart.data = cfg.data;
    sensorChart.options = cfg.options;
    sensorChart.update();
  }
}

// Show alerts banner
function showAlert(text, color) {
  const a = document.getElementById('alerts');
  a.innerText = text; a.style.background = color; a.style.display = 'block';
}
function clearAlert() {
  document.getElementById('alerts').style.display = 'none';
}

// Timeframe buttons
document.querySelectorAll('.timeframe-buttons button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelector('.timeframe-buttons .active').classList.remove('active');
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    renderAll();
  });
});

// Lock/Unlock buttons
document.getElementById('lockBtn').onclick = async ()=>{
  await fetch(`${apiBase}/command`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'lock'})
  });
  locked = true;
  document.getElementById('lockStatus').innerText = 'Locked';
  document.getElementById('lockBtn').classList.add('active');
  document.getElementById('unlockBtn').classList.remove('active');
};
document.getElementById('unlockBtn').onclick = async ()=>{
  await fetch(`${apiBase}/command`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'unlock'})
  });
  locked = false;
  document.getElementById('lockStatus').innerText = 'Unlocked';
  document.getElementById('unlockBtn').classList.add('active');
  document.getElementById('lockBtn').classList.remove('active');
};

// Full update: data + chart + alerts
async function renderAll() {
  await fetchData();
  renderChart(currentRange);

  // fire alert if any temp >= threshold
  if (fullData.some(d=>d.temp >= 50)) {
    showAlert('🔥 FIRE DETECTED!', 'red');
    return;
  }

  // door alert if locked & any door open
  if (locked && fullData.some(d=>d.door)) {
    showAlert('⚠️ Door opened while LOCKED!', 'orange');
    return;
  }

  clearAlert();
}

(async()=>{
  await fetchData();
  renderChart(currentRange);
  setInterval(renderAll, 10000);
})();
