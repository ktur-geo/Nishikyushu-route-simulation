// 共有地図は同梱の概略背景から描き、画面位置や外部タイルに依存しない。
import { getShareJourney, createShareProjection, loadShareGeography, drawShareGeography } from './share-map-layout.js';

const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 675;
const ACCENT = '#9b1c31';
const STATION_ACTIVE = 'rgb(199, 33, 33)';
const STATION_INACTIVE = 'rgb(190, 190, 190)';
const STATION_STROKE = '#111111';
const TEXT = '#1f1f1f';
const MUTED = '#666666';
const BORDER = '#dedede';
const PANEL = '#f7f7f8';
const MAP_FONT = '"Yu Gothic", "Hiragino Sans", sans-serif';
const APP_NAME = '西九州ルートシミュレーション';
const NOTE_FONT_SIZE = 14;

function createCanvas(width = SHARE_IMAGE_WIDTH, height = SHARE_IMAGE_HEIGHT) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToFile(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error(`${filename} の画像生成に失敗しました。`));
        return;
      }

      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}

function formatPopulation(value) {
  if (!Number.isFinite(value)) return '--';
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万人`;
  return `${Math.round(value).toLocaleString()}人`;
}

function drawHeader(ctx, title, subtitle) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, 12, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = TEXT;
  ctx.font = `700 38px ${MAP_FONT}`;
  ctx.fillText(title, 58, 62);

  ctx.fillStyle = MUTED;
  ctx.font = `500 20px ${MAP_FONT}`;
  ctx.fillText(subtitle, 60, 96);
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `500 14px ${MAP_FONT}`;
  ctx.fillText(APP_NAME, SHARE_IMAGE_WIDTH - 58, 36);
  ctx.restore();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawMetricCard(ctx, { x, y, width, height, label, value, note }) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, width, height, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = `600 18px ${MAP_FONT}`;
  ctx.fillText(label, x + 22, y + 34);

  ctx.fillStyle = TEXT;
  ctx.font = `800 34px ${MAP_FONT}`;
  ctx.fillText(value, x + 22, y + 72);
  if (note) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 ${NOTE_FONT_SIZE}px ${MAP_FONT}`;
    ctx.fillText(note, x + 22, y + 94);
  }
}

function drawFooter(ctx) {
  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = `500 12px ${MAP_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(APP_NAME + ' ｜ 非公式・参考値 ｜ 人口2020年・土地利用2021年度', SHARE_IMAGE_WIDTH - 24, SHARE_IMAGE_HEIGHT - 9);
  ctx.restore();
}

function isLatLngLike(value) {
  return value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng);
}


function parseDashArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  return String(value)
    .trim()
    .split(/[ ,]+/)
    .map(Number)
    .filter(Number.isFinite);
}

function drawPolylineOnCanvas(ctx, map, line) {
  const { style } = line;

  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.weight;
  ctx.globalAlpha = style.opacity;
  ctx.lineCap = style.lineCap;
  ctx.lineJoin = style.lineJoin;
  ctx.setLineDash(parseDashArray(style.dashArray));

  line.paths.forEach(path => {
    if (path.length < 2) return;

    ctx.beginPath();
    path.forEach((latlng, index) => {
      const point = map.latLngToContainerPoint(latlng);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  });

  ctx.restore();
}

function stationKey(latlng) {
  return `${Number(latlng.lat).toFixed(5)}_${Number(latlng.lng).toFixed(5)}`;
}

function rectsOverlap(a, b, gap = 3) {
  return !(
    a.x + a.width + gap < b.x ||
    b.x + b.width + gap < a.x ||
    a.y + a.height + gap < b.y ||
    b.y + b.height + gap < a.y
  );
}

function drawStationLabel(ctx, point, name, {
  color = TEXT,
  fontSize = 15,
  fontWeight = 650,
  occupied = [],
  bounds = { x: SHARE_IMAGE_WIDTH, y: SHARE_IMAGE_HEIGHT }
} = {}) {
  if (!name) return;

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${MAP_FONT}`;
  ctx.textBaseline = 'middle';
  const fullName = name;
  while (name.length > 1 && ctx.measureText(name).width > 230) name = name.slice(0, -1);
  if (name !== fullName) name = name.slice(0, -1) + '…';

  const paddingX = 6;
  const height = fontSize + 9;
  const width = Math.ceil(ctx.measureText(name).width) + paddingX * 2;
  const offset = 10;

  const candidates = [
    { x: point.x + offset, y: point.y - height - 5 },
    { x: point.x + offset, y: point.y + 5 },
    { x: point.x - width - offset, y: point.y - height - 5 },
    { x: point.x - width - offset, y: point.y + 5 }
  ];

  const margin = 5;
  let box = candidates.find(candidate => {
    const rect = { ...candidate, width, height };
    const inside =
      rect.x >= margin &&
      rect.y >= margin &&
      rect.x + rect.width <= bounds.x - margin &&
      rect.y + rect.height <= bounds.y - margin;

    return inside && !occupied.some(other => rectsOverlap(rect, other));
  });

  if (!box) {
    box = {
      x: Math.max(margin, Math.min(point.x + offset, bounds.x - width - margin)),
      y: Math.max(margin, Math.min(point.y - height - 5, bounds.y - height - margin))
    };
  }

  const rect = { ...box, width, height };
  occupied.push(rect);

  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(name, rect.x + paddingX, rect.y + rect.height / 2 + 0.5);
  ctx.restore();
}

