// script.js
const apiBase = ""; // Base URL (empty = same origin)
const ctx = document.getElementById("sensorChart").getContext("2d");

let sensorChart;
let fullData = [];
let currentRange = "week";
let locked = false;
let remoteActive = false;

// pull CSS vars
const css = getComputedStyle(document.documentElement);
const COLOR_WHITE = css.getPropertyValue("--white").trim();
const COLOR_ACCENT = css.getPropertyValue("--accent").trim();

// fetch & parse sensor readings
async function fetchData() {
  console.log("📥 Fetching readings...");
  try {
    const res = await fetch(`${apiBase}/readings`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    fullData = data
      .map(r => ({ ts: new Date(r.timestamp), temp: r.temperature ?? 0, door: r.door_open }))
      .sort((a, b) => a.ts - b.ts);
    console.log(`✅ ${fullData.length} readings loaded. Latest at ${fullData[fullData.length-1]?.ts}`);
  } catch (err) {
    console.error("❌ fetchData error:", err);
  }
}

// build time buckets
function buildBuckets(range) {
  const now = Date.now();
  let stepMs, count, labelFn;
  switch (range) {
    case "hour": stepMs = 5 * 60e3; count = 12; labelFn = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`; break;
    case "day":  stepMs = 60 * 60e3; count = 24; labelFn = d => `${d.getHours()}:00`; break;
    case "week": stepMs = 24 * 60 * 60e3; count = 7; labelFn = d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]; break;
    case "all":
      if (!fullData.length) { stepMs = now; count = 1; labelFn = () => "All Time"; }
      else {
        const first = fullData[0].ts.getTime();
        const dayMs = 24 * 60 * 60e3;
        count = Math.ceil((now - first) / dayMs) + 1;
        stepMs = dayMs;
        labelFn = d => `${d.getMonth()+1}/${d.getDate()}`;
      }
      break;
    default:
      return [];
  }
  return Array.from({ length: count }, (_, i) => {
    const end = now - (count - i - 1) * stepMs;
    return { start: end - stepMs, end, label: labelFn(new Date(end)) };
  });
}

// aggregate counts & last-temp
function aggregate(range) {
  const buckets = buildBuckets(range);
  const counts = new Array(buckets.length).fill(0);
  const temps  = new Array(buckets.length).fill(null);

  for (const d of fullData) {
    const i = buckets.findIndex(b => d.ts >= b.start && d.ts < b.end);
    if (i >= 0) {
      if (d.door) counts[i]++;
      temps[i] = d.temp;
    }
  }
  console.log(`🔢 Aggregated (${range}):`, counts, temps);
  return { labels: buckets.map(b => b.label), counts, temps };
}

// draw/update chart
function renderChart(range) {
  console.log(`📊 Rendering chart for '${range}'`);
  const { labels, counts, temps } = aggregate(range);
  const cfg = {
    type: 'line',
    data: { labels, datasets: [
      { label: "Door Opens", data: counts, borderColor: COLOR_WHITE, backgroundColor: `${COLOR_WHITE}40`, fill: true, tension: 0.3, yAxisID: 'y1' },
      { label: "Temp (°C)", data: temps, borderColor: COLOR_ACCENT, fill: false, tension: 0.4, spanGaps: true, yAxisID: 'y2' }
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: {
        y1: { position: 'left',  ticks:{color:COLOR_WHITE} },
        y2: { position: 'right', ticks:{color:COLOR_ACCENT} },
        x:  { ticks:{color:COLOR_WHITE} }
      }
    }
  };

  if (!sensorChart) sensorChart = new Chart(ctx, cfg);
  else { sensorChart.data = cfg.data; sensorChart.update(); }
}

// DOM helpers
function hideLoadingOverlay() {
  const el = document.getElementById("overlay");
  if (el) el.style.display = 'none';
}
function hideWarningOverlay() {
  const el = document.getElementById("warningOverlay");
  if (el) el.style.display = 'none';
}
function showWarningOverlay(ts) {
  console.log(`⚠️ Warning: door opened at ${ts}`);
  const el = document.getElementById("warningOverlay");
  if (!el) return;
  document.getElementById("warningTime").innerText = ts.toLocaleString();
  el.style.display = 'block';
}
function clearAlert() {
  const el = document.getElementById("alerts"); if (el) el.style.display = 'none';
}
function showAlert(text) {
  console.log(`🚨 Alert: ${text}`);
  const el = document.getElementById("alerts");
  if (el) { el.innerText = text; el.style.display = 'block'; }
}

// fetch remote flag
async function fetchRemoteActive() {
  console.log("🔄 Fetching remote status...");
  try {
    const res = await fetch(`${apiBase}/remote/active`);
    if (!res.ok) throw new Error(res.status);
    const obj = await res.json();
    remoteActive = Boolean(obj.active);
    console.log(`✅ remoteActive=${remoteActive}`);
  } catch (err) {
    console.error("❌ fetchRemoteActive error:", err);
  }
}

// main renderer
async function renderAll() {
  hideLoadingOverlay();
  clearAlert();

  await fetchRemoteActive();
  document.getElementById("remoteSwitch").checked = remoteActive;
  document.getElementById("remoteStatus").innerText = remoteActive ? 'Remote On':'Remote Off';

  await fetchData();
  const latest = fullData[fullData.length-1] || {};

  if (locked && latest.door) {
    showWarningOverlay(latest.ts);
    // hide after 3s, then rerun
    setTimeout(() => {
      hideWarningOverlay();
      renderAll();
    }, 3000);
    return;
  }

  hideWarningOverlay();
  renderChart(currentRange);

  if (latest.temp >= 50) showAlert("🔥 FIRE DETECTED!");
}

// UI bindings
for (const btn of document.querySelectorAll(".timeframe-selector button")) {
  btn.addEventListener('click', () => {
    document.querySelector(".timeframe-selector .active").classList.remove('active');
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    renderAll();
  });
}

document.getElementById("lockSwitch").addEventListener('change', e => {
  locked = e.target.checked;
  console.log(`🔒 Lock toggled: ${locked}`);
  document.getElementById("lockStatus").innerText = locked ? 'Locked':'Unlocked';
  document.body.classList.toggle('locked', locked);
  fetch(`${apiBase}/command`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:locked?'lock':'unlock'}) })
    .then(()=>console.log(`✅ Command sent`))
    .catch(err=>console.error('❌ command error:',err));
  renderAll();
});

document.getElementById("remoteSwitch").addEventListener('change', e => {
  remoteActive = e.target.checked;
  console.log(`📡 Remote toggled: ${remoteActive}`);
  document.getElementById("remoteStatus").innerText = remoteActive ? 'Remote On':'Remote Off';
  fetch(`${apiBase}/remote/active`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({active:remoteActive}) })
    .then(()=>console.log(`✅ Remote update`))
    .catch(err=>console.error('❌ remote update error:',err));
});

// init
(async()=>{
  hideLoadingOverlay();
  await fetchRemoteActive();
  document.getElementById("remoteSwitch").checked = remoteActive;
  document.getElementById("remoteStatus").innerText = remoteActive ? 'Remote On':'Remote Off';
  renderAll();
  setInterval(renderAll, 10000);
})();