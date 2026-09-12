import {
  getPointsLatlngs,
  getTerminalRole, ORIGINAL_TERMINAL_STATIONS,
  getPoints,
  getInitStations,
  toggleStationPlacement,
  cancelStationPlacement,
  countNewStations,
  getNewStationPoints,
  getDefaultRoutePoints,
  nishikyushuCompetedRoute,
  kyushuCompetedRoute
} from './points.js';
import { haversineDistanceMeters, get100mMeshCode } from './utils.js';
import { prepareElevationHeights } from './validated-elevations.js';
import {   estimateConstructionCostFromSamples,
  generateDesignProfileByStations,calculateCostIndex } from './cost.js';
import { getPopulationWithinRadius } from './population.js';
import { calTotalTime } from './time.js';
import { generateShareURL } from './share-url.js';
import { getMap } from './map.js';
import { drawProfileChart } from './showProfile.js';
import {
  getElevationsAlongPolyline,
  getTerrainElevationsAlongPolyline
} from './elevation.js';
import {
  buildExistingTrackProfileSection,
  projectPointOntoRoute
} from './existing-track-elevation.js';
import {
  buildExistingTerrainProfileSection
} from './existing-track-terrain.js';
import { getLandUseData } from './landuse.js';
import { drawRadarChart } from './radar.js';
import { createShareImageFiles } from './share-images.js';
import {
  calculateTourismAccessScoreFromData,
  calculateDevelopmentScoreFromStations
} from './route-evaluation.js';

//ui 画面のクリック等の操作をする関数集

//ルートの概要を更新する関数
export function updateSummary() {
  const pointsLatlngs = getPointsLatlngs();
  document.getElementById('stationCount').innerText = getPoints().filter(point => point.type !== 'curve').length;

  if (pointsLatlngs.length > 1) {
    let length = 0;
    for (let i = 0; i < pointsLatlngs.length - 1; i++) {
      length += haversineDistanceMeters(pointsLatlngs[i], pointsLatlngs[i + 1]);
    }
    document.getElementById('routeLength').innerText = (length / 1000).toFixed(1);
  } else {
    document.getElementById('routeLength').innerText = '--';
  }

  document.getElementById('totalTime').innerText = calTotalTime(getPoints());
}

//UIの開閉を処理する関数。
export function initToggleButtons() {
  const toggleButtons = document.querySelectorAll('.toggle-btn');

  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.target;
      const panel = document.getElementById(panelId);
      if (!panel) return;

      // スマホの駅リストだけは「折りたたみ」にしない。
      // 「－」を押したら Bottom Sheet 自体を完全に閉じる。
      // 再表示は画面下部の「駅リスト」ボタンから行う。
      if (
        panelId === 'list-panel-inner'
        && window.matchMedia('(max-width: 720px)').matches
      ) {
        const stationPanel = document.getElementById('station-list-panel');
        const mobileListBtn = document.getElementById('mobile-list-btn');

        // 念のため、PC用の折りたたみ状態が残っていた場合も解除する。
        panel.classList.remove('hidden', 'panel-hidden');
        button.textContent = '–';

        if (!stationPanel) return;

        // mobile-list-btn と同じ閉じ方に統一する。
        stationPanel.classList.remove('mobile-open');
        if (mobileListBtn) {
          mobileListBtn.setAttribute('aria-expanded', 'false');
        }

        window.setTimeout(() => {
          if (!stationPanel.classList.contains('mobile-open')) {
            stationPanel.classList.add('is-hidden');
          }
        }, 280);

        return;
      }

      // PCでは従来どおり、各パネルの中身だけを折りたたむ。
      panel.classList.toggle('hidden');
      button.textContent = panel.classList.contains('hidden') ? '＋' : '–';
    });
  });
}
//ロード中の表示をする関数
function setLoading(visible, message = '処理中...') {
  const el = document.getElementById('loading');
  if (!el) return;
  el.textContent = message;
  el.style.display = visible ? 'block' : 'none';
}
//金額を〇億円に変換する関数
function formatLargeYen(value) {
  if (!Number.isFinite(value)) return '--';
  const trillion = value / 1_000_000_000_000;
  if (trillion >= 1) return `約 ${trillion.toFixed(2)} 兆円`;
  const oku = value / 100_000_000;
  return `約 ${oku.toFixed(0)} 億円`;
}