function drawStationMarker(ctx, point, {
  fill = STATION_ACTIVE,
  radius = 6,
  strokeWidth = 1.5
} = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = STATION_STROKE;
  ctx.stroke();
  ctx.restore();
}

/**
 * 既存駅とユーザー配置駅を共有地図へ描く。
 * - 通過する既存駅：くすんだ赤
 * - 非通過（灰色区間）の既存駅：グレー
 * - ユーザー配置駅：くすんだ赤
 *
 * 同じ位置に既存駅とユーザー駅が重なる場合は、ユーザー駅を優先する。
 */
function drawStationsOnCanvas(ctx, map, points, existingStations = []) {
  const bounds = map.getSize();
  const isVisible = point => point.x >= 0 && point.y >= 0 && point.x <= bounds.x && point.y <= bounds.y;
  const occupiedLabels = [
    { x: 0, y: 0, width: SHARE_IMAGE_WIDTH, height: 100 },
    { x: 0, y: SHARE_IMAGE_HEIGHT - 69, width: SHARE_IMAGE_WIDTH, height: 69 }
  ];

  const userStations = points
    .filter(point => point?.type !== 'curve' && isLatLngLike(point?.latlng));

  const userKeys = new Set(userStations.map(point => stationKey(point.latlng)));

  // 既存駅を先に描く。ユーザー駅と同位置なら二重描画しない。
  existingStations.forEach(station => {
    const latlng = {
      lat: Number(station?.lat),
      lng: Number(station?.lng)
    };

    if (!isLatLngLike(latlng) || userKeys.has(stationKey(latlng))) return;

    const point = map.latLngToContainerPoint(latlng);
    if (!isVisible(point)) return;
    const active = station?.pass !== false;

    drawStationMarker(ctx, point, {
      fill: active ? STATION_ACTIVE : STATION_INACTIVE,
      radius: 5.2,
      strokeWidth: 1.3
    });

    drawStationLabel(ctx, point, station?.name || '', {
      color: active ? '#333333' : '#777777',
      fontSize: 14,
      fontWeight: 600,
      occupied: occupiedLabels,
      bounds
    });
  });

  // ユーザーが配置した駅は少しだけ大きくして前面へ。
  userStations.forEach(station => {
    const point = map.latLngToContainerPoint(station.latlng);
    if (!isVisible(point)) return;

    drawStationMarker(ctx, point, {
      fill: STATION_ACTIVE,
      radius: 6.2,
      strokeWidth: 1.5
    });

    drawStationLabel(ctx, point, station?.name || '', {
      color: '#222222',
      fontSize: 15,
      fontWeight: 700,
      occupied: occupiedLabels,
      bounds
    });
  });
}

