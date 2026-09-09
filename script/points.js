import { getMunicipality } from './municipalities.js';
import { normalizeStationName, isValidCoordinate, MAX_ROUTE_POINTS } from './route-data.js';
// 駅の管理（初回／追加指定時のクリックで駅追加、ドラッグで更新）
// map.js の getMap() を利用
import { getMap, drawRouteLayer } from './map.js';
import {distancePointToSegment , haversineDistanceMeters ,projectPointOnSegment,findNearestSegment}from './utils.js';
import { bindStationPopup } from './popup.js';
import { updateStationList } from './station-list.js';
import { popRingAtLatLng,showToast } from './ui.js';
export { points,nishikyushuCompetedRoute, kyushuCompetedRoute,initStations};

let nextPointId = 1;
let placementPending = false;
let readOnly = false;
let initializing = false;
let points = []; // {order:int,latlng: {lat, lng},type:,name:,notes: ""}

// ========================================
// 既存の起終点駅
// ========================================

// 新設駅判定、駅名復元などで共通利用する。
export const ORIGINAL_TERMINAL_STATIONS = {
  startStation: {
    lat: 33.19633114711281,
    lng: 130.0230646133423,
    name: "武雄温泉"
  },

  endStation: {
    lat: 33.369602958,
    lng: 130.4916572,
    name: "新鳥栖"
  }
};

export function getTerminalRole(point) {

  if (!point) {
    return null;
  }

  // 新方式
  if (
    point.terminalRole === "startStation"
    || point.terminalRole === "endStation"
  ) {
    return point.terminalRole;
  }

  // 旧データとの互換性
  if (
    point.type === "startStation"
    || point.type === "endStation"
  ) {
    return point.type;
  }

  return null;
}

// 数m程度の座標誤差だけで
// 新設駅扱いにならないようにする。
const TERMINAL_MOVE_THRESHOLD_M = 5;

// init-stations.json と基準座標が
// 完全一致しない場合を考慮した照合距離。
const TERMINAL_INIT_STATION_MATCH_THRESHOLD_M = 300;


/**
 * 初期状態の起終点を返す。
 */
export function getDefaultRoutePoints() {

  return [
    {
      order: 0,
      latlng: {
        lat:
          ORIGINAL_TERMINAL_STATIONS
            .startStation.lat,
        lng:
          ORIGINAL_TERMINAL_STATIONS
            .startStation.lng
      },
      type:
        "startStation",
      name:
        ORIGINAL_TERMINAL_STATIONS
          .startStation.name
    },
    {
      order: 1,
      latlng: {
        lat:
          ORIGINAL_TERMINAL_STATIONS
            .endStation.lat,

        lng:
          ORIGINAL_TERMINAL_STATIONS
            .endStation.lng
      },

      type:
        "endStation",

      name:
        ORIGINAL_TERMINAL_STATIONS
          .endStation.name
    }
  ];
}


/**
 * 起点・終点が
 * 本来の既存駅位置から動いているかを判定。
 */
function isTerminalMoved(point) {

  const terminalRole =
    getTerminalRole(point);

  if (!terminalRole) {
    return false;
  }

  const original =
    ORIGINAL_TERMINAL_STATIONS[
      terminalRole
    ];

  if (!original) {
    return false;
  }

  const distance =
    haversineDistanceMeters(
      point.latlng,
      original
    );

  return (
    Number.isFinite(distance)
    && distance
      > TERMINAL_MOVE_THRESHOLD_M
  );
}


/**
 * initStations 内の駅が、
 * 元の武雄温泉・新鳥栖に
 * 相当するか判定する。
 */
function isOriginalTerminalInitStation(
  station,
  terminalType
) {

  const original =
    ORIGINAL_TERMINAL_STATIONS[
      terminalType
    ];

  if (
    !station
    || !original
  ) {
    return false;
  }

  // 名前が一致する場合
  if (
    station.name
    === original.name
  ) {
    return true;
  }

  // データ側で座標が少し異なる場合に備え、
  // 距離でも照合する。
  const distance =
    haversineDistanceMeters(
      {
        lat: station.lat,
        lng: station.lng
      },
      original
    );

  return (
    Number.isFinite(distance)
    && distance
      <= TERMINAL_INIT_STATION_MATCH_THRESHOLD_M
  );
}