//沿線人口を計算する関数。（周辺半径５㎞固定）
function calculatePopulationReport() {
  const populationByMesh = new Map();

  const addStationPopulation = (lat, lng) => {
    getPopulationWithinRadius(lat, lng, 5).spots.forEach(spot => {
      const key = `${spot.lat.toFixed(7)}_${spot.lng.toFixed(7)}`;
      if (!populationByMesh.has(key)) populationByMesh.set(key, spot.population || 0);
    });
  };

  const initStations = (getInitStations() || []).filter(st => st.pass && st.type === "nishikyushu");
  for (const st of initStations) {
    addStationPopulation(st.lat, st.lng);
  }

  const existingKyushuStations = [ORIGINAL_TERMINAL_STATIONS.endStation,
    ...(getInitStations() || []).filter(st => st.type === 'kyushu' || st.type === 'hakata')];
  const userStations = getPoints().filter(point => point.type !== 'curve' && !(
    getTerminalRole(point) === 'endStation'
    && existingKyushuStations.some(station => haversineDistanceMeters(point.latlng, station) <= 300)
  ));
  for (const st of userStations) {
    addStationPopulation(st.latlng.lat, st.latlng.lng);
  }

  return [...populationByMesh.values()].reduce((total, population) => total + population, 0);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function calculateTourismAccessScore() {
  const touristSpotsUrl =
    new URL('../data/tourist-spots.json', import.meta.url);

  const response =
    await fetch(touristSpotsUrl);

  if (!response.ok) {
    throw new Error(
      `観光地データの取得に失敗しました: ${response.status}`
    );
  }

  const spots =
    await response.json();

  const existingStations =
    (getInitStations() || [])
      .filter(st =>
        st.pass
        && (
          st.type === 'nishikyushu'
          || st.type === 'kyushu'
        )
      )
      .map(st => ({
        lat: st.lat,
        lng: st.lng
      }));

  const userStations =
    getPoints()
      .filter(point =>
        point.type !== 'curve'
      )
      .map(point =>
        point.latlng
      );

  return calculateTourismAccessScoreFromData(
    spots,
    [
      ...existingStations,
      ...userStations
    ]
  );
}

function calculateDevelopmentScore(landUseData) {
  return calculateDevelopmentScoreFromStations(
    getNewStationPoints(),
    landUseData
  );
}

// ========================================
// ルート評価
// ========================================

// 分析レポートで計算した評価値を一時保存する。
// レーダーチャート自体は
// 「ルート評価を見る」を押した時点で描画する。
let latestRouteEvaluation = null;
let latestShareMetrics = null;
let latestShareImages = null;
let latestProfileContext = null;
let routeRevision = 0;
let analysisRunning = false;

export function invalidateAnalysis() {
  routeRevision++;
  resetRouteEvaluationUI();
  resetProfileModeUI();
  const dock = document.getElementById('report-dock');
  if (dock && !dock.classList.contains('is-hidden')) {
    document.getElementById('report-status').textContent = 'ルートを変更しました。分析レポートを再作成してください。';
  }
  document.getElementById('report-population').textContent = '--';
  document.getElementById('report-cost').textContent = '--';
  const chart = window.Chart?.getChart?.('profileChart');
  chart?.destroy();
  const canvas = document.getElementById('profileChart');
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  const warning = document.getElementById('profile-gradient-warning');
  if (warning) { warning.hidden = true; warning.textContent = ''; }
}


function setProfileModeLoading(
  isLoading,
  message = '処理中です。既存線を含む断面図を作成しています。'
) {
  const button = document.getElementById(
    'toggle-existing-profile-btn'
  );
  const status = document.getElementById(
    'profile-processing-status'
  );
  const chartWrap = document.getElementById(
    'profile-chart-wrap'
  );

  if (button) {
    button.disabled =
      isLoading || !latestProfileContext;

    if (isLoading) {
      button.textContent = '処理中...';
    }
  }

  if (status) {
    status.hidden = !isLoading;
    const text = status.querySelector(
      'span:last-child'
    );
    if (text) {
      text.textContent = message;
    }
  }

  if (chartWrap) {
    chartWrap.classList.toggle(
      'is-profile-loading',
      isLoading
    );
    chartWrap.setAttribute(
      'aria-busy',
      isLoading ? 'true' : 'false'
    );
  }
}


function resetProfileModeUI() {
  latestProfileContext = null;

  const button = document.getElementById(
    'toggle-existing-profile-btn'
  );
  const status = document.getElementById(
    'profile-processing-status'
  );
  const chartWrap = document.getElementById(
    'profile-chart-wrap'
  );

  if (button) {
    button.disabled = true;
    button.textContent = '既存線も表示';
    button.setAttribute('aria-pressed', 'false');
  }

  if (status) {
    status.hidden = true;
  }

  if (chartWrap) {
    chartWrap.classList.remove('is-profile-loading');
    chartWrap.setAttribute('aria-busy', 'false');
  }
}


function updateProfileChartNote(fullRouteMode) {
  const note = document.getElementById(
    'report-chart-note'
  );

  if (!note) return;

  note.textContent = fullRouteMode
    ? '長崎から博多までを一続きで表示しています。既存区間は沿線のDEM地形と公表縦断図の線路高、新線区間は地形と設計線です。'
    : '新線区間の地形と設計線を重ねて表示します。';
  if (latestProfileContext?.waterFallbackCount) {
    note.textContent += ` 新線の水域${latestProfileContext.waterFallbackCount}地点は標高未取得のため0mで概算しています。水深は反映していません。`;
  }
  if (latestProfileContext?.nonWaterFallbackCount) {
    note.textContent += ` 注意：新線の水域と確認できない${latestProfileContext.nonWaterFallbackCount}地点は、標高未取得のため0mで仮置きしています（10地点まで）。実際の標高ではなく、縦断線形・建設コストなどの算定結果に誤差が生じる可能性があります。`;
  }
}


function renderNewLineProfile() {
  if (!latestProfileContext) return;

  drawProfileChart({
    canvasId: 'profileChart',
    samples: latestProfileContext.samples,
    designHeights:
      latestProfileContext.designHeights,
    dx: 100
  });

  latestProfileContext.mode = 'new-line';
  updateProfileChartNote(false);

  const button = document.getElementById(
    'toggle-existing-profile-btn'
  );

  if (button) {
    button.disabled = false;
    button.textContent = '既存線も表示';
    button.setAttribute('aria-pressed', 'false');
  }
}


function interpolateChartElevation(points, x) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  if (x <= points[0].x) return points[0].y;

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    if (x > end.x) continue;

    const span = end.x - start.x;
    if (span <= 0) return end.y;

    const t = (x - start.x) / span;
    return start.y + (end.y - start.y) * t;
  }

  return points[points.length - 1].y;
}


function buildExistingStationMarkers({
  route,
  section,
  stationTypes,
  direction
}) {
  const markers = [];
  const sectionStartX = section.points[0]?.x ?? 0;
  const connectionDistance =
    section.connectionRouteDistanceMeters;
  const routeLength = section.routeLengthMeters;

  for (const station of getInitStations() || []) {
    if (!stationTypes.includes(station.type)) {
      continue;
    }

    const projected = projectPointOntoRoute(
      { lat: station.lat, lng: station.lng },
      route
    );

    if (
      !projected
      || projected.offsetMeters > 500
      || projected.routeDistanceMeters
        < connectionDistance - 5
      || projected.routeDistanceMeters
        > routeLength + 5
    ) {
      continue;
    }

    const travelDistance =
      direction === 'route-end-to-connection'
        ? routeLength
          - projected.routeDistanceMeters
        : projected.routeDistanceMeters
          - connectionDistance;

    const x = sectionStartX + travelDistance;
    const y = interpolateChartElevation(
      section.points,
      x
    );

    if (Number.isFinite(y)) {
      markers.push({
        x,
        y,
        name: station.name
      });
    }
  }

  return markers;
}


function removeConsecutiveDuplicateLatlngs(latlngs) {
  return latlngs.filter((point, index) => {
    if (index === 0) return true;
    const previous = latlngs[index - 1];
    return point.lat !== previous.lat
      || point.lng !== previous.lng;
  });
}


function buildExistingRouteTerrainLatlngs({
  route,
  connectionLatlng,
  direction
}) {
  const projected = projectPointOntoRoute(
    connectionLatlng,
    route
  );

  if (!projected || projected.offsetMeters > 100) {
    throw new Error('既存線地形の接続地点を線形上へ対応付けられません。');
  }

  const afterConnection = route
    .slice(projected.segmentIndex + 1)
    .map(point => ({
      lat: point.lat,
      lng: point.lng
    }));

  const latlngs =
    direction === 'route-end-to-connection'
      ? [
          ...afterConnection.reverse(),
          projected.point
        ]
      : [
          projected.point,
          ...afterConnection
        ];

  return removeConsecutiveDuplicateLatlngs(latlngs);
}