export async function createRouteMapFile(points, routes = {}, existingStations = []) {
  // 先に座標を固定する。背景の読み込み中に表示地図が動いても画像は変わらない。
  const journey = getShareJourney(points, routes);
  const projection = createShareProjection(journey.boundsPoints);
  let geography = null;
  try { geography = await loadShareGeography(); }
  catch (error) { console.warn('共有背景なしで全体図を作成します。', error); }
  const canvas = createCanvas(), ctx = canvas.getContext('2d');
  drawShareGeography(ctx, projection, geography);
  const drawLine = (path, color, width) => {
    const line = { paths: [path], style: { color: '#fff', weight: width + 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' } };
    drawPolylineOnCanvas(ctx, projection, line);
    drawPolylineOnCanvas(ctx, projection, {...line, style: {...line.style, color, weight: width, opacity: 1}});
  };
  journey.existing.forEach(path => drawLine(path, '#597d83', 4));
  drawLine(journey.newLine, ACCENT, 5);
  drawStationsOnCanvas(ctx, projection, points, existingStations.filter(station => station.pass !== false));

  ctx.fillStyle='rgba(255,255,255,0.96)';ctx.fillRect(0,0,canvas.width,94);
  ctx.fillStyle=ACCENT;ctx.fillRect(0,0,8,94);
  ctx.fillStyle=TEXT;ctx.font=`700 25px ${MAP_FONT}`;
  ctx.fillText(APP_NAME,28,40);
  ctx.fillStyle=MUTED;ctx.font=`16px ${MAP_FONT}`;
  ctx.fillText('作成した仮想ルート ｜ 全体図',28,71);
  ctx.lineCap='round';
  for(const [x,color,label] of [[820,ACCENT,'作成ルート'],[995,'#597d83','接続する既存線']]) {
    ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,58);ctx.lineTo(x+30,58);ctx.stroke();
    ctx.fillStyle=TEXT;ctx.font=`15px ${MAP_FONT}`;ctx.fillText(label,x+40,64);
  }
  ctx.fillStyle='#597d83';ctx.font=`700 16px ${MAP_FONT}`;ctx.fillText('N ↑',1140,126);
  ctx.fillStyle='rgba(255,255,255,0.96)';ctx.fillRect(0,canvas.height-69,canvas.width,69);
  ctx.fillStyle=MUTED;ctx.font=`${NOTE_FONT_SIZE}px ${MAP_FONT}`;
  ctx.fillText('非公式・仮想ルート／実際の事業計画ではありません。背景は概略図です。',24,canvas.height-49);
  ctx.font=`12px ${MAP_FONT}`;
  ctx.fillText(geography ? '背景：国土数値情報 行政区域（2020年）・Natural Earth（国外）を加工' : '背景データを読み込めなかったため、路線と駅のみを表示しています。',24,canvas.height-29);
  ctx.textAlign='right';
  ctx.fillText('線路位置：© OpenStreetMap contributors · openstreetmap.org/copyright',canvas.width-24,canvas.height-29);
  drawFooter(ctx);
  return canvasToFile(canvas,'nishikyushu-route.png');
}

// データとコールバックはそのまま複製し、共有画像専用の表示設定だけを変える。
function cloneChartValue(value) {
  if (Array.isArray(value)) return value.map(cloneChartValue);
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneChartValue(item)]));
  }
  return value;
}