/**
 * コスト計算上の新設駅数を返す。
 *
 * station
 *   → 常に新設駅
 *
 * startStation / endStation
 *   → 元位置から動いていれば新設駅
 *
 * curve
 *   → 対象外
 */
export function countNewStations() {

  let count = 0;


  for (const point of points) {

    // 通過点なら駅費は発生しない
    if (
      point.type === "curve"
    ) {
      continue;
    }


    const terminalRole =
      getTerminalRole(point);


    // 起終点
    if (terminalRole) {

      if (
        isTerminalMoved(point)
      ) {
        count++;
      }

      continue;
    }


    // 通常の新設駅
    if (
      point.type === "station"
    ) {
      count++;
    }
  }


  return count;
}

// 現在の新設駅を返す。
export function getNewStationPoints() {

  return points.filter(point => {

    // 通過点は駅ではない
    if (
      point.type === "curve"
    ) {
      return false;
    }


    const terminalRole =
      getTerminalRole(point);


    // 起終点なら、
    // 元位置から移動した場合のみ新設駅
    if (terminalRole) {

      return isTerminalMoved(
        point
      );
    }


    // 通常駅
    return (
      point.type === "station"
    );
  });
}

let routeLayer = null;
let initRouteLayers = [];
let ignoredRouteLayers = [];

let firstClick = true;

// ルート作成後の駅追加は、通常の地図クリックでは行わない。
// 「駅を追加」ボタンを押した直後の1クリックだけ受け付ける。
let stationPlacementRequested = false;

export function isStationPlacementRequested(){
  return stationPlacementRequested;
}

export function requestStationPlacement(){
  // 初回はもともと地図クリックで駅を置くため、追加モードは不要。
  if (firstClick) return;

  stationPlacementRequested = true;
  document.body.classList.add("mode-add-station");
  showToast("駅を置きたい場所を地図上でクリックしてください。", 1800);
}

export function cancelStationPlacement({ silent = false } = {}){
  if (!stationPlacementRequested) return;

  stationPlacementRequested = false;
  document.body.classList.remove("mode-add-station");

  if (!silent) {
    showToast("駅の追加をキャンセルしました。", 1200);
  }
}

export function toggleStationPlacement(){
  if (readOnly) { showToast("データ閲覧を閉じると編集できます。"); return; }
  if (stationPlacementRequested) {
    cancelStationPlacement();
  } else {
    requestStationPlacement();
  }
}

// 初回案内
// place   : 最初の駅を置く
// adjust  : ルートを調整する
// analyze : 分析へ誘導
// done    : 案内終了
let guideStep = "place";


function setGuideStep(step) {

  guideStep = step;

  const panel =
    document.getElementById("guide-panel");

  const icon =
    document.getElementById("guide-icon");

  const title =
    document.getElementById("guide-title");

  const description =
    document.getElementById("guide-description");

  const note =
    document.getElementById("guide-note");

  if (
    !panel ||
    !icon ||
    !title ||
    !description
  ) {
    return;
  }

  panel.classList.remove("guide-welcome");
  const firstAction = document.getElementById("guide-first-action");
  const startButton = document.getElementById("guide-start-btn");
  if (firstAction) firstAction.hidden = true;
  if (startButton) startButton.hidden = true;

  if (step === "place") {
    title.textContent = "まずは駅を置いてみよう";
    description.textContent = "地図上の好きな場所をタップしてください";
    return;
  }


  // ========================================
  // ② ルート調整
  // ========================================

  if (step === "adjust") {

    panel.classList.add("guide-visible");
    panel.classList.remove("guide-hidden");

    icon.innerHTML = `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 17 C8 17 7 7 12 7 C17 7 16 17 20 17" />
        <circle cx="4" cy="17" r="1.5" />
        <circle cx="12" cy="7" r="1.5" />
        <circle cx="20" cy="17" r="1.5" />
      </svg>
    `;

    title.textContent =
      "ルートを調整してみよう";

    description.innerHTML =
      "黒い点をドラッグ → ルートを曲げる<br>" +
      "駅をドラッグ → 位置を調整";

    if (note) {
      note.hidden = true;
      note.textContent = "";
    }

    return;
  }


  // ========================================
  // ③ 分析
  // ========================================

  if (step === "analyze") {

    panel.classList.add("guide-visible");
    panel.classList.remove("guide-hidden");

    icon.innerHTML = `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 19V13" />
        <path d="M10 19V9" />
        <path d="M15 19V5" />
        <path d="M20 19V11" />
      </svg>
    `;

    title.textContent =
      "ルートができたら分析";

    description.textContent =
      "時間・人口・建設費などを確認できます";

    if (note) {
      note.hidden = false;
      note.textContent =
        "駅や黒い点はタップすると編集・削除できます";
    }


    // 分析ボタンを少し強調
    document
      .getElementById("mobile-analysis-btn")
      ?.classList.add("tutorial-focus");

    document
      .getElementById("generate-report-btn")
      ?.classList.add("tutorial-focus");

    return;
  }
}


