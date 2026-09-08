import {
  haversineDistanceMeters,
  get100mMeshCode
} from './utils.js';

const TOURISM_FULL_SCORE = 25;

const TOURISM_RANK_WEIGHT = Object.freeze({
  S: 3,
  A: 2,
  B: 1
});

const DEVELOPMENT_RADIUS_M = 1000;
const DEVELOPMENT_FULL_SCORE_AREA_KM2 = 3.14;
const LAND_USE_MESH_AREA_KM2 = 0.01;
const DEVELOPMENT_SAMPLE_STEP_M = 50;

const DEVELOPMENT_LAND_USE_WEIGHT = Object.freeze({
  '0100': 1,   // 田
  '0200': 1,   // その他の農用地
  '0600': 1,   // 荒地
  '0700': 0.2  // 建物用地（再開発・高度利用の余地）
});

function clampScore(value) {
  return Math.max(
    0,
    Math.min(100, Math.round(Number(value) || 0))
  );
}

/**
 * 駅から観光地までの距離に応じた評価倍率。
 * 境界値は「以内」を近い側へ含める。
 */
export function getTourismDistanceMultiplier(distanceMeters) {
  const distance = Number(distanceMeters);

  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (distance <= 1000) return 1.5;
  if (distance <= 5000) return 1;
  if (distance <= 10000) return 0.5;
  return 0;
}

/**
 * 観光地ごとに最寄り駅を求め、距離倍率を掛けて合計する。
 */
export function calculateTourismAccessScoreFromData(
  spots,
  stations
) {
  const safeSpots = Array.isArray(spots) ? spots : [];
  const safeStations = Array.isArray(stations) ? stations : [];

  const accessedWeight = safeSpots.reduce((sum, spot) => {
    let nearestDistance = Infinity;

    for (const station of safeStations) {
      const distance = haversineDistanceMeters(station, spot);

      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    const rankWeight = TOURISM_RANK_WEIGHT[spot.rank] || 1;

    return sum
      + rankWeight
      * getTourismDistanceMultiplier(nearestDistance);
  }, 0);

  return {
    score: clampScore(
      accessedWeight
      / TOURISM_FULL_SCORE
      * 100
    ),
    accessedWeight
  };
}

function normalizeStationLatLng(station) {
  if (station?.latlng) return station.latlng;
  return station;
}

/**
 * 新設駅の1km圏にある土地を、土地利用別の係数で評価する。
 * 同一メッシュは駅圏が重なっても1回だけ数える。
 */
export function calculateDevelopmentScoreFromStations(
  stations,
  landUseData
) {
  const safeStations = Array.isArray(stations) ? stations : [];

  if (!safeStations.length) {
    return {
      score: 0,
      areaKm2: 0,
      meshCount: 0,
      weightedMeshCount: 0
    };
  }

  const targetMeshCodes = new Set();

  for (const station of safeStations) {
    const center = normalizeStationLatLng(station);
    const centerLat = Number(center?.lat);
    const centerLng = Number(center?.lng);

    if (
      !Number.isFinite(centerLat)
      || !Number.isFinite(centerLng)
    ) {
      continue;
    }

    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng =
      111320
      * Math.cos(centerLat * Math.PI / 180);

    for (
      let north = -DEVELOPMENT_RADIUS_M;
      north <= DEVELOPMENT_RADIUS_M;
      north += DEVELOPMENT_SAMPLE_STEP_M
    ) {
      const maxEast = Math.sqrt(
        DEVELOPMENT_RADIUS_M ** 2
        - north ** 2
      );

      for (
        let east = -maxEast;
        east <= maxEast;
        east += DEVELOPMENT_SAMPLE_STEP_M
      ) {
        targetMeshCodes.add(
          get100mMeshCode(
            centerLat + north / metersPerDegreeLat,
            centerLng + east / metersPerDegreeLng
          )
        );
      }
    }
  }

  let meshCount = 0;
  let weightedMeshCount = 0;

  for (const meshCode of targetMeshCodes) {
    const weight =
      DEVELOPMENT_LAND_USE_WEIGHT[
        landUseData?.[meshCode]
      ] || 0;

    if (weight > 0) {
      meshCount++;
      weightedMeshCount += weight;
    }
  }

  const areaKm2 =
    weightedMeshCount
    * LAND_USE_MESH_AREA_KM2;

  return {
    score: clampScore(
      areaKm2
      / DEVELOPMENT_FULL_SCORE_AREA_KM2
      * 100
    ),
    areaKm2,
    meshCount,
    weightedMeshCount
  };
}