function createShareProfileCanvas(sourceCanvas) {
  const sourceChart = sourceCanvas && window.Chart?.getChart?.(sourceCanvas);
  if (!sourceChart) return null;
  const canvas = createCanvas(1060, 273);
  const data = cloneChartValue(sourceChart.config.data);
  data.datasets.forEach((dataset, index) => {
    dataset.hidden = !sourceChart.isDatasetVisible(index);
    if (typeof dataset.borderWidth === 'number' && dataset.borderWidth > 0) dataset.borderWidth = Math.max(2.5, dataset.borderWidth);
    if (typeof dataset.pointRadius === 'number' && dataset.pointRadius > 0) dataset.pointRadius = Math.max(5, dataset.pointRadius);
  });
  const options = cloneChartValue(sourceChart.config.options);
  Object.assign(options, { responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 1, events: [] });
  options.plugins = { ...options.plugins, tooltip: { enabled: false }, legend: {
    ...options.plugins?.legend, labels: { ...options.plugins?.legend?.labels, boxWidth: 24, padding: 14, font: { family: MAP_FONT, size: 15 } }
  } };
  for (const scale of Object.values(options.scales || {})) {
    scale.ticks = { ...scale.ticks, font: { ...scale.ticks?.font, family: MAP_FONT, size: 15 } };
    scale.title = { ...scale.title, font: { ...scale.title?.font, family: MAP_FONT, size: 16 } };
  }
  let chart;
  try {
    chart = new window.Chart(canvas.getContext('2d'), {
      type: sourceChart.config.type, data, options, plugins: sourceChart.config.plugins
    });
    chart.update('none');
    const result = createCanvas(canvas.width, canvas.height);
    result.getContext('2d').drawImage(canvas, 0, 0);
    return result;
  } finally { chart?.destroy(); }
}