function finishGuide() {

  guideStep = "done";

  const panel =
    document.getElementById("guide-panel");

  if (panel) {
    panel.classList.remove("guide-visible");
    panel.classList.add("guide-hidden");
  }


  document
    .getElementById("mobile-analysis-btn")
    ?.classList.remove("tutorial-focus");

  document
    .getElementById("generate-report-btn")
    ?.classList.remove("tutorial-focus");
}


export function endTutorial(){

  firstClick = false;

  document.body.classList.remove(
    "mode-tutorial"
  );

  document.body.classList.add(
    "mode-result"
  );
}
//ポイントの追加はこの関数のみで行う。
let orderCounter = 0;

//完成済み個所のルートの読み込み
let nishikyushuCompetedRoute= await loadCompetedRoute(new URL('../data/nishikyushu-competed-route.json', import.meta.url))
let kyushuCompetedRoute= await loadCompetedRoute(new URL('../data/kyushu-competed-route.json', import.meta.url))
let initStations = await loadCompetedStation(new URL('../data/init-stations.json', import.meta.url))
//let ignoreRoute = await loadCompetedRoute(new URL('../data/init-ignore-route.json', import.meta.url))
let nishikyushuIgnoreRoute =[];
let kyushuIgnoreRoute=[]

export function getInitStations(){
  return initStations
}

export function stationIcon(type, name) {
  const content = document.createElement('div');
  const dot = document.createElement('div');
  dot.className = type === 'curve' ? 'curve-dot' : 'station-dot';
  content.appendChild(dot);
  if (type !== 'curve') {
    const label = document.createElement('div');
    label.className = 'station-label';
    label.textContent = normalizeStationName(name);
    content.appendChild(label);
  }
  return L.divIcon({ className: type, html: content, iconSize: null });
}

export function isRouteReadOnly() { return readOnly; }
export function setRouteReadOnly(enabled) {
  readOnly = enabled;
  if (enabled) cancelStationPlacement({ silent: true });
  points.forEach(point => point.marker?.dragging?.[enabled ? 'disable' : 'enable']());
  document.querySelectorAll('.station-popup').forEach(el => el.parentElement?.remove());
  drawRoute();
  updateStationList();
}

export function notifyPointsChanged() {
  if (initializing) return;
  points.forEach((point, index) => { point.order = index; });
  updateIgnoredSections();
  updateStationList();
  getMap().fire('points:updated');
}

export function renamePoint(id, name) {
  if (readOnly) return false;
  const point = points.find(item => item.id === id);
  if (!point) return false;
  point.nameRequestId = (point.nameRequestId || 0) + 1;
  point.name = normalizeStationName(name);
  point.marker.setIcon(stationIcon(point.type, point.name));
  notifyPointsChanged();
  return true;
}

export function removePoint(id) {
  if (readOnly) return false;
  const index = points.findIndex(point => point.id === id);
  if (index < 0 || getTerminalRole(points[index])) return false;
  getMap().removeLayer(points[index].marker);
  points.splice(index, 1);
  notifyPointsChanged();
  return true;
}

