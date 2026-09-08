import { haversineDistanceMeters } from './utils.js';

const PROFILE_SETTINGS = {
  nishikyushu: {
    url: new URL('../data/nishikyushu-existing-track-profile-approx.json', import.meta.url),
    // 西九州新幹線の縦断図は武雄温泉を0kmとしている。
    sourceLengthMeters: 65_998,
    routeDirection: 'forward'
  },
  kyushu: {
    url: new URL('../data/kyushu-existing-track-profile-approx-v2.json', import.meta.url),
    // アプリの平面線形は熊本－博多、元資料は博多－熊本98km180m。
    sourceLengthMeters: 98_180,
    routeDirection: 'reverse'
  }
};

const profilePromises = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProfile(raw) {
  const points = Array.isArray(raw)
    ? raw
    : raw?.points;

  if (!Array.isArray(points)) {
    throw new Error('既存線標高データのpointsが見つかりません。');
  }

  const normalized = points
    .map(point => {
      const distanceMetersValue =
        Number(point.distance_m);
      const distanceKmValue =
        Number(point.distance_km);

      return {
        distanceMeters:
          Number.isFinite(distanceMetersValue)
            ? distanceMetersValue
            : distanceKmValue * 1000,
        elevation:
          Number(point.elevation_m)
      };
    })
    .filter(point =>
      Number.isFinite(point.distanceMeters)
      && Number.isFinite(point.elevation)
    )
    .sort((a, b) =>
      a.distanceMeters
      - b.distanceMeters
    );

  if (normalized.length < 2) {
    throw new Error('既存線標高データの有効点が不足しています。');
  }

  return normalized;
}

async function loadProfile(profileKey) {
  const setting =
    PROFILE_SETTINGS[profileKey];

  if (!setting) {
    throw new Error(`不明な既存線種別です: ${profileKey}`);
  }

  if (!profilePromises.has(profileKey)) {
    profilePromises.set(
      profileKey,
      fetch(setting.url)
        .then(response => {
          if (!response.ok) {
            throw new Error(
              `既存線標高データを読み込めません: ${response.status}`
            );
          }
          return response.json();
        })
        .then(normalizeProfile)
        .catch(error => {
          // 一時的な読込失敗後に再試行できるよう、失敗したPromiseは保持しない。
          profilePromises.delete(profileKey);
          throw error;
        })
    );
  }

  return profilePromises.get(profileKey);
}

function getSourceDistanceMeters(
  setting,
  routeDistanceMeters,
  routeLengthMeters
) {
  const routeRatio =
    routeLengthMeters > 0
      ? clamp(
          routeDistanceMeters
            / routeLengthMeters,
          0,
          1
        )
      : 0;

  return setting.routeDirection === 'reverse'
    ? setting.sourceLengthMeters
      * (1 - routeRatio)
    : setting.sourceLengthMeters
      * routeRatio;
}

/**
 * 線路平面線形上へ点を投影し、配列先頭からの累積距離を求める。
 */
export function projectPointOntoRoute(latlng, route) {
  if (!latlng || !Array.isArray(route) || route.length < 2) {
    return null;
  }

  let routeLengthMeters = 0;
  const segmentLengths = [];

  for (let i = 0; i < route.length - 1; i++) {
    const length =
      haversineDistanceMeters(
        route[i],
        route[i + 1]
      );

    segmentLengths.push(length);
    routeLengthMeters += length;
  }

  let best = null;
  let distanceBeforeSegment = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const start = route[i];
    const end = route[i + 1];
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const lengthSquared = dx * dx + dy * dy;

    const t = lengthSquared > 0
      ? clamp(
          (
            (latlng.lng - start.lng) * dx
            + (latlng.lat - start.lat) * dy
          ) / lengthSquared,
          0,
          1
        )
      : 0;

    const projected = {
      lat: start.lat + dy * t,
      lng: start.lng + dx * t
    };

    const offsetMeters =
      haversineDistanceMeters(
        latlng,
        projected
      );

    if (!best || offsetMeters < best.offsetMeters) {
      best = {
        point: projected,
        segmentIndex: i,
        segmentFraction: t,
        offsetMeters,
        routeDistanceMeters:
          distanceBeforeSegment
          + segmentLengths[i] * t,
        routeLengthMeters
      };
    }

    distanceBeforeSegment +=
      segmentLengths[i];
  }

  return best;
}

export function interpolateProfileElevation(
  profile,
  distanceMeters
) {
  if (!Array.isArray(profile) || profile.length === 0) {
    return null;
  }

  const distance = clamp(
    distanceMeters,
    profile[0].distanceMeters,
    profile[profile.length - 1].distanceMeters
  );

  if (distance <= profile[0].distanceMeters) {
    return profile[0].elevation;
  }

  for (let i = 0; i < profile.length - 1; i++) {
    const start = profile[i];
    const end = profile[i + 1];

    if (distance > end.distanceMeters) {
      continue;
    }

    const span =
      end.distanceMeters
      - start.distanceMeters;

    if (span <= 0) {
      return end.elevation;
    }

    const t =
      (distance - start.distanceMeters)
      / span;

    return start.elevation
      + (end.elevation - start.elevation) * t;
  }

  return profile[profile.length - 1].elevation;
}

