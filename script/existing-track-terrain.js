import { projectPointOntoRoute } from './existing-track-elevation.js';

const TERRAIN_DATA_URL =
  new URL('../data/existing-track-terrain-100m.json', import.meta.url);

let terrainDataPromise = null;

function normalizeTerrainRoute(rawRoute, routeKey) {
  const points = rawRoute?.points;

  if (!Array.isArray(points) || points.length < 2) {
    throw new Error(
      `既存線地形データが不足しています: ${routeKey}`
    );
  }

  const normalizedPoints = points
    .map(point => ({
      routeDistanceMeters:
        Number(point.route_distance_m),
      elevation:
        point.elevation_m === null
          ? null
          : Number(point.elevation_m)
    }))
    .filter(point =>
      Number.isFinite(point.routeDistanceMeters)
    )
    .sort((a, b) =>
      a.routeDistanceMeters
      - b.routeDistanceMeters
    );

  if (normalizedPoints.length < 2) {
    throw new Error(
      `既存線地形データの有効点が不足しています: ${routeKey}`
    );
  }

  return {
    routeLengthMeters:
      Number(rawRoute.route_length_m),
    points: normalizedPoints
  };
}

async function loadTerrainData() {
  if (!terrainDataPromise) {
    terrainDataPromise = fetch(TERRAIN_DATA_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `保存済み既存線地形を読み込めません: ${response.status}`
          );
        }
        return response.json();
      })
      .then(raw => ({
        nishikyushu: normalizeTerrainRoute(
          raw?.routes?.nishikyushu,
          'nishikyushu'
        ),
        kyushu: normalizeTerrainRoute(
          raw?.routes?.kyushu,
          'kyushu'
        )
      }))
      .catch(error => {
        // ファイル配置後に再試行できるよう、失敗したPromiseは保持しない。
        terrainDataPromise = null;
        throw error;
      });
  }

  return terrainDataPromise;
}

function interpolateTerrainElevation(points, distanceMeters) {
  if (!points.length) return null;

  if (distanceMeters <= points[0].routeDistanceMeters) {
    return points[0].elevation;
  }

  let low = 0;
  let high = points.length - 1;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);

    if (
      points[middle].routeDistanceMeters
      < distanceMeters
    ) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const start = points[low];
  const end = points[high];

  if (!Number.isFinite(start.elevation)
      || !Number.isFinite(end.elevation)) {
    return null;
  }

  const span =
    end.routeDistanceMeters
    - start.routeDistanceMeters;

  if (span <= 0) return end.elevation;

  const ratio =
    (distanceMeters - start.routeDistanceMeters)
    / span;

  return start.elevation
    + (end.elevation - start.elevation) * ratio;
}

function appendPointWithoutDuplicate(points, point) {
  const previous = points[points.length - 1];

  if (previous && Math.abs(previous.x - point.x) < 0.01) {
    points[points.length - 1] = point;
    return;
  }

  points.push(point);
}

/**
 * 保存済み100m間隔DEMから、接続地点と既存線終端の間だけを抽出する。
 */
export async function buildExistingTerrainProfileSection({
  route,
  routeKey,
  connectionLatlng,
  direction,
  distanceOffsetMeters = 0,
  maxOffsetMeters = 100
}) {
  if (
    direction !== 'route-end-to-connection'
    && direction !== 'connection-to-route-end'
  ) {
    throw new Error(`不明な既存線地形方向です: ${direction}`);
  }

  const projected = projectPointOntoRoute(
    connectionLatlng,
    route
  );

  if (!projected || projected.offsetMeters > maxOffsetMeters) {
    throw new Error('接続地点を既存線地形へ対応付けられません。');
  }

  const terrainData = await loadTerrainData();
  const cachedRoute = terrainData[routeKey];

  if (!cachedRoute) {
    throw new Error(`保存済み既存線地形がありません: ${routeKey}`);
  }

  if (
    !Number.isFinite(cachedRoute.routeLengthMeters)
    || Math.abs(
      cachedRoute.routeLengthMeters
      - projected.routeLengthMeters
    ) > 10
  ) {
    throw new Error(
      `平面線形が更新されています。既存線地形JSONを再生成してください: ${routeKey}`
    );
  }

  const connectionDistance =
    projected.routeDistanceMeters;
  const routeLength = projected.routeLengthMeters;
  const sourcePoints = cachedRoute.points;
  const points = [];

  const connectionPoint = {
    routeDistanceMeters: connectionDistance,
    elevation: interpolateTerrainElevation(
      sourcePoints,
      connectionDistance
    )
  };

  if (direction === 'route-end-to-connection') {
    for (let i = sourcePoints.length - 1; i >= 0; i--) {
      const point = sourcePoints[i];
      if (point.routeDistanceMeters < connectionDistance) {
        break;
      }

      appendPointWithoutDuplicate(points, {
        x: distanceOffsetMeters
          + routeLength
          - point.routeDistanceMeters,
        y: point.elevation
      });
    }

    appendPointWithoutDuplicate(points, {
      x: distanceOffsetMeters
        + routeLength
        - connectionDistance,
      y: connectionPoint.elevation
    });
  } else {
    appendPointWithoutDuplicate(points, {
      x: distanceOffsetMeters,
      y: connectionPoint.elevation
    });

    for (const point of sourcePoints) {
      if (point.routeDistanceMeters <= connectionDistance) {
        continue;
      }

      appendPointWithoutDuplicate(points, {
        x: distanceOffsetMeters
          + point.routeDistanceMeters
          - connectionDistance,
        y: point.elevation
      });
    }
  }

  return {
    points,
    lengthMeters:
      routeLength - connectionDistance,
    source: 'saved-dem-json'
  };
}
