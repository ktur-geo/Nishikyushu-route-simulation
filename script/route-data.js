export const MAX_ROUTE_POINTS = 200;
export const MAX_STATION_NAME_LENGTH = 80;

export function normalizeStationName(value) {
  return String(value ?? '').trim().slice(0, MAX_STATION_NAME_LENGTH) || '新駅';
}

export function isValidCoordinate(value) {
  return value && typeof value.lat === 'number' && typeof value.lng === 'number'
    && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 85 && Math.abs(value.lng) <= 180;
}

export function validateRouteData({ points, mapState = null }) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_ROUTE_POINTS) {
    throw new Error(`ルートの点は2〜${MAX_ROUTE_POINTS}個にしてください。`);
  }
  const types = new Set(['station', 'curve', 'startStation', 'endStation']);
  const orders = new Set();
  const checked = points.map((point, index) => {
    if (!point || !isValidCoordinate(point.latlng) || !types.has(point.type)
      || typeof point.name !== 'string' || point.name.length > MAX_STATION_NAME_LENGTH
      || !Number.isSafeInteger(point.order ?? index) || (point.order ?? index) < 0
      || orders.has(point.order ?? index)) {
      throw new Error('駅名・座標・点の種類または並び順が不正です。');
    }
    orders.add(point.order ?? index);
    return { name: normalizeStationName(point.name), type: point.type,
      order: point.order ?? index, latlng: { ...point.latlng } };
  }).sort((a, b) => a.order - b.order);
  checked.forEach((point, index) => {
    if ((point.type === 'startStation' && index !== 0)
      || (point.type === 'endStation' && index !== checked.length - 1)) {
      throw new Error('起点・終点の位置が不正です。');
    }
    point.id = index + 1;
    point.order = index;
    point.terminalRole = index === 0 ? 'startStation'
      : index === checked.length - 1 ? 'endStation' : null;
  });
  if (mapState !== null && (!isValidCoordinate(mapState.center)
    || !Number.isFinite(mapState.zoom) || mapState.zoom < 5 || mapState.zoom > 20)) {
    throw new Error('保存された地図の表示範囲が不正です。');
  }
  return { points: checked, mapState };
}
