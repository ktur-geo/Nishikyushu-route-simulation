import { setRouteReadOnly } from './points.js';
import { getMap, setBaseMap, getBaseMapState } from './map.js';
import {
  getPopulationMeshesInBounds,
  POPULATION_MESH_LAT_STEP,
  POPULATION_MESH_LNG_STEP
} from './population.js';
import { getLandUseData } from './landuse.js';
import { get100mMeshCode } from './utils.js';
import {
  LAND_USE_CATEGORIES,
  LAND_USE_DISPLAY_ORDER,
  getLandUseLabel,
  getLandUseColor
} from './landuse-categories.js';

const POPULATION_CLASSES = [
  { max: 99,       color: '#2c7bb6', label: '1〜99人' },
  { max: 249,      color: '#00a6ca', label: '100〜249人' },
  { max: 499,      color: '#00bfa5', label: '250〜499人' },
  { max: 999,      color: '#a6d96a', label: '500〜999人' },
  { max: 1999,     color: '#fdae61', label: '1,000〜1,999人' },
  { max: Infinity, color: '#d7191c', label: '2,000人以上' }
];

const GSI_RELIEF_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>' +
  '｜海域部は海上保安庁海洋情報部の資料を使用して作成';

function getPopulationClass(population) {
  return POPULATION_CLASSES.find(item => population <= item.max)
    || POPULATION_CLASSES[POPULATION_CLASSES.length - 1];
}

let populationLayer;
let tourismLayer;
let landUseLayer;
let elevationLayer;
let touristSpotsPromise;
let updateTimer;
let populationRenderer;

function clearLayer(layer) {
  if (layer) layer.clearLayers();
}

function setStatus(message) {
  const status = document.getElementById('data-mode-status');
  if (status) status.textContent = message;
}

function setBaseMapNote() {
  const note = document.getElementById('data-basemap-note');
  if (!note) return;

  const state = getBaseMapState();
  if (state.selected === 'gsi-photo' && state.photoFallback) {
    note.textContent = '航空写真はズーム14以上で表示します。現在は広域表示のため地理院標準地図を表示しています。';
    note.hidden = false;
    return;
  }

  if (state.selected === 'gsi-photo') {
    note.textContent = '全国最新写真（シームレス）を表示しています。撮影時期は場所によって異なります。';
    note.hidden = false;
    return;
  }

  note.hidden = true;
  note.textContent = '';
}

function isEnabled(id) {
  return document.getElementById(id)?.checked === true;
}

function renderLandUseLegend() {
  const scale = document.getElementById('landuse-legend-scale');
  if (!scale) return;

  scale.replaceChildren();

  LAND_USE_DISPLAY_ORDER.forEach(code => {
    const item = LAND_USE_CATEGORIES[code];
    if (!item) return;

    const row = document.createElement('span');
    const swatch = document.createElement('i');

    swatch.style.setProperty('--legend-color', item.color);
    row.append(swatch, document.createTextNode(item.label));
    scale.appendChild(row);
  });
}

function updateDataLegendVisibility() {
  const populationLegend = document.getElementById('population-legend');
  if (populationLegend) {
    populationLegend.hidden = !isEnabled('data-population-toggle');
  }

  const landUseLegend = document.getElementById('landuse-legend');
  if (landUseLegend) {
    landUseLegend.hidden = !isEnabled('data-landuse-toggle');
  }

  const elevationNote = document.getElementById('elevation-layer-note');
  if (elevationNote) {
    elevationNote.hidden = !isEnabled('data-elevation-toggle');
  }
}

function drawPopulation() {
  clearLayer(populationLayer);
  updateDataLegendVisibility();
  if (!isEnabled('data-population-toggle')) return;

  const map = getMap();

  // 人口メッシュは間引くと格子状の欠落が見えるため、画面内のセルをすべて描画する。
  const cells = getPopulationMeshesInBounds(map.getBounds());

  cells.forEach(cell => {
    const population = Number(cell.population) || 0;

    // 人口0のセルは意図的に描画しない。
    if (population <= 0) return;

    const populationClass = getPopulationClass(population);

    // population-mesh.json の lat / lng はメッシュ中心ではなく南西端。
    // 500m（2分の1地域）メッシュの実寸
    //   緯度15秒 = 1/240度
    //   経度22.5秒 = 1/160度
    // で隙間なく描画する。
    const south = cell.lat;
    const west = cell.lng;
    const north = south + POPULATION_MESH_LAT_STEP;
    const east = west + POPULATION_MESH_LNG_STEP;

    L.rectangle([[south, west], [north, east]], {
      stroke: false,
      fillColor: populationClass.color,
      fillOpacity: 0.67,
      interactive: true,
      renderer: populationRenderer
    })
      .bindPopup(
        `<strong>人口メッシュ（500m）</strong><br>` +
        `${population.toLocaleString()} 人<br>` +
        `<span style="color:#666">${populationClass.label}</span>`
      )
      .addTo(populationLayer);
  });
}