// 起終点駅(武雄温泉、鳥栖)セット
export function initPoints(initials = []) {
  points.forEach(point => point.marker?.remove());
  points = [];
  initializing = true;
  const map = getMap();
  console.log(initials)
  initials.forEach(
  (p, index) => {

    let terminalRole =
      p.terminalRole
      || null;


    // 旧形式のデータならtypeから復元
    if (
      !terminalRole
      && (
        p.type === "startStation"
        || p.type === "endStation"
      )
    ) {

      terminalRole =
        p.type;
    }


    // さらに古い共有URLなどで、
    // 起終点がcurveになっている場合の救済
    if (!terminalRole) {
      if (index === 0) {
        terminalRole =
          "startStation";
      } else if (
        index
        === initials.length - 1
      ) {
        terminalRole =
          "endStation";
      }
    }
    addPoint(
      p.latlng,
      {
        type:
          p.type,
        name:
          p.name,
        pan:
          false,
        strict:
          true,
        terminalRole
      }
    );
  }
);
  initializing = false;
  notifyPointsChanged();
  return points;
}

let existingSegments = []; // 既存線の各線分を保持

//初期線路の描写

export function drawinitRoute(){
  initRouteLayers.forEach(layer => getMap().removeLayer(layer));
  initRouteLayers = [];
  const routesLatlngs = [nishikyushuCompetedRoute.map(s => ({ lat: s.lat, lng: s.lng })),kyushuCompetedRoute.map(s => ({ lat: s.lat, lng: s.lng }))]
  routesLatlngs.forEach(latlngs =>{
    if(latlngs.length >= 2) initRouteLayers.push(drawRouteLayer(latlngs,false));
    console.log(latlngs.length)
  });

}

export function countPassedStations() {
  if (!initStations) return 0;
  return initStations.filter(st => st.pass).length;
}

export function countPassedNishikyushuStations() {
  if (!initStations) return 0;
  return initStations.filter(st => st.pass && st.type=="nishikyushu").length;
}


export function snapToPolyline(latlng, polylineCoords) {
  let nearestPoint = null;
  let minDist = Infinity;

  for (let i = 0; i < polylineCoords.length - 1; i++) {
    const a = polylineCoords[i];
    const b = polylineCoords[i+1];
    const projected = projectPointOnSegment(latlng, a, b);
    const d = getMap().distance(latlng, projected);

    if (d < minDist) {
      minDist = d;
      nearestPoint = projected;
    }
  }

  return nearestPoint || latlng;
}


//初期線路の描写
export  function drawInitStations(){ 
  const map = getMap();

  if (!initStations) return;

  // 既存マーカー削除（再描画対応）
  if (window._initStationLayer) {
    map.removeLayer(
      window._initStationLayer
    );
  }

  const layer =
    L.layerGroup();


  // ========================================
  // 通常の既存駅
  // ========================================

  initStations.forEach(st => {

    const color =
      st.pass
        ? "black"
        : "gray";

    const className =
      st.pass
        ? "init-station"
        : "ignore-station";

    const marker =
      L.marker(
        [st.lat, st.lng],
        {
          draggable: false,

          icon: L.divIcon({
            className: className,

            html: `
              <div
                class="init-label"
                style="color:${color};"
              >
                ${st.name}
              </div>
            `,

            iconSize: null
          })
        }
      );

    marker.addTo(layer);
  });


  // ========================================
  // 移動した起点の「元の武雄温泉」
  // ========================================

  const start =
  points.find(
    p =>
      getTerminalRole(p)
      === "startStation"
  );

  if (
    start &&
    isTerminalMoved(start)
  ) {

    const original =
      ORIGINAL_TERMINAL_STATIONS
        .startStation;

    const marker =
      L.marker(
        [
          original.lat,
          original.lng
        ],
        {
          draggable: false,

          icon: L.divIcon({
            className: "ignore-station",

            html: `
              <div
                class="init-label"
                style="color:gray;"
              >
                ${original.name}
              </div>
            `,

            iconSize: null
          })
        }
      );

    marker.addTo(layer);
  }


  // ========================================
  // 移動した終点の「元の新鳥栖」
  // ========================================

 const end =
  points.find(
    p =>
      getTerminalRole(p)
      === "endStation"
  );

  if (
    end &&
    isTerminalMoved(end)
  ) {

    const original =
      ORIGINAL_TERMINAL_STATIONS
        .endStation;

    // initStations 側に新鳥栖がある場合は、上の通常描画ですでに
    // pass 状態に応じた色で描かれている。ここで重ね描きしない。
    const originalExistsInInitStations =
      initStations.some(st =>
        isOriginalTerminalInitStation(
          st,
          "endStation"
        )
      );

    if (!originalExistsInInitStations) {

      const isPassed =
        original.lat
        >= end.latlng.lat;

      const marker =
        L.marker(
          [
            original.lat,
            original.lng
          ],
          {
            draggable: false,

            icon: L.divIcon({
              className:
                isPassed
                  ? "init-station"
                  : "ignore-station",

              html: `
                <div
                  class="init-label"
                  style="color:${isPassed ? "black" : "gray"};"
                >
                  ${original.name}
                </div>
              `,

              iconSize: null
            })
          }
        );

      marker.addTo(layer);
    }
  }


  layer.addTo(map);

  window._initStationLayer =
    layer;
}