function setExistingTerrainProgress(progress) {
  const done =
    progress.nishikyushu.done
    + progress.kyushu.done;
  const total =
    progress.nishikyushu.total
    + progress.kyushu.total;

  const percent = total > 0
    ? Math.min(100, Math.round(done / total * 100))
    : 0;

  setProfileModeLoading(
    true,
    `処理中です。既存線の地形を取得しています（${percent}%）`
  );
}


async function buildFullProfileData(context) {
  const newLineLength =
    context.samples[
      context.samples.length - 1
    ]?.distanceMeters ?? 0;

  const nishikyushuSection =
    await buildExistingTrackProfileSection({
      route: nishikyushuCompetedRoute,
      profileKey: 'nishikyushu',
      connectionLatlng:
        context.startTerminal.latlng,
      direction: 'route-end-to-connection',
      intervalMeters: 100,
      distanceOffsetMeters: 0
    });

  const newLineOffsetMeters =
    nishikyushuSection.lengthMeters;

  const kyushuOffsetMeters =
    newLineOffsetMeters + newLineLength;

  const kyushuSection =
    await buildExistingTrackProfileSection({
      route: kyushuCompetedRoute,
      profileKey: 'kyushu',
      connectionLatlng:
        context.endTerminal.latlng,
      direction: 'connection-to-route-end',
      intervalMeters: 100,
      distanceOffsetMeters:
        kyushuOffsetMeters
    });

  const existingTrack = [
    ...nishikyushuSection.points.map(
      point => ({ x: point.x, y: point.y })
    ),
    {
      x: newLineOffsetMeters
        + newLineLength / 2,
      y: null
    },
    ...kyushuSection.points.map(
      point => ({ x: point.x, y: point.y })
    )
  ];

  let existingTerrain;

  try {
    setProfileModeLoading(
      true,
      '処理中です。保存済みの既存線地形を読み込んでいます。'
    );

    const [
      nishikyushuTerrainSection,
      kyushuTerrainSection
    ] = await Promise.all([
      buildExistingTerrainProfileSection({
        route: nishikyushuCompetedRoute,
        routeKey: 'nishikyushu',
        connectionLatlng:
          context.startTerminal.latlng,
        direction: 'route-end-to-connection',
        distanceOffsetMeters: 0
      }),
      buildExistingTerrainProfileSection({
        route: kyushuCompetedRoute,
        routeKey: 'kyushu',
        connectionLatlng:
          context.endTerminal.latlng,
        direction: 'connection-to-route-end',
        distanceOffsetMeters:
          kyushuOffsetMeters
      })
    ]);

    existingTerrain = [
      ...nishikyushuTerrainSection.points,
      {
        x: newLineOffsetMeters
          + newLineLength / 2,
        y: null
      },
      ...kyushuTerrainSection.points
    ];
  } catch (savedTerrainError) {
    // 事前生成JSONがまだない開発環境では、従来のDEM取得へ戻す。
    console.warn(
      '保存済み既存線地形を使用できないため、DEMから取得します。',
      savedTerrainError
    );

    const terrainProgress = {
      nishikyushu: { done: 0, total: 0 },
      kyushu: { done: 0, total: 0 }
    };

    const makeProgressHandler = key =>
      (done, total) => {
        terrainProgress[key] = { done, total };
        setExistingTerrainProgress(terrainProgress);
      };

    const nishikyushuTerrainLatlngs =
      buildExistingRouteTerrainLatlngs({
        route: nishikyushuCompetedRoute,
        connectionLatlng:
          context.startTerminal.latlng,
        direction: 'route-end-to-connection'
      });

    const kyushuTerrainLatlngs =
      buildExistingRouteTerrainLatlngs({
        route: kyushuCompetedRoute,
        connectionLatlng:
          context.endTerminal.latlng,
        direction: 'connection-to-route-end'
      });

    const [
      nishikyushuTerrainSamples,
      kyushuTerrainSamples
    ] = await Promise.all([
      getTerrainElevationsAlongPolyline(
        nishikyushuTerrainLatlngs,
        100,
        {
          concurrency: 4,
          onProgress:
            makeProgressHandler('nishikyushu')
        }
      ),
      getTerrainElevationsAlongPolyline(
        kyushuTerrainLatlngs,
        100,
        {
          concurrency: 4,
          onProgress:
            makeProgressHandler('kyushu')
        }
      )
    ]);

    existingTerrain = [
      ...nishikyushuTerrainSamples.map(point => ({
        x: point.distanceMeters,
        y: Number.isFinite(point.elevation)
          ? point.elevation
          : null
      })),
      {
        x: newLineOffsetMeters
          + newLineLength / 2,
        y: null
      },
      ...kyushuTerrainSamples.map(point => ({
        x: kyushuOffsetMeters + point.distanceMeters,
        y: Number.isFinite(point.elevation)
          ? point.elevation
          : null
      }))
    ];
  }

  const additionalStations = [
    ...buildExistingStationMarkers({
      route: nishikyushuCompetedRoute,
      section: nishikyushuSection,
      stationTypes: ['nishikyushu'],
      direction: 'route-end-to-connection'
    }),
    ...buildExistingStationMarkers({
      route: kyushuCompetedRoute,
      section: kyushuSection,
      stationTypes: ['kyushu', 'hakata'],
      direction: 'connection-to-route-end'
    })
  ].filter(station =>
    Math.abs(station.x - newLineOffsetMeters) > 20
    && Math.abs(
      station.x - kyushuOffsetMeters
    ) > 20
  );

  return {
    newLineOffsetMeters,
    existingTerrain,
    existingTrack,
    additionalStations
  };
}


function renderFullProfile(fullProfile) {
  if (!latestProfileContext) return;

  drawProfileChart({
    canvasId: 'profileChart',
    samples: latestProfileContext.samples,
    designHeights:
      latestProfileContext.designHeights,
    dx: 100,
    distanceOffsetMeters:
      fullProfile.newLineOffsetMeters,
    existingTerrain:
      fullProfile.existingTerrain,
    existingTrack: fullProfile.existingTrack,
    additionalStations:
      fullProfile.additionalStations,
    fullRouteMode: true
  });

  latestProfileContext.mode = 'full-route';
  updateProfileChartNote(true);

  const button = document.getElementById(
    'toggle-existing-profile-btn'
  );

  if (button) {
    button.disabled = false;
    button.textContent = '新線のみ表示';
    button.setAttribute('aria-pressed', 'true');
  }
}