async function createAnalysisReportFile(metrics) {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');

  drawHeader(
    ctx,
    '分析レポート',
    '作成した仮想ルートの主要な結果と縦断図'
  );

  const gap = 18;
  const left = 58;
  const cardWidth = (SHARE_IMAGE_WIDTH - left * 2 - gap * 3) / 4;
  const cardY = 125;

  const cards = [
    ['距離', Number.isFinite(metrics.distanceKm) ? `${metrics.distanceKm.toFixed(1)} km` : '--'],
    ['所要時間', Number.isFinite(metrics.totalTime) ? `約${Math.round(metrics.totalTime)}分` : '--'],
    ['沿線人口', formatPopulation(metrics.populationTotal)],
    ['コスト指数', Number.isFinite(metrics.costIndex) ? String(metrics.costIndex) : '--']
  ];

  cards.forEach(([label, value], index) => {
    drawMetricCard(ctx, {
      x: left + index * (cardWidth + gap),
      y: cardY,
      width: cardWidth,
      height: 104,
      label,
      value,
      note: label === 'コスト指数' ? '基準ルート＝100' : null
    });
  });

  ctx.fillStyle = TEXT;
  ctx.font = `700 24px ${MAP_FONT}`;
  ctx.fillText('縦断図', 60, 266);

  const chartBox = { x: 58, y: 285, width: 1084, height: 297 };
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = BORDER;
  roundRectPath(ctx, chartBox.x, chartBox.y, chartBox.width, chartBox.height, 16);
  ctx.fill();
  ctx.stroke();

  const profileCanvas = document.getElementById('profileChart');
  const exportProfile = createShareProfileCanvas(profileCanvas);

  if (profileCanvas?.width && profileCanvas?.height) {
    const pad = 12;
    ctx.drawImage(
      exportProfile || profileCanvas,
      chartBox.x + pad,
      chartBox.y + pad,
      chartBox.width - pad * 2,
      chartBox.height - pad * 2
    );
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = `500 20px ${MAP_FONT}`;
    ctx.fillText('縦断図を取得できませんでした。', chartBox.x + 30, chartBox.y + 60);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `500 ${NOTE_FONT_SIZE}px ${MAP_FONT}`;
  ctx.fillText('標高：国土地理院DEM・既存線資料を加工。設計線は仮想の参考値です。', 60, 603);
  ctx.fillStyle = metrics.gradientWarning ? '#a31515' : MUTED;
  const limitations = [metrics.gradientWarning ? '注意：30‰超の勾配区間があります。' : '', metrics.waterFallbackCount ? '水域の標高未取得箇所は0mで概算（水深未反映）。' : '', metrics.nonWaterFallbackCount ? `水域未確認${metrics.nonWaterFallbackCount}地点は標高0mで仮置き。` : ''].join('');
  if (limitations) ctx.fillText(limitations, 60, 623);
  ctx.fillStyle = MUTED;
  ctx.fillText('※ コスト指数は佐賀駅経由の基準ルートを100とした相対値です。', 60, 643);
  drawFooter(ctx);

  return canvasToFile(canvas, 'nishikyushu-analysis.png');
}

async function createRadarFile(metrics) {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');

  drawHeader(
    ctx,
    'ルート比較指標',
    '人口・コスト・時間・観光・開発余地を0〜100の相対指標で表示'
  );

  if (!window.Chart) {
    throw new Error('Chart.js を利用できません。');
  }

  const radarCanvas = document.createElement('canvas');
  radarCanvas.width = 650;
  radarCanvas.height = 450;

  const chart = new window.Chart(radarCanvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: ['人口', 'コスト', '時間', '観光', '開発余地'],
      datasets: [{
        label: 'ルート比較指標',
        data: metrics.scores,
        borderColor: ACCENT,
        backgroundColor: 'rgba(155,28,49,0.18)',
        pointBackgroundColor: ACCENT,
        pointBorderColor: '#ffffff',
        pointRadius: 5,
        pointHoverRadius: 5,
        borderWidth: 3
      }]
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 1,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          beginAtZero: true,
          ticks: {
            stepSize: 20,
            showLabelBackdrop: false,
            color: '#777777',
            font: { size: 14, family: MAP_FONT }
          },
          pointLabels: {
            color: TEXT,
            font: { size: 19, weight: '700', family: MAP_FONT }
          },
          angleLines: { color: 'rgba(0,0,0,0.14)' },
          grid: { color: 'rgba(0,0,0,0.12)' }
        }
      }
    }
  });

  chart.update('none');
  ctx.drawImage(radarCanvas, 38, 125);
  chart.destroy();

  const labels = ['人口', 'コスト', '時間', '観光', '開発余地'];
  const rightX = 745;

  labels.forEach((label, index) => {
    const y = 168 + index * 78;

    ctx.fillStyle = PANEL;
    roundRectPath(ctx, rightX, y, 390, 60, 14);
    ctx.fill();

    ctx.fillStyle = TEXT;
    ctx.font = `700 21px ${MAP_FONT}`;
    ctx.fillText(label, rightX + 20, y + 38);

    ctx.fillStyle = ACCENT;
    ctx.font = `800 28px ${MAP_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(metrics.scores[index]), rightX + 365, y + 40);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = MUTED;
  ctx.font = `500 ${NOTE_FONT_SIZE}px ${MAP_FONT}`;
  ctx.fillText('各指標は候補ルートを比較するための相対値です。', 60, 603);
  ctx.fillText('※ コスト・時間は、費用や所要時間が小さいほど指標値が高くなります。', 60, 626);
  drawFooter(ctx);

  return canvasToFile(canvas, 'nishikyushu-radar.png');
}

/**
 * 分析完了後に共有用PNGを3枚準備する。
 * 背景取得に失敗しても、地図画像には既存接続区間と駅を含む全体図を残す。
 */
export async function createShareImageFiles({ points, metrics, routes, existingStations = [] }) {
  const routeFile = await createRouteMapFile(points, routes, existingStations);

  const [analysisFile, radarFile] = await Promise.all([
    createAnalysisReportFile(metrics),
    createRadarFile(metrics)
  ]);

  return [routeFile, radarFile, analysisFile];
}