/**
 * 経路に含まれる既存駅を判定して pass フラグを付与
 * （緯度の範囲のみで判定）
 */
export function updatePassedStations() {

const start =
  points.find(
    p =>
      getTerminalRole(p)
      === "startStation"
  );

const end =
  points.find(
    p =>
      getTerminalRole(p)
      === "endStation"
  );
  if (
    !start
    || !end
  ) {
    return;
  }

  const startMoved =
    isTerminalMoved(start);

  const endMoved =
    isTerminalMoved(end);


  initStations.forEach(st => {

    // ----------------------------------------
    // 元の武雄温泉駅
    // ----------------------------------------

    // 起点を動かした場合、
    // 元の武雄温泉駅は
    // 「通過しない既存駅」として扱う。
    if (
      startMoved
      && isOriginalTerminalInitStation(
        st,
        "startStation"
      )
    ) {
      st.pass = false;
      return;
    }
    // ----------------------------------------
    // 元の新鳥栖駅
    // ----------------------------------------

    // 終点を動かした場合でも、元の新鳥栖より南側へ終点を動かしたなら
    // 新鳥栖は実際の経路上に残るため「通過駅」として扱う。
    if (
      endMoved
      && isOriginalTerminalInitStation(
        st,
        "endStation"
      )
    ) {
      st.pass = (
        st.lat
        >= end.latlng.lat
      );
      return;
    }
    // ----------------------------------------
    // その他の既存駅
    // ----------------------------------------
    if (
      st.type === "nishikyushu"
      || st.type === "kyushu"
    ) {
      // 現在使っている既存の判定方式を維持。
      if (
        st.type ===
        "nishikyushu"
      ) {
        st.pass =
          (
            st.lat
            <= start.latlng.lat
          );
      } else {
        st.pass =
          (
            st.lat
            >= end.latlng.lat
          );
      }
    } else { st.pass = true;
    }
  });

  // 表示更新
  drawInitStations();
  // 駅リスト更新
  updateStationList();
}

//座標のみの情報を返す関数。
export function getPointsLatlngs(){
  return points.map(s => ({ lat: s.latlng.lat, lng: s.latlng.lng }));
}

//ポイントをそのまま返す関数
export function getPoints(){
  return points
}


