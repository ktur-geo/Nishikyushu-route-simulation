// 地理院DEMタイル（dem5a_png）を読み、色値から標高を算出するモジュール
import {
  latLngToPixel,
  showLoading,
  hideLoading,
  haversineDistanceMeters,
  samplePolylineLatLngs
} from './utils.js';
import { getExistingTrackElevation } from './existing-track-elevation.js';

const TILE_SIZE = 256;
const DEM5A_ZOOM = 15;
const DEM10B_ZOOM = 14;
const MAX_DEM_TILE_CACHE_SIZE = 256;

// 同じ標高タイルを地点ごとに再取得しないよう、画像の全画素を保持する。
// Promise自体を保存するため、並列処理中の同一タイル要求も1回の通信にまとまる。
const demTilePromises = new Map();

function getTileParams(lat, lng, zoom) {
  const { pixelX, pixelY } =
    latLngToPixel(lat, lng, zoom, TILE_SIZE);

  const tileX = Math.floor(pixelX / TILE_SIZE);
  const tileY = Math.floor(pixelY / TILE_SIZE);

  return {
    tileX,
    tileY,
    px: Math.floor(pixelX - tileX * TILE_SIZE),
    py: Math.floor(pixelY - tileY * TILE_SIZE)
  };
}

function trimDemTileCache() {
  while (demTilePromises.size > MAX_DEM_TILE_CACHE_SIZE) {
    const oldestKey = demTilePromises.keys().next().value;
    demTilePromises.delete(oldestKey);
  }
}

function loadDemTile(tileUrl) {
  if (demTilePromises.has(tileUrl)) {
    return demTilePromises.get(tileUrl);
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    const timeout = setTimeout(() => {
      img.onload = null; img.onerror = null;
      reject(new Error('標高タイルの取得がタイムアウトしました。'));
    }, 15000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        resolve(
          ctx.getImageData(
            0,
            0,
            TILE_SIZE,
            TILE_SIZE
          ).data
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => { clearTimeout(timeout); reject(new Error('Tile not found: ' + tileUrl)); };

    img.src = tileUrl;
  }).catch(error => {
    // 一時的な通信失敗後に再試行できるよう、失敗したPromiseは残さない。
    demTilePromises.delete(tileUrl);
    throw error;
  });

  demTilePromises.set(tileUrl, promise);
  trimDemTileCache();
  return promise;
}

async function readDemFromTile(tileUrl, px, py) {
  const data = await loadDemTile(tileUrl);
  const offset = (py * TILE_SIZE + px) * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];

  let raw = red * 65536 + green * 256 + blue;

  if (raw === (2 ** 23)) {
    return null;
  }

  if (raw > (2 ** 23)) {
    raw -= (2 ** 24);
  }

  return raw * 0.01;
}

/*
 * getElevation(lat,lng) -> 標高(m) を返す (Promise)
 * タイルのRGB値 -> 16bit符号付き*0.01m を DEM 仕様に合わせて復元します。
 */
export async function getElevation(lat, lng) {
  // --- まず DEM5A 試行 ---
  const { tileX: x5, tileY: y5, px: px5, py: py5 } = getTileParams(lat, lng, DEM5A_ZOOM);
  const url5 = `https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/${DEM5A_ZOOM}/${x5}/${y5}.png`;

  try {
    const h5 = await readDemFromTile(url5, px5, py5);
    if (h5 !== null) return h5;
  } catch (e) {
    // console.warn('DEM5A not found, fallback to 10B');
  }

  // --- フォールバック DEM10B ---
  const { tileX: x10, tileY: y10, px: px10, py: py10 } = getTileParams(lat, lng, DEM10B_ZOOM);
  const url10 = `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${DEM10B_ZOOM}/${x10}/${y10}.png`;

  try {
    const h10 = await readDemFromTile(url10, px10, py10);
    if (h10 !== null) return h10;
  } catch (e) {
    console.error('DEM10B also not found:', e.message);
  }

  return null;
}