async function toggleExistingProfile() {
  if (!latestProfileContext) {
    showToast(
      '先に分析レポートを作成してください。',
      1800
    );
    return;
  }

  if (
    latestProfileContext.routeKey
      !== getRouteShareKey()
  ) {
    showToast(
      'ルート変更後は分析レポートを再作成してください。',
      2600
    );
    return;
  }

  if (latestProfileContext.mode === 'full-route') {
    renderNewLineProfile();
    return;
  }

  const profileContext = latestProfileContext;
  setProfileModeLoading(true);
  const startedAt = performance.now();

  // 「処理中」の状態が描画されてから計算へ進む。
  await new Promise(resolve =>
    window.requestAnimationFrame(() => resolve())
  );

  try {
    if (!profileContext.fullProfile) {
      profileContext.fullProfile = await buildFullProfileData(profileContext);
    }
    if (latestProfileContext !== profileContext) return;

    // 高速に完了した場合も、処理表示を認識できる時間だけ残す。
    const remaining =
      350 - (performance.now() - startedAt);

    if (remaining > 0) {
      await new Promise(resolve =>
        window.setTimeout(resolve, remaining)
      );
    }

    if (latestProfileContext !== profileContext) return;
    renderFullProfile(profileContext.fullProfile);
  } catch (error) {
    if (latestProfileContext !== profileContext) return;
    console.error(
      '既存線を含む断面図の作成に失敗しました。',
      error
    );
    showToast(
      '既存線を含む断面図を作成できませんでした。',
      2600
    );
    renderNewLineProfile();
  } finally {
    if (latestProfileContext !== profileContext) return;
    setProfileModeLoading(false);

    if (latestProfileContext?.mode === 'full-route') {
      const button = document.getElementById(
        'toggle-existing-profile-btn'
      );
      if (button) {
        button.textContent = '新線のみ表示';
      }
    }
  }
}



/**
 * 再分析時などに、
 * 前回のルート評価表示を初期化する。
 */
function resetRouteEvaluationUI() {

  latestRouteEvaluation = null;
  latestShareMetrics = null;
  latestShareImages = null;


  const entry =
    document.getElementById(
      'route-evaluation-entry'
    );

  const panel =
    document.getElementById(
      'route-evaluation-panel'
    );


  if (entry) {
    entry.hidden = true;
  }


  if (panel) {
    panel.hidden = true;
  }


  // 前回のレーダーチャートが残っていれば削除
  const existingChart =
    window.Chart?.getChart?.(
      'radarChart'
    );


  if (existingChart) {
    existingChart.destroy();
  }
}


/**
 * 「ルート評価を見る」を押したときに実行。
 */
