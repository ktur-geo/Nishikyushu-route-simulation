export function drawRadarChart({ canvasId, scores }) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (window._radarChart) window._radarChart.destroy();

  window._radarChart = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: ['沿線人口', 'コスト効率', '時間効率', '観光アクセス', '開発余地'],
      datasets: [{
        label: 'このルート',
        data: scores,
        backgroundColor: 'rgba(155, 28, 49, 0.20)',
        borderColor: '#9b1c31',
        borderWidth: 2,
        pointBackgroundColor: '#9b1c31',
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 20, backdropColor: 'transparent', font: { size: 10 } },
          pointLabels: { font: { size: 12, weight: '600' } },
          grid: { color: 'rgba(0,0,0,0.12)' },
          angleLines: { color: 'rgba(0,0,0,0.12)' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}