// 既存線など長い線形用。DEMだけを並列数を抑えて取得する。
// タイルキャッシュと併用し、同一タイルへの重複通信を避ける。
export async function getTerrainElevationsAlongPolyline(
  latlngs,
  intervalMeters = 100,
  {
    onProgress,
    concurrency = 6
  } = {}
) {
  const sampled = samplePolylineLatLngs(
    latlngs,
    intervalMeters
  );

  const results = new Array(sampled.length);

  if (!sampled.length) {
    onProgress?.(0, 0);
    return results;
  }

  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(
    sampled.length,
    Math.max(1, Math.floor(Number(concurrency) || 1))
  );

  onProgress?.(0, sampled.length);

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= sampled.length) return;

      const point = sampled[index];
      let elevation = null;

      try {
        elevation = await getElevation(
          point.lat,
          point.lng
        );
      } catch (error) {
        console.warn(
          '既存線沿線の地形標高を取得できませんでした。',
          error
        );
      }

      results[index] = {
        ...point,
        elevation,
        elevationSource:
          Number.isFinite(elevation)
            ? 'dem'
            : null,
        isStation: false
      };

      completed++;
      onProgress?.(completed, sampled.length);
    }
  };

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return results;
}

// 線形(latlngs: [{lat,lng},...]) に沿って interval m ごとにサンプリングして標高を取得する。
// 戻り値: [{lat,lng,elevation}]（elevationは null の可能性あり）
export async function getElevationsAlongPolyline(
  latlngs,
  intervalMeters = 100,
  {
    onProgress,
    stationLatlngs = [],
    existingTrackEndpoints = []
  } = {}
){
    showLoading("標高計算中...");
  // samplePolylineLatLngs は export されていなかった -> import above; if not, call utils.samplePolyline...
  // to avoid circular issues, we re-import sample function via relative path (we used export)
  const sampled = samplePolylineLatLngs(latlngs, intervalMeters);
  const results = [];
  // 連続で大量にタイルを読み込むと遅い・負荷が高いので Promise.all を控えめにして逐次処理
  try {
    for (let i = 0; i < sampled.length; i++) {
      const pt = sampled[i];
      const endpoint = existingTrackEndpoints.find(item =>
        haversineDistanceMeters(
          pt,
          item.latlng
        ) < 1
      );

      try {
        let elevation = null;
        let existingTrack = null;

        if (endpoint) {
          try {
            existingTrack =
              await getExistingTrackElevation({
                latlng: pt,
                route: endpoint.route,
                profileKey: endpoint.profileKey
              });
          } catch (error) {
            // 標高JSONの読込に失敗しても、従来のDEM計算は継続する。
            console.warn(
              '既存線標高を取得できないためDEMへ切り替えます。',
              error
            );
          }
        }

        if (existingTrack) {
          elevation = existingTrack.elevation;
        } else {
          elevation =
            await getElevation(
              pt.lat,
              pt.lng
            );
        }

        results.push({
          ...pt,
          elevation,
          elevationSource:
            existingTrack
              ? 'existing-track-profile'
              : 'dem',
          existingTrackProfileDistanceMeters:
            existingTrack
              ?.sourceDistanceMeters
              ?? null,
          isStation: stationLatlngs.some(st =>
            Math.abs(st.lat - pt.lat) < 1e-8
            && Math.abs(st.lng - pt.lng) < 1e-8
          )
        });
      } catch (error) {
        console.warn(
          '標高を取得できませんでした。',
          error
        );
        results.push({
          ...pt,
          elevation: null,
          elevationSource: null,
          existingTrackProfileDistanceMeters: null,
          isStation: stationLatlngs.some(st =>
            Math.abs(st.lat - pt.lat) < 1e-8
            && Math.abs(st.lng - pt.lng) < 1e-8
          )
        });
      }

      if (onProgress) {
        onProgress(i + 1, sampled.length);
      }
    }
  } finally {
    hideLoading();
  }

  return results;
}