function showRouteEvaluation() {

  if (!latestRouteEvaluation) {

    showToast(
      '先に分析レポートを作成してください。',
      1800
    );

    return;
  }


  const entry =
    document.getElementById(
      'route-evaluation-entry'
    );

  const panel =
    document.getElementById(
      'route-evaluation-panel'
    );

  const summary =
    document.getElementById(
      'report-radar-summary'
    );


  if (!panel) {
    return;
  }


  // 評価画面を表示
  panel.hidden = false;


  // 「評価を見る」の案内は消す
  if (entry) {
    entry.hidden = true;
  }


  const {
    scores,
    developmentAreaKm2
  } = latestRouteEvaluation;


  // すでにチャートが存在する場合は破棄
  const existingChart =
    window.Chart?.getChart?.(
      'radarChart'
    );


  if (existingChart) {
    existingChart.destroy();
  }


  // ここで初めてレーダーチャートを描画
  drawRadarChart({
    canvasId: 'radarChart',
    scores
  });


  // 評価値の文章
  if (summary) {

    summary.textContent =
      `人口 ${scores[0]}点／` +
      `コスト ${scores[1]}点／` +
      `時間 ${scores[2]}点／` +
      `観光 ${scores[3]}点／` +
      `開発余地 ${scores[4]}点` +
      `（新設駅1km圏の対象土地 ` +
      `${developmentAreaKm2.toFixed(2)}km²）。`;
  }


  // スマホでは評価欄までスクロール
  panel.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

//分析レポートを作成するための関数
async function generateAnalysisReport() {
  if (analysisRunning) return;
  const revision = routeRevision;
  const analysisKey = getRouteShareKey();
  const assertCurrent = () => {
    if (revision !== routeRevision || analysisKey !== getRouteShareKey()) {
      const error = new Error('ルートが変更されたため、分析を中止しました。再作成してください。');
      error.name = 'RouteChangedError'; throw error;
    }
  };
  const btn = document.getElementById('generate-report-btn');
  const reportDock = document.getElementById('report-dock');
  const reportStatus = document.getElementById('report-status');
  const reportPopulation = document.getElementById('report-population');
  const reportCost = document.getElementById('report-cost');
  const reportCostNote = document.getElementById('report-cost-note');
  const pointsLatlngs = getPointsLatlngs();

  if (!Array.isArray(pointsLatlngs) || pointsLatlngs.length < 2) {
    alert('分析レポートの作成には、少なくとも2駅以上が必要です。');
    return;
  }
// 前回表示したルート評価を閉じる
resetRouteEvaluationUI();
resetProfileModeUI();


  analysisRunning = true;
  btn.disabled = true;
  btn.textContent = 'レポートを作成中...';
  reportDock.classList.remove('is-hidden');
  reportStatus.textContent = '沿線人口・建設費・断面図を順番に計算しています。';
  setLoading(true, '分析レポートを作成中...');

  try {
    //沿線人口の合計を計算する処理
    const populationTotal = calculatePopulationReport();
    reportPopulation.textContent = `${populationTotal.toLocaleString()} 人`;
    //標高の計算をする場所
    const routePoints = getPoints().map(point => ({ ...point, latlng: { ...point.latlng } }));
    const stationLatlngs = routePoints
      .filter(point => point.type !== 'curve')
      .map(point => point.latlng);

    const startTerminal = routePoints.find(point =>
      point.terminalRole === 'startStation'
      || point.type === 'startStation'
    );

    const endTerminal = routePoints.find(point =>
      point.terminalRole === 'endStation'
      || point.type === 'endStation'
    );

    // 起終点は既存線上の分岐位置なので、DEMの地表高ではなく
    // 元資料から作成した既存新幹線の概略線路高を使う。
    const existingTrackEndpoints = [];

    if (startTerminal) {
      existingTrackEndpoints.push({
        latlng: startTerminal.latlng,
        route: nishikyushuCompetedRoute,
        profileKey: 'nishikyushu'
      });
    }

    if (endTerminal) {
      existingTrackEndpoints.push({
        latlng: endTerminal.latlng,
        route: kyushuCompetedRoute,
        profileKey: 'kyushu'
      });
    }

    const samples = await getElevationsAlongPolyline(pointsLatlngs, 100, {
      onProgress: () => { assertCurrent(); },
      stationLatlngs,
      existingTrackEndpoints
    });
    assertCurrent();
    const landUseData = await getLandUseData();
    assertCurrent();
    const { heights, waterFallbackCount, nonWaterFallbackCount } = prepareElevationHeights(samples, landUseData);
    // 各サンプル点の始点からの累積距離
const isStation =
  samples.map(
    p => p.isStation
  );

const distances =
  samples.map(
    p => p.distanceMeters
  );


// 駅～駅単位で縦断線形を生成
const {
  designHeights,
  warnings: gradientWarnings
} =
  generateDesignProfileByStations(
    heights,
    isStation,
    distances,
    0.03
  );


console.log(
  "縦断計算警告:",
  gradientWarnings
);


// 動作確認用
let maxSlope = 0;

for (
  let i = 0;
  i < designHeights.length - 1;
  i++
) {

  const dx =
    distances[i + 1] -
    distances[i];

  if (
    !Number.isFinite(dx) ||
    dx <= 0
  ) {
    continue;
  }

  const slope =
    Math.abs(
      designHeights[i + 1] -
      designHeights[i]
    ) / dx;

  maxSlope =
    Math.max(
      maxSlope,
      slope
    );
}

console.log(
  "設計線最大勾配:",
  (maxSlope * 1000).toFixed(2),
  "‰"
);
const gradientWarningElement =
  document.getElementById(
    "profile-gradient-warning"
  );

const impossibleSegments =
  gradientWarnings.filter(
    warning =>
      warning.type ===
      "station-slope-exceeded"
  );


if (gradientWarningElement) {

  if (impossibleSegments.length > 0) {

    gradientWarningElement.hidden =
      false;

    gradientWarningElement.textContent =
      "この駅配置では、一部の駅間で線路の勾配が30‰（1km進む間に30m上る勾配）を超えます。勾配が急すぎるため、このままでは新幹線が走れない可能性があります。駅の位置を変えると、勾配をゆるくできる場合があります。";

  } else {

    gradientWarningElement.hidden =
      true;

    gradientWarningElement.textContent =
      "";
  }
}
    const newStationCount =
  countNewStations();

console.log(
  "コスト計算上の新設駅数:",
  newStationCount
);


const result =
  estimateConstructionCostFromSamples(
    samples,
    designHeights,
    isStation,
    landUseData,
    newStationCount
  );
    latestProfileContext = {
      routeKey: analysisKey,
      samples,
      designHeights,
      waterFallbackCount,
      nonWaterFallbackCount,
      startTerminal:
        startTerminal || routePoints[0],
      endTerminal:
        endTerminal
        || routePoints[routePoints.length - 1],
      fullProfile: null,
      mode: 'new-line'
    };

    renderNewLineProfile();

  const costIndex =
  calculateCostIndex(
    result.totalCost
  );

reportCost.textContent =
  costIndex !== null
    ? costIndex.toString()
    : '--';

reportCostNote.textContent =
  '佐賀駅経由のルートを100とし、低コストなほど値が小さくなります。';
    const totalTime = calTotalTime(getPoints());
    const tourism = await calculateTourismAccessScore();
    assertCurrent();
    const development = calculateDevelopmentScore(landUseData);
const costScore =
  costIndex !== null
    ? clampScore(
        9000 / costIndex
      )
    : 0;

const scores = [
  clampScore(
    (populationTotal / 800_000)
    * 100
  ),
  costScore,
  clampScore(
    (90 - totalTime) / 45
    * 100
  ),
  tourism.score,
  development.score
];
  // ========================================
// ルート評価
// ========================================

// 評価値だけ保存する。
// ここではまだチャートを表示しない。
latestRouteEvaluation = {

  scores,

  developmentAreaKm2:
    development.areaKm2
};

// SNS共有用に、分析済みの代表値を保持する。
const shareRouteKey = analysisKey;
const shareMetrics = {
  distanceKm: getRouteDistanceKm(),
  populationTotal,
  costIndex,
  totalTime,
  scores,
  developmentAreaKm2: development.areaKm2,
  gradientWarning: impossibleSegments.length > 0,
  waterFallbackCount,
  nonWaterFallbackCount
};

latestShareMetrics = {
  routeKey: shareRouteKey,
  populationTotal,
  costIndex,
  totalTime
};

// 分析結果と同じルートの共有用PNGを3枚準備する。
// 共有ボタンを押した時点では画像生成を待たず、すぐ共有シートを開けるようにする。
reportStatus.textContent =
  '分析結果を作成しました。結果を準備しています。';
setLoading(true, '結果を準備しています...');

try {
  const files = await createShareImageFiles({
    points: routePoints,
    metrics: shareMetrics,
    routes: { nishikyushu: nishikyushuCompetedRoute, kyushu: kyushuCompetedRoute },
    existingStations: getInitStations()
  });

  // 画像生成中にルートが変わっていなければキャッシュする。
  if (getRouteShareKey() === shareRouteKey) {
    latestShareImages = {
      routeKey: shareRouteKey,
      files
    };
  }
} catch (shareImageError) {
  latestShareImages = null;
  console.warn('共有用画像の準備に失敗しました:', shareImageError);
}


assertCurrent();

// 分析レポートの最後に
// 「ルート評価を見る」を表示
const evaluationEntry =
  document.getElementById(
    'route-evaluation-entry'
  );


if (evaluationEntry) {
  evaluationEntry.hidden = false;
}


reportStatus.textContent =
  latestShareImages?.routeKey === shareRouteKey
    ? '分析レポートを更新しました。共有すると地図・ルート評価・分析レポートの3枚を添付できます。'
    : '分析レポートを更新しました。共有画像は準備できなかったため、共有時は本文とURLを使用します。';
showToast('分析レポートを作成しました。', 1800);
  } catch (error) {
    console.error(error);
    invalidateAnalysis();
    reportStatus.textContent = error.name === 'RouteChangedError' ? error.message
      : '算定できませんでした。' + error.message + ' 「分析レポートを作成する」で再試行できます。';
  } finally {
    analysisRunning = false;
    setLoading(false);
    btn.disabled = false;
    btn.textContent = '分析レポートを作成する';
  }
}
// ========================================
// 保存・共有
// ========================================

function getRouteShareKey() {
  return JSON.stringify(
    getPoints().map(point => [
      point.type,
      Number(point.latlng?.lat).toFixed(6),
      Number(point.latlng?.lng).toFixed(6),
      point.name || ''
    ])
  );
}

function getRouteDistanceKm() {
  const pointsLatlngs = getPointsLatlngs();

  if (!Array.isArray(pointsLatlngs) || pointsLatlngs.length < 2) {
    return null;
  }

  let lengthMeters = 0;

  for (let i = 0; i < pointsLatlngs.length - 1; i++) {
    lengthMeters += haversineDistanceMeters(
      pointsLatlngs[i],
      pointsLatlngs[i + 1]
    );
  }

  return lengthMeters / 1000;
}

function formatPopulationForShare(value) {
  if (!Number.isFinite(value)) return null;

  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万人`;
  }

  return `${Math.round(value).toLocaleString()}人`;
}

function buildShareText({ includeMetrics = true } = {}) {
  const lines = [
    '西九州新幹線を題材に、地図上で仮想ルートを試せるサイトです。',
    '',
    '私が作った仮想ルートはこちら👇'
  ];

  if (includeMetrics) {
    const distanceKm = getRouteDistanceKm();
    const analysisMetrics =
      latestShareMetrics?.routeKey === getRouteShareKey()
        ? latestShareMetrics
        : null;
    const totalTime = Number(
      analysisMetrics?.totalTime ?? calTotalTime(getPoints())
    );

    const firstMetrics = [];

    if (Number.isFinite(distanceKm)) {
      firstMetrics.push(`距離 ${distanceKm.toFixed(1)}km`);
    }

    if (Number.isFinite(totalTime)) {
      firstMetrics.push(`所要時間 約${Math.round(totalTime)}分`);
    }

    if (firstMetrics.length) {
      lines.push(firstMetrics.join('｜'));
    }

    if (analysisMetrics) {
      const secondMetrics = [];
      const population = formatPopulationForShare(
        analysisMetrics.populationTotal
      );

      if (population) {
        secondMetrics.push(`沿線人口 ${population}`);
      }

      if (Number.isFinite(analysisMetrics.costIndex)) {
        secondMetrics.push(`コスト指数 ${analysisMetrics.costIndex}`);
      }

      if (secondMetrics.length) {
        lines.push(secondMetrics.join('｜'));
      }
    }
  }

  return lines.join('\n');
}

function copyText(text, successMessage, messageDuration = 1800) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage, messageDuration);
      return true;
    });
  }

  return Promise.resolve(false);
}

// 保存用URLをコピーする。
function copyShareUrl() {
  const url = generateShareURL(getPoints(), getMap());

  return copyText(
    url,
    '保存用URLをクリップボードにコピーしました。\nメモなどに貼り付けて保存しておくと、次回このルートから再開できます。',
    8000
  )
    .then(copied => {
      if (!copied) {
        alert(url);
        return;
      }

      try {
        localStorage.setItem('nishikyushu:lastSavedRoute', url);
      } catch (_) {}
    })
    .catch(err => {
      alert('URLのコピーに失敗しました: ' + err);
    });
}

// ========================================
// 共有処理
// ========================================

function getCachedShareFiles() {
  const routeKey = getRouteShareKey();

  return latestShareImages?.routeKey === routeKey
    ? latestShareImages.files
    : [];
}

function isCompactShareUI() {
  const narrow =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 720px)').matches;

  const mobileUA =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  return narrow || mobileUA;
}

function getBasicShareData() {
  return {
    title: '西九州ルートシミュレーション',
    text: buildShareText({ includeMetrics: true }),
    url: generateShareURL(getPoints(), getMap())
  };
}

function getFileShareCapability(files = getCachedShareFiles()) {
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: '画像付き共有はHTTPSで開いたページで利用できます。GitHub PagesなどのHTTPS版でお試しください。'
    };
  }

  if (typeof navigator.share !== 'function') {
    return {
      ok: false,
      reason: 'このブラウザ／端末はOS標準の共有機能に対応していません。'
    };
  }

  if (!files.length) {
    return {
      ok: false,
      reason: '画像を添付するには、先に分析レポートを作成してください。'
    };
  }

  if (
    typeof navigator.canShare === 'function' &&
    !navigator.canShare({ files })
  ) {
    return {
      ok: false,
      reason: 'このブラウザ／端末では、3枚の画像ファイルをまとめて共有できません。'
    };
  }

  return { ok: true, reason: '' };
}

function closeShareChooser() {
  const modal = document.getElementById('share-choice-modal');
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function updateShareChooserState() {
  const imageButton = document.getElementById('share-images-btn');
  const note = document.getElementById('share-choice-note');
  const capability = getFileShareCapability();

  if (imageButton) {
    imageButton.disabled = !capability.ok;
    imageButton.setAttribute('aria-disabled', String(!capability.ok));
  }

  if (note) {
    note.textContent = capability.ok
      ? '画像付き共有の共有先は、Windowsやブラウザに登録されているアプリによって異なります。Xが一覧に表示されない環境もあります。'
      : capability.reason;
  }
}

function openShareChooser() {
  const modal = document.getElementById('share-choice-modal');

  if (!modal) {
    // HTML差し替え漏れなどの場合は、標準共有へフォールバック。
    shareNative({ preferFiles: true });
    return;
  }

  updateShareChooserState();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('share-x-btn')?.focus();
}

// X Web Intent。
// XのWeb Intentでは画像ファイルを事前添付できないため、
// 本文 + 再現用URLだけを渡す。
function shareToX() {
  const { text, url } = getBasicShareData();
  const intent =
    `https://x.com/intent/tweet?text=${encodeURIComponent(text)}` +
    `&url=${encodeURIComponent(url)}`;

  closeShareChooser();
  window.open(intent, '_blank', 'noopener,noreferrer');
}

// OS標準の共有シートを開く。
// スマホでは実際に押されたボタンのイベントハンドラから直接この関数を呼ぶ。
// これにより navigator.share() が必要とするユーザー操作を維持する。
async function shareNative({ preferFiles = true } = {}) {
  const basicShareData = getBasicShareData();
  const cachedFiles = getCachedShareFiles();

  if (!window.isSecureContext) {
    showToast(
      '共有機能はHTTPSで利用できます。GitHub PagesなどのHTTPS版でお試しください。',
      3000
    );

    const copied = await copyText(
      `${basicShareData.text}\n${basicShareData.url}`,
      '共有文とURLをコピーしました。'
    ).catch(() => false);

    if (!copied) {
      alert(`${basicShareData.text}\n${basicShareData.url}`);
    }
    return;
  }

  if (typeof navigator.share !== 'function') {
    const copied = await copyText(
      `${basicShareData.text}\n${basicShareData.url}`,
      'このブラウザでは標準共有を利用できないため、共有文とURLをコピーしました。'
    ).catch(() => false);

    if (!copied) {
      alert(`${basicShareData.text}\n${basicShareData.url}`);
    }
    return;
  }

  try {
    const canShareFiles =
      preferFiles &&
      cachedFiles.length > 0 &&
      (
        typeof navigator.canShare !== 'function' ||
        navigator.canShare({ files: cachedFiles })
      );

    if (canShareFiles) {
      await navigator.share({
        ...basicShareData,
        files: cachedFiles
      });
      return;
    }

    await navigator.share(basicShareData);
  } catch (error) {
    // ユーザーが共有シートを閉じただけなら何もしない。
    if (error?.name === 'AbortError') return;

    console.error('標準共有に失敗しました:', error);
    showToast('共有を開けませんでした。ブラウザの共有機能をご確認ください。', 2600);
  }
}

// PCの共有メニューから、画像3枚を明示的に共有する。
async function shareImagesFromChooser() {
  const files = getCachedShareFiles();
  const capability = getFileShareCapability(files);

  if (!capability.ok) {
    updateShareChooserState();
    showToast(capability.reason, 3000);
    return;
  }

  const basicShareData = getBasicShareData();

  try {
    closeShareChooser();
    await navigator.share({
      ...basicShareData,
      files
    });
  } catch (error) {
    if (error?.name === 'AbortError') return;

    console.error('画像付き共有に失敗しました:', error);
    showToast('画像付き共有を開けませんでした。', 2600);
  }
}

// 画面上の「共有する」は1つだけにし、
// スマホではそのまま標準共有、PCでは共有方法の選択を出す。
function handlePrimaryShare() {
  if (isCompactShareUI()) {
    shareNative({ preferFiles: true });
    return;
  }

  openShareChooser();
}

// スマホのBottom Sheetを上端のバーで上下にリサイズする。
// 本文スクロールと競合しないよう、ドラッグ開始はハンドル部分だけに限定する。
function initMobileBottomSheetDragging() {
  const media = window.matchMedia('(max-width: 720px)');
  const sheets = document.querySelectorAll('.bottom-sheet');

  sheets.forEach(sheet => {
    let handle = sheet.querySelector('[data-bottom-sheet-handle]');
    if (!handle) {
      handle = document.createElement('button'); handle.type = 'button';
      handle.className = 'bottom-sheet-handle'; handle.dataset.bottomSheetHandle = '';
      handle.setAttribute('aria-label', 'パネルの高さを変更（上下矢印キー）');
      sheet.prepend(handle);
      handle.addEventListener('keydown', event => {
        if (!media.matches || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const { min, max } = getLimits();
        sheet.style.maxHeight = max + 'px';
        sheet.style.height = Math.max(min, Math.min(max, sheet.getBoundingClientRect().height + (event.key === 'ArrowUp' ? 40 : -40))) + 'px';
        event.preventDefault();
      });
    }
    if (!handle || handle.dataset.dragBound === 'true') return;
    handle.dataset.dragBound = 'true';

    let pointerId = null;
    let startY = 0;
    let startHeight = 0;

    const getLimits = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const isReport = sheet.id === 'report-dock';
      return {
        min: viewportHeight * (isReport ? 0.34 : 0.28),
        max: viewportHeight * (isReport ? 0.94 : 0.88)
      };
    };

    handle.addEventListener('pointerdown', event => {
      if (!media.matches || event.pointerType === 'mouse' && event.button !== 0) return;
      if (sheet.classList.contains('is-hidden')) return;

      pointerId = event.pointerId;
      startY = event.clientY;
      startHeight = sheet.getBoundingClientRect().height;
      sheet.classList.add('is-dragging');
      handle.setPointerCapture?.(pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId || !media.matches) return;

      const { min, max } = getLimits();
      const nextHeight = Math.min(
        max,
        Math.max(min, startHeight + (startY - event.clientY))
      );

      sheet.style.height = `${Math.round(nextHeight)}px`;
      sheet.style.maxHeight = `${Math.round(max)}px`;
      event.preventDefault();
    });

    const finishDrag = event => {
      if (pointerId !== event.pointerId) return;
      try {
        handle.releasePointerCapture?.(pointerId);
      } catch (_) {
        // capture済みでないブラウザでは何もしない。
      }
      pointerId = null;
      sheet.classList.remove('is-dragging');
    };

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  });
}

// タイトルからトップへ戻るとき、作成中のルートがあれば誤リセットを防ぐ。
function routeIsModifiedFromDefault() {
  const current = getPoints();
  const defaults = getDefaultRoutePoints();

  if (!Array.isArray(current) || current.length !== defaults.length) {
    return true;
  }

  return current.some((point, index) => {
    const base = defaults[index];
    if (!point || !base) return true;

    const distance = haversineDistanceMeters(point.latlng, base.latlng);
    const pointRole = point.terminalRole || point.type || null;
    const baseRole = base.terminalRole || base.type || null;

    return (
      !Number.isFinite(distance)
      || distance > 1
      || pointRole !== baseRole
      || point.type !== base.type
      || (point.name || '') !== (base.name || '')
    );
  });
}

// デスクトップでは評価の説明を常に表示し、スマホでは「＋」から開く。
function initRouteEvaluationMetricGuide() {
  const guide = document.querySelector('.route-evaluation-metric-guide');
  const media = window.matchMedia?.('(max-width: 720px)');

  if (!guide || !media) return;

  const syncGuideVisibility = event => {
    guide.open = !event.matches;
  };

  syncGuideVisibility(media);
  media.addEventListener?.('change', syncGuideVisibility);
}

//メイン画面のボタンにイベントを付加する関数
export function bindUIEvents() {
  const reportBtn = document.getElementById('generate-report-btn');
  const profileModeBtn = document.getElementById('toggle-existing-profile-btn');
  const addStationBtn = document.getElementById('add-station-btn');
  const mobileAddStationBtn = document.getElementById('mobile-add-station-btn');
  const saveBtn = document.getElementById('save-route-btn');
  const shareBtn = document.getElementById('share-route-btn');
  const closeReportBtn = document.getElementById('close-report-btn');

  // スマホ用の保存・共有ボタン。
  // 共有は別ボタンの .click() を経由せず、実タップから直接呼ぶ。
  const mobileSaveBtn = document.getElementById('mobile-save-route-btn');
  const mobileShareBtn = document.getElementById('mobile-share-route-btn');
  const mobileSaveShareMenu = document.getElementById('mobile-save-share-menu');
  const mobileMenuButton = document.getElementById('mobile-save-share-btn');
  const setMobileMenu = open => {
    mobileSaveShareMenu.classList.toggle('open', open);
    mobileSaveShareMenu.setAttribute('aria-hidden', String(!open));
    mobileMenuButton.setAttribute('aria-expanded', String(open));
  };
  mobileMenuButton?.setAttribute('aria-controls', 'mobile-save-share-menu');
  mobileMenuButton?.setAttribute('aria-expanded', 'false');
  mobileMenuButton?.addEventListener('click', () => setMobileMenu(!mobileSaveShareMenu.classList.contains('open')));
  document.addEventListener('click', event => {
    if (!mobileSaveShareMenu.contains(event.target) && !mobileMenuButton.contains(event.target)) setMobileMenu(false);
  });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileMenu(false); });
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => setMobileMenu(false));


  // ルート評価
  const showEvaluationBtn = document.getElementById('show-route-evaluation-btn');
  const evaluationShareBtn = document.getElementById('evaluation-share-btn');

  // PC共有メニュー
  const shareChoiceModal = document.getElementById('share-choice-modal');
  const shareChoiceClose = document.getElementById('share-choice-close');
  const shareXBtn = document.getElementById('share-x-btn');
  const shareImagesBtn = document.getElementById('share-images-btn');

  if (reportBtn) {
    reportBtn.addEventListener('click', generateAnalysisReport);
  }

  if (profileModeBtn) {
    profileModeBtn.addEventListener(
      'click',
      toggleExistingProfile
    );
  }

  // ルート作成後の駅追加は1回限り。
  // ボタンを押した次の地図クリックで1駅追加し、自動解除する。
  if (addStationBtn) {
    addStationBtn.addEventListener('click', toggleStationPlacement);
  }

  if (mobileAddStationBtn) {
    mobileAddStationBtn.addEventListener('click', toggleStationPlacement);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', copyShareUrl);
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', handlePrimaryShare);
  }

  if (mobileSaveBtn) {
    mobileSaveBtn.addEventListener('click', () => {
      copyShareUrl();
      setMobileMenu(false);
    });
  }

  if (mobileShareBtn) {
    mobileShareBtn.addEventListener('click', () => {
      // 重要: 実際のタップイベントから直接 navigator.share() へ進む。
      shareNative({ preferFiles: true });
      setMobileMenu(false);
    });
  }

  if (showEvaluationBtn) {
    showEvaluationBtn.addEventListener('click', showRouteEvaluation);
  }

  if (evaluationShareBtn) {
    evaluationShareBtn.addEventListener('click', handlePrimaryShare);
  }

  if (shareXBtn) {
    shareXBtn.addEventListener('click', shareToX);
  }

  if (shareImagesBtn) {
    shareImagesBtn.addEventListener('click', shareImagesFromChooser);
  }

  if (shareChoiceClose) {
    shareChoiceClose.addEventListener('click', closeShareChooser);
  }

  if (shareChoiceModal) {
    shareChoiceModal.addEventListener('click', event => {
      if (event.target === shareChoiceModal) {
        closeShareChooser();
      }
    });
  }

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeShareChooser();
      cancelStationPlacement({ silent: true });
    }
  });

  if (closeReportBtn) {
    closeReportBtn.addEventListener('click', () => {
      document
        .getElementById('report-dock')
        .classList.add('is-hidden');
    });
  }

  initRouteEvaluationMetricGuide();
  initMobileBottomSheetDragging();
}

