const apiBase = '';
const tempCtx = document.getElementById('tempChart').getContext('2d');
let tempChart;

// Fetch and chart readings
async function updateChart() {
  const res = await fetch(`${apiBase}/readings`);
  const data = await res.json();
  const labels = data.slice().reverse().map(r => new Date(r.timestamp).toLocaleTimeString());
  const temps  = data.slice().reverse().map(r => r.temperature);

  if (!tempChart) {
    tempChart = new Chart(tempCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label:'Temp (°C)', data:temps, borderColor:'teal', fill:false }]
      }
    });
  } else {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = temps;
    tempChart.update();
  }
}

// Send command
document.getElementById('sendCmd').onclick = async () => {
  const action = document.getElementById('cmdInput').value;
  await fetch(`${apiBase}/command`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action })
  });
  document.getElementById('cmdStatus').innerText = 'Sent!';
};

// Poll commands
async function pollCommand() {
  const res = await fetch(`${apiBase}/command`);
  const cmd = await res.json();
  console.log('Command:', cmd);
}

// Init
updateChart();
setInterval(updateChart, 5000);
setInterval(pollCommand, 2000);