export function addPoint(latlng, {type="station",name="",pan=true,strict=false,terminalRole = null,insertIndex = null}={}) {
  const map = getMap();
  if ((!strict && readOnly) || !isValidCoordinate(latlng)) return null;
  if (points.length >= MAX_ROUTE_POINTS) { showToast('ルートの点は200個までです。'); return null; }
  name = normalizeStationName(name);
  const marker = L.marker(latlng, { draggable: !readOnly, icon: stationIcon(type, name) }).addTo(map);

  const resolvedTerminalRole =
  terminalRole
  || (
    type === "startStation"
    || type === "endStation"
      ? type
      : null
  );
  // 新しい point オブジェクトを先に生成
const newPoint = {

  id:
    nextPointId++,

  order:
    points.length,

  latlng: {
    lat: latlng.lat,
    lng: latlng.lng
  },

  type,

  // 起点・終点という役割は
  // typeとは別に保持する
  terminalRole:
    resolvedTerminalRole,

  name,

  notes: "",

  marker
};

  if (strict) {
    // strictモード → 並び替えせず順番に追加
    points.push(newPoint);
  } else if (Number.isInteger(insertIndex)) {
    // ルート上の黒点から追加する場合。
    // 黒点自身が「どの2点の間か」を知っているので、
    // ドラッグ後の位置と元線分との距離では判定しない。
    const sorted = points.slice().sort((a,b)=>a.order-b.order);
    const safeIndex = Math.max(0, Math.min(insertIndex, sorted.length));

    sorted.splice(safeIndex, 0, newPoint);
    sorted.forEach((p,i)=>p.order=i);
    points.length = 0;
    points.push(...sorted);
  } else {
    // 通常モード → 距離に応じて挿入位置を決定
    let sorted = points.slice().sort((a,b)=>a.order-b.order);
    let minDist = Infinity;
    let autoInsertIndex = null;
    // 任意の位置を最も近い区間へ挿入。ズーム倍率では成否を変えない。

    for (let i = 0; i < sorted.length - 1; i++) {
      const d = distancePointToSegment(map, latlng, sorted[i].latlng, sorted[i + 1].latlng);
      if (d < minDist) {
        minDist = d;
        autoInsertIndex = i + 1;
      }
    }

    if (autoInsertIndex !== null) {
      sorted.splice(autoInsertIndex, 0, newPoint);
      sorted.forEach((p,i)=>p.order=i);
      points.length = 0;
      points.push(...sorted);
    } else if (points.length < 3) {
      points.push(newPoint);
    } else {
      marker.remove();
      return; // ここは例外ケース
    }
  }

  // 🔹 marker に id を付与（これが重要）
  marker.pointId = newPoint.id;

  // dragend で位置更新
marker.on(
  'dragend',
  async (ev) => {
    if (readOnly) { marker.setLatLng(newPoint.latlng); return; }

    const pos =
      ev.target.getLatLng();

    let newLatlng = {
      lat: pos.lat,
      lng: pos.lng
    };
    const terminalRole =
  getTerminalRole(
    newPoint
  );

    // ========================================
    // 起終点は既存線上にスナップ
    // ========================================

    if (
  terminalRole === "startStation"
    ) {

      newLatlng =
        snapToPolyline(
          newLatlng,
          nishikyushuCompetedRoute
        );
    }


    if (
  terminalRole === "endStation"
    ) {

      newLatlng =
        snapToPolyline(
          newLatlng,
          kyushuCompetedRoute
        );
    }


    newPoint.latlng =
      newLatlng;

    marker.setLatLng(
      newLatlng
    );


    // ========================================
    // 起終点の駅名
    // ========================================

    const nameRequestId = newPoint.nameRequestId = (newPoint.nameRequestId || 0) + 1;
    notifyPointsChanged();
    if (terminalRole) {

      const original =
        ORIGINAL_TERMINAL_STATIONS[terminalRole];


      // 元駅から動いている場合
      if (
        isTerminalMoved(
          newPoint
        )
      ) {

        // 通常の新設駅と同様、
        // 住所から「○○市新駅」等を作る。
        const proposedName = await getCityName(
            newLatlng.lat,
            newLatlng.lng
          );
        if (!points.includes(newPoint) || newPoint.nameRequestId !== nameRequestId) return;
        newPoint.name = proposedName;

      } else {

        // 元位置へ戻した場合は
        // 本来の駅名へ戻す。
        newPoint.name =
          original.name;
      }


marker.setIcon(
  stationIcon(
    newPoint.type,
    newPoint.name
  )
);
    }


    // ========================================
    // 既存線・既存駅等を更新
    // ========================================

    updateIgnoredSections();

    updateStationList();

    map.fire(
      'points:updated'
    );
// 初回案内：
// 駅または曲がり点を一度動かしたら
// 分析への案内へ進む
if (guideStep === "adjust") {
  setGuideStep("analyze");
}
  }
);

  if (pan) map.panTo(latlng);
  notifyPointsChanged();

  // ✅ ここ！stationData は渡さない。marker の pointId で常に最新を取る
  bindStationPopup(marker);
  console.log(points)

  return newPoint.id;
}

