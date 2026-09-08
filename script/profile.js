// Chart.js を使って断面図を描く
import { getElevationsAlongPolyline } from './elevation.js';

let currentChart = null;

export async function drawElevationProfileFromSpots(spots, canvasId = 'elevationChart', intervalMeters = 50){
  if(!spots || spots.length < 2) return;
  // spots: [{lat,lng},...]
  const latlngs = spots.map(s => ({ lat: s.lat, lng: s.lng }));
  const pts = await getElevationsAlongPolyline(latlngs, intervalMeters);

  const labels = pts.map((_,i) => (i * intervalMeters / 1000).toFixed(3) + 'km');
  const data = pts.map(p => p.elevation === null ? null : p.elevation);

  const ctx = document.getElementById(canvasId).getContext('2d');
  if(currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '標高 (m)',
        data,
        borderColor: 'rgb(75,192,192)',
        fill: true,
        backgroundColor: 'rgba(75,192,192,0.08)',
        pointRadius: 0,
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display:true, text: '距離 (km)' } },
        y: { title: { display:true, text: '標高 (m)' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}