async function drawTourism() {
  clearLayer(tourismLayer);
  if (!isEnabled('data-tourism-toggle')) return;
  try {
  touristSpotsPromise ??= fetch(new URL('../data/tourist-spots.json', import.meta.url), { signal: AbortSignal.timeout(30000) }).then(response => {
    if (!response.ok) throw new Error('観光データを取得できませんでした。');
    return response.json();
  }).catch(error => { touristSpotsPromise = null; throw error; });
  const spots = await touristSpotsPromise;
  if (!document.body.classList.contains('mode-data') || !isEnabled('data-tourism-toggle')) return;
  clearLayer(tourismLayer);
  spots.forEach(spot => {
    // 観光ポイントの重み付けは算定用データとして保持するが、
    // データ表示モードでは観光地そのものの序列に見えないよう同一デザインで表示する。
    L.circleMarker([spot.lat, spot.lng], {
      radius: 5,
      color: '#fff',
      weight: 1.5,
      fillColor: '#9b1c31',
      fillOpacity: 0.95
    })
      .bindPopup(Object.assign(document.createElement('strong'), { textContent: spot.name }))
      .addTo(tourismLayer);
  });
  } catch (error) {
    if (document.body.classList.contains('mode-data')) setStatus('観光データを読み込めませんでした。表示を切り替えて再試行してください。');
  }
}

function drawLandUse() {
  clearLayer(landUseLayer);
  updateDataLegendVisibility();
  if (!isEnabled('data-landuse-toggle')) return;
  const map = getMap();
  if (map.getZoom() < 14) {
    setStatus('土地利用は地図を拡大すると表示します（縮尺 1:50,000 程度以上）。');
    return;
  }
  getLandUseData().then(data => {
    if (!isEnabled('data-landuse-toggle')) return;
    const bounds = map.getBounds();
    const latStep = 1 / 1200;
    const lngStep = 1 / 800;
    const south = Math.floor(bounds.getSouth() / latStep) * latStep;
    const west = Math.floor(bounds.getWest() / lngStep) * lngStep;
    let displayed = 0;
    for (let lat = south; lat <= bounds.getNorth() && displayed < 2600; lat += latStep) {
      for (let lng = west; lng <= bounds.getEast() && displayed < 2600; lng += lngStep) {
        const code = get100mMeshCode(lat + latStep / 2, lng + lngStep / 2);
        const category = data?.[code];
        if (!category) continue;
        L.rectangle([[lat, lng], [lat + latStep, lng + lngStep]], {
          color: getLandUseColor(category), weight: 0, fillColor: getLandUseColor(category), fillOpacity: 0.48
        }).bindPopup(`<strong>土地利用（約100m）</strong><br>${getLandUseLabel(category)}`)
          .addTo(landUseLayer);
        displayed++;
      }
    }
    setStatus(displayed >= 2600 ? '土地利用の表示数を抑えています。さらに拡大すると詳しく確認できます。' : '地図上のデータをクリックすると値を確認できます。');
  }).catch(() => setStatus('土地利用データを読み込めませんでした。'));
}

function drawElevation() {
  updateDataLegendVisibility();
  const map = getMap();
  const enabled = isEnabled('data-elevation-toggle');

  if (enabled) {
    if (!map.hasLayer(elevationLayer)) {
      elevationLayer.addTo(map);
    }
  } else if (map.hasLayer(elevationLayer)) {
    map.removeLayer(elevationLayer);
  }
}

function refreshDataLayers() {
  if (!document.body.classList.contains('mode-data')) return;
  drawElevation();
  drawPopulation();
  drawLandUse();
  drawTourism();
  if (!isEnabled('data-landuse-toggle') || getMap().getZoom() >= 14) {
    setStatus('地図上のデータをクリックすると値を確認できます。');
  }
}

function clearDataLayers() {
  const map = getMap();
  clearLayer(populationLayer);
  clearLayer(tourismLayer);
  clearLayer(landUseLayer);
  if (elevationLayer && map.hasLayer(elevationLayer)) {
    map.removeLayer(elevationLayer);
  }
}

function scheduleRefresh() {
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(refreshDataLayers, 100);
}

export function initDataMode() {
  const map = getMap();
  renderLandUseLegend();

  // 多数の500mメッシュを1枚のCanvasで描画し、表示負荷を抑える。
  populationRenderer = L.canvas({ padding: 0.35 });
  populationLayer = L.layerGroup().addTo(map);
  tourismLayer = L.layerGroup().addTo(map);
  landUseLayer = L.layerGroup().addTo(map);

  // 国土地理院「色別標高図」。ルートや人口・土地利用を隠しすぎないよう半透明表示。
  elevationLayer = L.tileLayer(
    'https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png',
    {
      crossOrigin: true,
      attribution: GSI_RELIEF_ATTRIBUTION,
      opacity: 0.58,
      minZoom: 5,
      maxNativeZoom: 15,
      maxZoom: 20
    }
  );

  const button = document.getElementById('btn-data-mode');
  const panel = document.getElementById('data-mode-panel');
  button?.addEventListener('click', () => {
    const enabled = document.body.classList.toggle('mode-data');
    setRouteReadOnly(enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('is-active', enabled);
    panel?.classList.toggle('is-hidden', !enabled);
    if (enabled) {
      refreshDataLayers();
      setBaseMapNote();
    } else {
      clearDataLayers();
    }
  });

  document.querySelectorAll('[data-base-map]').forEach(input => {
    input.addEventListener('change', event => {
      if (!event.target.checked) return;
      setBaseMap(event.target.value);
      setBaseMapNote();
    });
  });

  document.querySelectorAll('[data-data-layer]').forEach(input => {
    input.addEventListener('change', refreshDataLayers);
  });

  updateDataLegendVisibility();
  setBaseMapNote();

  map.on('basemap:changed', setBaseMapNote);
  map.on('moveend zoomend', scheduleRefresh);
}
