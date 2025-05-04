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
      .map((r) => ({
        ts: new Date(r.timestamp),
        temp: r.temperature ?? 0,
        door: r.door_open,
      }))
      .sort((a, b) => a.ts - b.ts);
    console.log(
      `✅ ${fullData.length} readings loaded. Latest at ${
        fullData[fullData.length - 1]?.ts
      }`
    );
  } catch (err) {
    console.error("❌ fetchData error:", err);
  }
}

// make time buckets for counts & last-temp
function buildBuckets(range) {
  const now = Date.now();
  let stepMs, count, labelFn;
  switch (range) {
    case "hour":
      stepMs = 5 * 60e3;
      count = 12;
      labelFn = (d) =>
        `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
      break;
    case "day":
      stepMs = 60 * 60e3;
      count = 24;
      labelFn = (d) => `${d.getHours()}:00`;
      break;
    case "week":
      stepMs = 24 * 60 * 60e3;
      count = 7;
      labelFn = (d) =>
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
      break;
    case "all":
      if (!fullData.length) {
        stepMs = now;
        count = 1;
        labelFn = () => "All Time";
      } else {
        const first = fullData[0].ts.getTime();
        const dayMs = 24 * 60 * 60e3;
        count = Math.ceil((now - first) / dayMs) + 1;
        stepMs = dayMs;
        labelFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
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

// aggregate counts and last temp per bucket
function aggregate(range) {
  const buckets = buildBuckets(range);
  const counts = buckets.map(() => 0);
  const temps = buckets.map(() => null);

  fullData.forEach((d) => {
    const idx = buckets.findIndex((b) => d.ts >= b.start && d.ts < b.end);
    if (idx !== -1) {
      if (d.door) counts[idx]++;
      temps[idx] = d.temp;
    }
  });

  console.log(`🔢 Aggregated (${range}):`, counts, temps);
  return { labels: buckets.map((b) => b.label), counts, temps };
}

// draw or update the chart
function renderChart(range) {
  console.log(`📊 Rendering chart for '${range}'`);
  const { labels, counts, temps } = aggregate(range);
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Door Opens",
          data: counts,
          borderColor: COLOR_WHITE,
          backgroundColor: `${COLOR_WHITE}40`,
          fill: true,
          tension: 0.3,
          yAxisID: "y1",
        },
        {
          label: "Temp (°C)",
          data: temps,
          borderColor: COLOR_ACCENT,
          fill: false,
          tension: 0.4,
          spanGaps: true,
          yAxisID: "y2",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y1: { position: "left", ticks: { color: COLOR_WHITE } },
        y2: { position: "right", ticks: { color: COLOR_ACCENT } },
        x: { ticks: { color: COLOR_WHITE } },
      },
    },
  };

  if (!sensorChart) sensorChart = new Chart(ctx, cfg);
  else {
    sensorChart.data = cfg.data;
    sensorChart.update();
  }
}

// overlay & alerts
function showAlert(text) {
  console.log(`🚨 Alert: ${text}`);
  const a = document.getElementById("alerts");
  a.innerText = text;
  a.style.display = "block";
}
function clearAlert() {
  document.getElementById("alerts").style.display = "none";
}
function showOverlay(ts) {
  console.log(`⚠️ Warning at ${ts}`);
  document.getElementById("warningTime").innerText = ts.toLocaleString();
  document.getElementById("warningOverlay").style.display = "block";
}
function hideOverlay() {
  document.getElementById("warningOverlay").style.display = "none";
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

// main loop
async function renderAll() {
  hideOverlay();
  clearAlert();

  await fetchRemoteActive();
  document.getElementById("remoteSwitch").checked = remoteActive;
  document.getElementById("remoteStatus").innerText = remoteActive
    ? "Remote On"
    : "Remote Off";

  await fetchData();
  const latest = fullData[fullData.length - 1] || {};

  if (locked && latest.door) {
    showOverlay(latest.ts);
    setTimeout(renderAll, 3000);
    return;
  }

  renderChart(currentRange);
  if (latest.temp >= 50) showAlert("🔥 FIRE DETECTED!");
}

// UI bindings

document.querySelectorAll(".timeframe-selector button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelector(".timeframe-selector .active")
      .classList.remove("active");
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    renderAll();
  });
});

document.getElementById("lockSwitch").addEventListener("change", (e) => {
  locked = e.target.checked;
  console.log(`🔒 Lock toggled: ${locked}`);
  document.getElementById("lockStatus").innerText = locked
    ? "Locked"
    : "Unlocked";
  document.body.classList.toggle("locked", locked);
  fetch(`${apiBase}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: locked ? "lock" : "unlock" }),
  })
    .then(() => console.log(`✅ Command sent: ${locked ? "lock" : "unlock"}`))
    .catch((err) => console.error("❌ command error:", err));
  renderAll();
});

document.getElementById("remoteSwitch").addEventListener("change", (e) => {
  remoteActive = e.target.checked;
  console.log(`📡 Remote toggled: ${remoteActive}`);
  document.getElementById("remoteStatus").innerText = remoteActive
    ? "Remote On"
    : "Remote Off";
  fetch(`${apiBase}/remote/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active: remoteActive }),
  })
    .then(() => console.log(`✅ Remote update: ${remoteActive}`))
    .catch((err) => console.error("❌ remote update error:", err));
});

// init
(async () => {
  hideOverlay();
  await fetchRemoteActive();
  document.getElementById("remoteSwitch").checked = remoteActive;
  document.getElementById("remoteStatus").innerText = remoteActive
    ? "Remote On"
    : "Remote Off";
  renderAll();
  setInterval(renderAll, 10000);
})();
