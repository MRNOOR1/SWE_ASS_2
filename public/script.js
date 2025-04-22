const apiBase = "";
const ctx = document.getElementById("sensorChart").getContext("2d");
let sensorChart,
  fullData = [];
let currentRange = "week";
let locked = false;

// pull CSS vars
const css = getComputedStyle(document.documentElement);
const COLOR_WHITE = css.getPropertyValue("--white").trim();
const COLOR_ACCENT = css.getPropertyValue("--accent").trim();

// fetch & parse
async function fetchData() {
  const res = await fetch(`${apiBase}/readings`);
  fullData = (await res.json())
    .map((r) => ({
      ts: new Date(r.timestamp),
      temp: r.temperature || 0,
      door: r.door_open,
    }))
    .sort((a, b) => a.ts - b.ts);
}

// make buckets
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
    const start = end - stepMs;
    return { start, end, label: labelFn(new Date(end)) };
  });
}

// aggregate
function aggregate(range) {
  const buckets = buildBuckets(range);
  const counts = buckets.map(() => 0);
  const temps = buckets.map(() => []);
  fullData.forEach((d) => {
    buckets.forEach((b, i) => {
      if (d.ts.getTime() >= b.start && d.ts.getTime() < b.end) {
        if (d.door) counts[i]++;
        temps[i].push(d.temp);
      }
    });
  });
  const avgTemps = temps.map((arr) =>
    arr.length ? arr.reduce((a, b) => a + b) / arr.length : null
  );
  return { labels: buckets.map((b) => b.label), counts, avgTemps };
}

// draw chart
function renderChart(range) {
  const { labels, counts, avgTemps } = aggregate(range);
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Door Opens",
          data: counts,
          borderColor: COLOR_WHITE,
          fill: true,
          tension: 0.3,
          yAxisID: "y1",
        },
        {
          label: "Avg Temp",
          data: avgTemps,
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
      interaction: { mode: "index", intersect: false },
      scales: {
        y1: { type: "linear", position: "left", ticks: { color: COLOR_WHITE } },
        y2: {
          type: "linear",
          position: "right",
          ticks: { color: COLOR_WHITE },
        },
        x: { ticks: { color: COLOR_WHITE } },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 18,
            boxHeight: 18,
            padding: 16,
            font: { size: 14, weight: "bold" },
            color: COLOR_WHITE,
          },
        },
      },
    },
  };
  if (!sensorChart) sensorChart = new Chart(ctx, cfg);
  else {
    sensorChart.data = cfg.data;
    sensorChart.options = cfg.options;
    sensorChart.update();
  }
}

// alerts
function showAlert(text, color) {
  const a = document.getElementById("alerts");
  a.innerText = text;
  a.style.background = color;
  a.style.display = "block";
}
function clearAlert() {
  document.getElementById("alerts").style.display = "none";
}

// send lock/unlock
async function sendCommand(action) {
  await fetch(`${apiBase}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

// full render
async function renderAll() {
  await fetchData();
  renderChart(currentRange);

  if (fullData.some((d) => d.temp >= 50)) {
    showAlert("🔥 FIRE DETECTED!", COLOR_ACCENT);
    return;
  }
  if (locked && fullData.some((d) => d.door)) {
    showAlert("⚠️ Door opened while LOCKED!", "orange");
    return;
  }
  clearAlert();
}

// hookup buttons
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

// hookup lock toggle
document.getElementById("lockSwitch").addEventListener("change", async (e) => {
  locked = e.target.checked;
  document.getElementById("lockStatus").innerText = locked
    ? "Locked"
    : "Unlocked";
  document.body.classList.toggle("locked", locked);
  await sendCommand(locked ? "lock" : "unlock");
  renderAll();
});

// init loop
(async () => {
  await renderAll();
  setInterval(renderAll, 10000);
})();
