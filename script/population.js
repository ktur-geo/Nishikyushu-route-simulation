import { showLoading, hideLoading } from "./utils.js";


// 500m（2分の1地域）メッシュの大きさ
// population-mesh.json の lat / lng は各メッシュの南西端座標
export const POPULATION_MESH_LAT_STEP = 1 / 240; // 緯度15秒
export const POPULATION_MESH_LNG_STEP = 1 / 160; // 経度22.5秒

const LAT_MESH = POPULATION_MESH_LAT_STEP;
const LNG_MESH = POPULATION_MESH_LNG_STEP;

let meshDict = new Map();
let densityCache = new Map();
let meshData = [];
let minLat = Infinity, maxLat = -Infinity;
let minLng = Infinity, maxLng = -Infinity;

export function getMeshdata (){
  return meshData
}

export async function loadPopulationMesh(url = new URL('../data/population-mesh.json', import.meta.url)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('人口データの取得に失敗しました。');
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('人口データが不正です。');

  meshDict = new Map();
  densityCache = new Map();
  meshData = Array.isArray(data) ? data : [];

  minLat = Infinity;
  maxLat = -Infinity;
  minLng = Infinity;
  maxLng = -Infinity;

  meshData.forEach(d => {

    // JSONのlat/lngは500mメッシュ南西端の座標
    const r = Math.round(d.lat / LAT_MESH);
    const c = Math.round(d.lng / LNG_MESH);

    const key = `${r}_${c}`;

    meshDict.set(key, d.population || 0);

    minLat = Math.min(minLat, d.lat);
    maxLat = Math.max(maxLat, d.lat);
    minLng = Math.min(minLng, d.lng);
    maxLng = Math.max(maxLng, d.lng);
  });

  console.log("mesh loaded:", meshDict.size, "cells");
}

// データ表示モード用。画面内にある人口メッシュだけを返す。
export function getPopulationMeshesInBounds(bounds, limit = Infinity) {
  if (!bounds || !meshData.length) return [];

  // lat / lng は各500mメッシュの南西端座標。
  // 画面端に一部だけ掛かるセルも含める。
  const visible = meshData.filter(d =>
    d.lat + LAT_MESH >= bounds.getSouth() && d.lat <= bounds.getNorth() &&
    d.lng + LNG_MESH >= bounds.getWest() && d.lng <= bounds.getEast()
  );

  // データ表示では原則として間引かない。
  // limit を明示した呼び出しだけ、必要に応じて均等間引きできるよう残す。
  if (!Number.isFinite(limit) || visible.length <= limit) return visible;

  const step = Math.ceil(visible.length / limit);
  return visible.filter((_, index) => index % step === 0);
}

export function getPopulationWithinRadius(lat, lng, radiusKm = 5) {
  const R = 6371;
  const toRad = v => (v * Math.PI) / 180;

  // 半径を緯度・経度方向のおおよその角度へ変換
  const dLat =
    (radiusKm / R) *
    (180 / Math.PI);

  const dLng =
    (radiusKm / (R * Math.cos(toRad(lat)))) *
    (180 / Math.PI);

  /*
   * 検索対象となる500mメッシュの範囲を取得。
   *
   * メッシュ中心が検索範囲内に入るものを漏らさないよう、
   * 前後に1メッシュ分余裕を持たせる。
   */
  const rMin =
    Math.floor((lat - dLat) / LAT_MESH) - 1;

  const rMax =
    Math.ceil((lat + dLat) / LAT_MESH) + 1;

  const cMin =
    Math.floor((lng - dLng) / LNG_MESH) - 1;

  const cMax =
    Math.ceil((lng + dLng) / LNG_MESH) + 1;

  let total = 0;
  const spots = [];

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {

      /*
       * r・cが示す座標はメッシュ南西端。
       * 距離判定には500mメッシュの中心を使用する。
       */
      const southLat = r * LAT_MESH;
      const westLng = c * LNG_MESH;

      const mLat =
        southLat + LAT_MESH / 2;

      const mLng =
        westLng + LNG_MESH / 2;

      // 駅とメッシュ中心との距離をHaversine公式で算定
      const dLatR =
        toRad(mLat - lat);

      const dLngR =
        toRad(mLng - lng);

      const a =
        Math.sin(dLatR / 2) ** 2 +
        Math.cos(toRad(lat)) *
        Math.cos(toRad(mLat)) *
        Math.sin(dLngR / 2) ** 2;

      const d =
        2 *
        R *
        Math.atan2(
          Math.sqrt(a),
          Math.sqrt(1 - a)
        );

      // メッシュ中心が指定半径以内なら人口を集計
      if (d <= radiusKm) {

        const key = `${r}_${c}`;

        const pop =
          meshDict.get(key) ?? 0;

        total += pop;

        spots.push({
          lat: mLat,
          lng: mLng,
          population: pop
        });
      }
    }
  }

  return {
    spots,
    totalPopulation: total
  };
}

// 半径1kmの人口密度（セル面積補正あり）
// 半径1km内の人口密度（500mメッシュの実面積補正あり）
export function getPopulationDensity1km(spots) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;

  let popSum = 0;
  let areaSum = 0;

  for (const s of spots) {
    const lat = s.lat;

    /*
     * 500mメッシュの実際の大きさを緯度経度から算定。
     * 緯度方向15秒、経度方向22.5秒。
     */
    const latKm =
      toRad(LAT_MESH) * R;

    const lngKm =
      toRad(LNG_MESH) *
      R *
      Math.cos(toRad(lat));

    const cellArea =
      latKm * lngKm;

    popSum +=
      s.population || 0;

    areaSum +=
      cellArea;
  }

  if (areaSum === 0) {
    return 0;
  }

  // 人/km²
  return popSum / areaSum;
}


export function getPopulationDensityAtPoint(lat, lng) {

 // 座標を500mメッシュに変換
 const r = Math.floor(lat / LAT_MESH);
const c = Math.floor(lng / LNG_MESH);
const key = `${r}_${c}`;

  // キャッシュがあればそれを返す
  if (densityCache.has(key)) {
    return densityCache.get(key);
  }
  //なければ計算。
  // 半径1km内の人口データを取得
  const pop1km = getPopulationWithinRadius(lat, lng, 1);

  // セル面積補正による人口密度計算
  const density = getPopulationDensity1km(pop1km.spots);

  return density; // 人/km²
}