/**
 * 接続地点から既存線配列の終端まで、または終端から接続地点までの
 * 線路標高を、断面図用の距離座標で返す。
 *
 * 両既存線とも配列終端が全体断面図の外側終点
 * （西九州新幹線＝長崎、九州新幹線＝博多）なので、
 * directionだけで長崎→接続点／接続点→博多を表現できる。
 */
export async function buildExistingTrackProfileSection({
  route,
  profileKey,
  connectionLatlng,
  direction,
  intervalMeters = 100,
  distanceOffsetMeters = 0,
  maxOffsetMeters = 100
}) {
  const setting = PROFILE_SETTINGS[profileKey];

  if (
    !setting
    || !Array.isArray(route)
    || route.length < 2
    || !connectionLatlng
  ) {
    throw new Error('既存線断面図の条件が不足しています。');
  }

  if (
    direction !== 'route-end-to-connection'
    && direction !== 'connection-to-route-end'
  ) {
    throw new Error(`不明な既存線断面方向です: ${direction}`);
  }

  const projected = projectPointOntoRoute(
    connectionLatlng,
    route
  );

  if (
    !projected
    || projected.offsetMeters > maxOffsetMeters
  ) {
    throw new Error('接続地点を既存線上へ対応付けられません。');
  }

  const routeEndDistance =
    projected.routeLengthMeters;

  const connectionDistance =
    projected.routeDistanceMeters;

  const startsAtRouteEnd =
    direction === 'route-end-to-connection';

  const startRouteDistance =
    startsAtRouteEnd
      ? routeEndDistance
      : connectionDistance;

  const endRouteDistance =
    startsAtRouteEnd
      ? connectionDistance
      : routeEndDistance;

  const routeDistanceSign =
    endRouteDistance >= startRouteDistance
      ? 1
      : -1;

  const lengthMeters = Math.abs(
    endRouteDistance - startRouteDistance
  );

  const safeInterval = Math.max(
    20,
    Number(intervalMeters) || 100
  );

  const stepCount = Math.max(
    1,
    Math.ceil(lengthMeters / safeInterval)
  );

  const profile = await loadProfile(profileKey);
  const points = [];

  for (let i = 0; i <= stepCount; i++) {
    const travelDistance =
      i === stepCount
        ? lengthMeters
        : Math.min(
            lengthMeters,
            i * safeInterval
          );

    const routeDistance =
      startRouteDistance
      + routeDistanceSign * travelDistance;

    const sourceDistanceMeters =
      getSourceDistanceMeters(
        setting,
        routeDistance,
        routeEndDistance
      );

    const elevation =
      interpolateProfileElevation(
        profile,
        sourceDistanceMeters
      );

    if (!Number.isFinite(elevation)) {
      continue;
    }

    points.push({
      x: distanceOffsetMeters + travelDistance,
      y: elevation,
      routeDistanceMeters: routeDistance,
      sourceDistanceMeters
    });
  }

  return {
    points,
    lengthMeters,
    connectionRouteDistanceMeters:
      connectionDistance,
    routeLengthMeters: routeEndDistance,
    direction,
    profileKey
  };
}

/**
 * アプリの平面線形上の位置を元資料の距離へ換算し、線路標高を返す。
 * 平面線形と元資料の全長差は、全区間へ同じ比率で配分する。
 */
export async function getExistingTrackElevation({
  latlng,
  route,
  profileKey,
  maxOffsetMeters = 30
}) {
  const setting =
    PROFILE_SETTINGS[profileKey];

  if (!setting) {
    return null;
  }

  const projected =
    projectPointOntoRoute(
      latlng,
      route
    );

  if (
    !projected
    || projected.offsetMeters
      > maxOffsetMeters
  ) {
    return null;
  }

  const sourceDistanceMeters =
    getSourceDistanceMeters(
      setting,
      projected.routeDistanceMeters,
      projected.routeLengthMeters
    );

  const profile =
    await loadProfile(profileKey);

  const elevation =
    interpolateProfileElevation(
      profile,
      sourceDistanceMeters
    );

  if (!Number.isFinite(elevation)) {
    return null;
  }

  return {
    elevation,
    sourceDistanceMeters,
    routeDistanceMeters:
      projected.routeDistanceMeters,
    routeLengthMeters:
      projected.routeLengthMeters,
    offsetMeters:
      projected.offsetMeters,
    profileKey
  };
}
