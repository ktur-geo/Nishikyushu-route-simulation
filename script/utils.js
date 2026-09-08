// 共通ユーティリティ
export function toRad(deg){ return deg * Math.PI / 180; }

export function haversineDistanceMeters(a, b){
  // a,b: {lat, lng}
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat/2), sinDLon = Math.sin(dLon/2);
  const A = sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLon*sinDLon;
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1-A));
  return R * C;
}

// 線分を interval(m) ごとにサンプリングして配列で返す
//
export function samplePolylineLatLngs(latlngs, intervalMeters = 100){
  const sampled = [];
  let distanceFromStart = 0;
  for(let i=0;i<latlngs.length-1;i++){
    const s = latlngs[i], e = latlngs[i+1];
    
    const segLen = haversineDistanceMeters(s, e);
    // ceil にして、隣り合うサンプルの間隔が指定値を超えないようにする。
    const steps = Math.max(1, Math.ceil(segLen / intervalMeters));
    
    // ここがポイント：最初の線分(i===0)だけj=0から始め、以降はj=1から始める
    const startJ = (i === 0) ? 0 : 1;
    
    for (let j = startJ; j <= steps; j++) {
      const f = j / steps;
      sampled.push({ 
        lat: s.lat + (e.lat - s.lat) * f, 
        lng: s.lng + (e.lng - s.lng) * f,
        distanceMeters: distanceFromStart + segLen * f,
        // 線形の頂点は駅または曲線点。後段で駅フラグを与えられるよう保持する。
        isVertex: j === 0 || j === steps
      });
    }
    distanceFromStart += segLen;
  }
  return sampled;
}

// 緯度経度 -> タイルピクセル (WebMercator)（Chart/DEMタイル用）
export function latLngToPixel(lat, lng, zoom, tileSize = 256){
  const sinLat = Math.sin(lat * Math.PI / 180);
  const x = ((lng + 180) / 360) * (2 ** zoom) * tileSize;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * (2 ** zoom) * tileSize;
  return { pixelX: x, pixelY: y };
}


//処理中にメッセージを出す関数。
export function showLoading(message) {
  const loader = document.getElementById("loading");
  loader.innerText = message;
  loader.style.display = "block";
}

export function hideLoading() {
  document.getElementById("loading").style.display = "none";
}


// 線分 (A,B) と点 P の距離
export function distancePointToSegment(map, latlng, latlngA, latlngB) {
  const p = map.latLngToLayerPoint(latlng);
  const a = map.latLngToLayerPoint(latlngA);
  const b = map.latLngToLayerPoint(latlngB);
  return L.LineUtil.pointToSegmentDistance(p, a, b);
}

export function projectPointOnSegment(p, a, b) {
  const ax = a.lng, ay = a.lat;
  const bx = b.lng, by = b.lat;
  const px = p.lng, py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx*dx + dy*dy;
  if (length2 === 0) return L.latLng(a.lat, a.lng);

  let t = ((px - ax) * dx + (py - ay) * dy) / length2;
  t = Math.max(0, Math.min(1, t)); // 線分範囲内に制限

  return L.latLng(ay + t*dy, ax + t*dx);
}

export function findNearestSegment(route, latlng) {
  let minDist = Infinity;
  let nearestSegment = { index: 0, t: 0 }; // index = 線分の始点側, t=0〜1の補間係数

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const proj = projectPointToSegment(latlng, p1, p2);
    if (proj.dist < minDist) {
      minDist = proj.dist;
      nearestSegment = { index: i, t: proj.t };
    }
  }
  return nearestSegment;
}

// 線分上で最も近い点（補間点）を求める
export function projectPointToSegment(p, a, b) {
  const ax = a.lat, ay = a.lng;
  const bx = b.lat, by = b.lng;
  const px = p.lat, py = p.lng;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));

  const closest = { lat: ax + abx * t, lng: ay + aby * t };
  const dist = Math.hypot(px - closest.lat, py - closest.lng);
  return { point: closest, t, dist };
}

/**
 * 緯度経度から100mメッシュコード（1/10細分メッシュコード）を計算する
 * @param {number} lat - 緯度 (例: 33.33333333)
 * @param {number} lng - 経度 (例: 130.00125)
 * @returns {string} 10桁のメッシュコード (例: "5030000001")
 */
export function get100mMeshCode(lat, lng) {
  // 1次メッシュ（約80km四方）の計算
  const p = Math.floor(lat * 1.5);
  const q = Math.floor(lng - 100.0);

  // 2次メッシュ（約10km四方）の計算
  const latRem1 = lat * 1.5 - p;
  const lngRem1 = lng - 100.0 - q;
  const r = Math.floor(latRem1 * 8.0);
  const s = Math.floor(lngRem1 * 8.0);

  // 3次メッシュ（約1km四方・標準地域メッシュ）の計算
  const latRem2 = latRem1 * 8.0 - r;
  const lngRem2 = lngRem1 * 8.0 - s;
  const t = Math.floor(latRem2 * 10.0);
  const u = Math.floor(lngRem2 * 10.0);

  // 100mメッシュ（1/10細分メッシュ）の計算
  const latRem3 = latRem2 * 10.0 - t;
  const lngRem3 = lngRem2 * 10.0 - u;
  const v = Math.floor(latRem3 * 10.0);
  const w = Math.floor(lngRem3 * 10.0);

  // 各桁の数値を結合して10桁の文字列として返す
  return `${p}${q}${r}${s}${t}${u}${v}${w}`;
}

// === 動作テスト ===
// ご提示いただいたサンプルの2つ目のメッシュ（5030000001）の左下の座標
const testLat = 33.33333333;
const testLng = 130.00125;

const meshCode = get100mMeshCode(testLat, testLng);
console.log(meshCode); // 出力: "5030000001"
