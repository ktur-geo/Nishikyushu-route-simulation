import { validateRouteData } from './route-data.js';
// import * as LZString from "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"

/**
 * 共有URLの圧縮形式（v2）
 *
 * 旧形式との主な違い
 * - JSONのキー名を短くする
 * - 座標を小数点以下6桁に丸める
 * - compressToEncodedURIComponent() を使う
 * - URLSearchParamsで「+」が空白に変換されないよう、圧縮文字列の + / $ を置換する
 *
 * 旧 ?data=... 形式は loadFromQuery() 側で引き続き読み込めます。
 */
const SHARE_FORMAT_VERSION = 2;

/**
 * 公開済みURLを固定したい場合だけ設定してください。
 * 例: 'https://example.github.io/nishikyushu/'
 *
 * 空文字のままなら、現在開いているページのURLを使います。
 * GitHub Pages上では空文字のままで問題ありません。
 * Live Server上からX等へテスト共有する場合は、公開URLを設定すると
 * 127.0.0.1 / 192.168.x.x が投稿文に入るのを防げます。
 */
const PUBLIC_SHARE_BASE_URL = '';

function getShareBaseURL() {
  const configured = String(PUBLIC_SHARE_BASE_URL || '').trim();

  if (configured) {
    const url = new URL(configured, location.href);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  return `${location.origin}${location.pathname}`;
}

function roundCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  return Number(number.toFixed(6));
}

function toUrlSafeCompressed(value) {
  return value
    .replace(/\+/g, '_')
    .replace(/\$/g, '~');
}

function fromUrlSafeCompressed(value) {
  return value
    .replace(/_/g, '+')
    .replace(/~/g, '$');
}

/**
 * 現在のルート情報をURLとして生成する関数
 * @param {Array} points - 現在の駅や通過点のリスト
 * @param {Object} map - Leafletの地図オブジェクト（中心・ズームを含めるため）
 */
export function generateShareURL(points, map) {
  validateRouteData({ points });
  const center = map.getCenter();

  // 配列形式にしてキー名の重複を減らす。
  // [id, order, name, type, lat, lng]
  const routeData = {
    v: SHARE_FORMAT_VERSION,
    p: points.map(p => [
      p.id,
      p.order,
      p.name || '',
      p.type,
      roundCoordinate(p.latlng.lat),
      roundCoordinate(p.latlng.lng)
    ]),
    // [centerLat, centerLng, zoom]
    m: [
      roundCoordinate(center.lat),
      roundCoordinate(center.lng),
      map.getZoom()
    ]
  };

  const json = JSON.stringify(routeData);
  const compressed = LZString.compressToEncodedURIComponent(json);
  const encoded = toUrlSafeCompressed(compressed);

  // パラメータ名も短くする。旧 ?data=... は読み込み側で互換対応。
  return `${getShareBaseURL()}?d=${encoded}`;
}

function loadV2(dataParam) {
  if (dataParam.length > 32000) throw new Error('共有URLが長すぎます。');
  const compressed = fromUrlSafeCompressed(dataParam);
  const json = LZString.decompressFromEncodedURIComponent(compressed);

  if (!json || json.length > 100000) {
    throw new Error('共有URLの展開に失敗しました。');
  }

  const routeData = JSON.parse(json);

  if (routeData?.v !== SHARE_FORMAT_VERSION || !Array.isArray(routeData.p)) {
    throw new Error('共有URLの形式が不正です。');
  }

  const points = routeData.p.map((p, index) => ({
    id: p[0],
    order: p[1] ?? index,
    name: p[2],
    type: p[3],
    latlng: {
      lat: p[4],
      lng: p[5]
    }
  }));

  const mapState = Array.isArray(routeData.m)
    ? {
        center: {
          lat: routeData.m[0],
          lng: routeData.m[1]
        },
        zoom: routeData.m[2]
      }
    : null;

  return validateRouteData({ points, mapState });
}

function loadLegacy(dataParam) {
  // URLSearchParams.get() の時点で通常はURLデコード済み。
  // 既存URLとの互換性のため、まずそのまま、次にdecodeURIComponentした値を試す。
  if (dataParam.length > 32000) throw new Error('共有URLが長すぎます。');
  const candidates = [dataParam];

  try {
    const decoded = decodeURIComponent(dataParam);
    if (decoded !== dataParam) candidates.push(decoded);
  } catch (_) {}

  for (const candidate of candidates) {
    try {
      const json = LZString.decompressFromBase64(candidate);
      if (!json || json.length > 100000) continue;

      const routeData = JSON.parse(json);
      const points = routeData.points.map(p => ({
        id: p.id,
        order: p.order,
        name: p.name,
        type: p.type,
        latlng: { lat: p.lat, lng: p.lng }
      }));

      const mapState = routeData.map || null;
      return validateRouteData({ points, mapState });
    } catch (_) {}
  }

  throw new Error('旧形式の共有URLを復元できませんでした。');
}

export function loadFromQuery() {
  const params = new URLSearchParams(location.search);
  const v2Param = params.get('d');
  const legacyParam = params.get('data');

  if (!v2Param && !legacyParam) {
    console.log('クエリパラメータが存在しません。デフォルトデータを使用します。');
    return { points: null, mapState: null };
  }

  try {
    if (v2Param) {
      return loadV2(v2Param);
    }

    return loadLegacy(legacyParam);
  } catch (e) {
    console.error('URLデータの復元に失敗しました:', e);
    return { points: null, mapState: null, error: '共有URLを復元できませんでした。初期ルートを表示しています。' };
  }
}