export function updateIgnoredSections() {
 const start =
  points.find(
    p =>
      getTerminalRole(p)
      === "startStation"
  );

const goal =
  points.find(
    p =>
      getTerminalRole(p)
      === "endStation"
  );

if (!start || !goal) return;
 const route1 = nishikyushuCompetedRoute;
 const route2 = kyushuCompetedRoute;
  // ルート上の最も近いインデックスを取得
  const startSeg = findNearestSegment(route1, start.latlng);
  const goalSeg  = findNearestSegment(route2, goal.latlng);

  // 既存配列をクリア
  nishikyushuIgnoreRoute.length = 0;
  kyushuIgnoreRoute.length = 0;

  // 始点より前（＋補間点を境界）
  if (startSeg.index >= 0) {
    const p1 = route1[startSeg.index];
    const p2 = route1[startSeg.index + 1];
    const boundary = {
      lat: p1.lat + (p2.lat - p1.lat) * startSeg.t,
      lng: p1.lng + (p2.lng - p1.lng) * startSeg.t,
    };
    nishikyushuIgnoreRoute.push(...route1.slice(0, startSeg.index + 1), boundary);
  }

  // 終点より後（補間点以降）
  if (goalSeg.index < route2.length - 1) {
    const p1 = route2[goalSeg.index];
    const p2 = route2[goalSeg.index + 1];
    const boundary = {
      lat: p1.lat + (p2.lat - p1.lat) * goalSeg.t,
      lng: p1.lng + (p2.lng - p1.lng) * goalSeg.t,
    };
    kyushuIgnoreRoute.push(...route2.slice(0,goalSeg.index + 1),boundary);

  }

  // 再描画
  ignoredRouteLayers.forEach(layer => getMap().removeLayer(layer));
  ignoredRouteLayers = [];
  drawinitRoute();
  ignoredRouteLayers.push(drawRouteLayer(nishikyushuIgnoreRoute, false, "gray"));
  ignoredRouteLayers.push(drawRouteLayer(kyushuIgnoreRoute, false, "gray"));
  updatePassedStations();
}




// 編集モード切替でリスト再描画
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("edit-toggle");
  toggle.addEventListener("change", updateStationList);
});

async function getCityName(lat, lng) {
  try {
    const municipality = await getMunicipality(lat, lng);
    return municipality ? municipality.city + '新駅' : '新駅';
  } catch(error) {
    console.warn('市区町村名を取得できないため、仮の駅名を使用します。', error);
    return '新駅';
  }
}

export function removeAllpoints(){
  points.forEach(s => s.marker && getMap().removeLayer(s.marker));
  points = [];
  if(routeLayer) { getMap().removeLayer(routeLayer); routeLayer = null; }
  getMap().fire('points:updated');
}

export function drawRoute(){
  if(firstClick){
    return ""
  }
  if(routeLayer) { getMap().removeLayer(routeLayer); routeLayer = null; }

  //ここで、ポイントから線を書く処理。mapは配列の再構築
  const latlngs = points.map(s => ({ lat: s.latlng.lat, lng: s.latlng.lng }));
  if(latlngs.length >= 2) routeLayer = drawRouteLayer(latlngs);
}