//ヘッダーのボタンにイベントを付加する関数
export function initHeaderActions() {
  const btnHelp = document.getElementById('btn-help');
  const helpModal = document.getElementById('help-modal');
  const btnHelpClose = document.getElementById('btn-help-close');
  const hideSidePanelsBtn = document.getElementById('hide-side-panels-btn');
  const showSidePanelsBtn = document.getElementById('show-side-panels-btn');
  const brandHomeLink = document.getElementById('brand-home-link');

  if (brandHomeLink) {
    brandHomeLink.addEventListener('click', event => {
      // Ctrl/Commandクリック等で新しいタブに開く場合、現在のルートは失われないので確認しない。
      if (
        event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      if (!routeIsModifiedFromDefault()) return;

      const ok = window.confirm(
        'トップページに戻ると、作成中のルートは消去されます。戻りますか？'
      );

      if (!ok) {
        event.preventDefault();
      }
    });
  }

  // PCでは「ルート概要・分析レポート・駅リスト」をまとめて隠せる。
  // 個別パネルの折りたたみ状態は変更せず、再表示時もそのまま復元する。
  function setSidePanelsHidden(hidden) {
    if (!window.matchMedia('(min-width: 721px)').matches) return;

    document.body.classList.toggle('side-panels-hidden', hidden);
    if (showSidePanelsBtn) {
      showSidePanelsBtn.hidden = !hidden;
    }
  }

  if (hideSidePanelsBtn) {
    hideSidePanelsBtn.addEventListener('click', () => {
      setSidePanelsHidden(true);
    });
  }

  if (showSidePanelsBtn) {
    showSidePanelsBtn.addEventListener('click', () => {
      setSidePanelsHidden(false);
    });
  }

  function openHelp() {
    if (!helpModal) return;
    helpModal.classList.add('open');
    helpModal.setAttribute('aria-hidden', 'false');
  }

  function closeHelp() {
    if (!helpModal) return;
    helpModal.classList.remove('open');
    helpModal.setAttribute('aria-hidden', 'true');
  }

  if (btnHelp) btnHelp.addEventListener('click', openHelp);
  if (btnHelpClose) btnHelpClose.addEventListener('click', closeHelp);
  if (helpModal) {
    helpModal.addEventListener('click', e => {
      if (e.target === helpModal) closeHelp();
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeHelp();
    });
  }

  document.addEventListener('click', e => {
    const isInside = e.target.closest && e.target.closest('.header-menu');
    if (!isInside) {
      document.querySelectorAll('.header-menu[open]').forEach(d => d.removeAttribute('open'));
    }
  });
}
//編集モードに切り替えるボタン
export function enterEditMode() {
  document.body.classList.add('mode-edit');
  showToast('ルート改良モードに切り替えました。', 1400);
}
//トースト通知（一時的なメッセージを表示する）
export function showToast(message, ms = 1600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.remove('show'), ms);
}
//一時的に表示するリングを作成（今使っていない？）
export function popRingAtLatLng(latlng) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  const map = window.__leafletMap;
  if (!map || !map.latLngToContainerPoint) return;

  const p = map.latLngToContainerPoint(latlng);
  const ring = document.createElement('div');
  ring.className = 'first-click-ring';
  ring.style.left = `${p.x}px`;
  ring.style.top = `${p.y}px`;

  mapEl.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}