// 初回、または「駅を追加」ボタンを押した直後の地図クリックで駅を追加する。
export function bindAddByClick(){
  const map = getMap();
  const startButton = document.getElementById("guide-start-btn");
  if (startButton) {
    startButton.disabled = false;
    startButton.addEventListener("click", () => {
      setGuideStep("place");
      map.getContainer().focus();
    });
  }

  map.on('click', async (ev) => {
    if (readOnly || placementPending) return;
    const isFirst = firstClick === true;

    // 初回の1駅だけは、従来どおり地図クリックでそのまま追加する。
    // それ以降は「駅を追加」ボタンを押した直後の1クリックだけ有効。
    if (!isFirst && !stationPlacementRequested) return;

    // 連打で複数駅が増えないよう、駅名取得より前に1回分を消費する。
    if (!isFirst) {
      stationPlacementRequested = false;
      document.body.classList.remove("mode-add-station");
    }

    // ① 1クリック目だけ演出（置く前）
    if (isFirst) {
      popRingAtLatLng(ev.latlng);
      showToast("市区町村名を確認しています…", 1200);
    }

    placementPending = true;
    let addedId;
    try {
      const name = await getCityName(ev.latlng.lat, ev.latlng.lng);
      if (readOnly) return;
      addedId = addPoint(ev.latlng, { name });
    } finally { placementPending = false; }
    if (addedId == null) { showToast('駅を追加できませんでした。'); return; }

    if (!isFirst) {
      showToast("駅を追加しました。", 1100);
    }

    // ② 1クリック目だけ：チュートリアル終了 → ルート描画 → UI切替
if (isFirst) {

  // firstClick=false にして通常状態へ
  endTutorial();

  // ルート描画
  drawRoute();

  // 次の案内へ
  setGuideStep("adjust");

  // PC側パネル
  const resultPanel =
    document.getElementById("result-panel");

  if (resultPanel) {
    resultPanel.style.display = "block";
  }


  // ルート線を一瞬強調
  setTimeout(() => {

    try {

      const el =
        routeLayer &&
        routeLayer.getElement
          ? routeLayer.getElement()
          : null;

      if (el) {

        el.classList.add(
          "route-highlight"
        );

        setTimeout(
          () =>
            el.classList.remove(
              "route-highlight"
            ),
          650
        );
      }

    } catch(e) {}

  }, 50);
}
  }

);
const mobileAnalysisBtn =
  document.getElementById(
    "mobile-analysis-btn"
  );

const pcAnalysisBtn =
  document.getElementById(
    "generate-report-btn"
  );


if (mobileAnalysisBtn) {

  mobileAnalysisBtn.addEventListener(
    "click",
    finishGuide
  );
}


if (pcAnalysisBtn) {

  pcAnalysisBtn.addEventListener(
    "click",
    finishGuide
  );
}
}

//デフォルトのルートの読み込み。
export async function loadCompetedRoute(url){
  try {

    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('既存線データの取得に失敗しました。');
    const route = await res.json();
    console.log('competedRoute loaded:', route.length, 'records');
    console.log(route)
    return  route
  } catch(e){
    console.error('competedRoute load failed', e);
    return []
  }
}

export async function loadCompetedStation(url){
  try {

    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('既存線データの取得に失敗しました。');
    const stations = await res.json();
    console.log('competedRoute loaded:', stations.length, 'records');
    return  stations
  } catch(e){
    console.error('competedRoute load failed', e);
    return []
  }
}

export async function setPointPassThrough(
  pointId,
  isPassThrough
) {
  if (readOnly) return false;

  const point =
    points.find(
      p => p.id === pointId
    );


  if (!point) {
    return false;
  }


  const terminalRole =
    getTerminalRole(point);

  const nameRequestId = point.nameRequestId = (point.nameRequestId || 0) + 1;


  if (isPassThrough) {

    // 駅 → 通過点
    point.type =
      "curve";

  } else {

    // 通過点 → 駅
    //
    // 起終点なら元の役割に戻す。
    // 通常点ならstationへ戻す。
    point.type =
      terminalRole
      || "station";

    // 型の変更時点で古い分析結果を無効化する。
    point.marker?.setIcon(stationIcon(point.type, point.name));
    notifyPointsChanged();


    if (terminalRole) {

      const original =
        ORIGINAL_TERMINAL_STATIONS[
          terminalRole
        ];


      if (
        isTerminalMoved(
          point
        )
      ) {

        const proposedName = await getCityName(
            point.latlng.lat,
            point.latlng.lng
          );
        if (!points.includes(point) || point.nameRequestId !== nameRequestId) return false;
        point.name = proposedName;

      } else {

        point.name =
          original.name;
      }
    }
  }


  if (point.marker) {

    point.marker.setIcon(
      stationIcon(
        point.type,
        point.name
      )
    );
  }


  updateIgnoredSections();

  updateStationList();


  const map =
    getMap();

  map.fire(
    "points:updated"
  );


  return true;
}
