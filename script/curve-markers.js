// 見える点と、指でつかめる範囲を分ける。中心は常にルート座標に合わせる。
export function createCurveIcon(handle = false) {
  return L.divIcon({
    className: `route-curve-marker ${handle ? 'curve-handle' : 'curve'}`,
    html: `<span class="${handle ? 'curve-handle-dot' : 'curve-dot'}" aria-hidden="true"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

export function syncCurvePane(marker, map, isCurve) {
  // 駅を上に置き、広げた透明な領域が駅の操作を奪わないようにする。
  const pane = isCurve ? 'routeCurvePane' : 'markerPane';
  marker.options.pane = pane;
  const element = marker.getElement();
  if (element) map.getPane(pane).appendChild(element);
}

export function bindMarkerDragFeedback(marker) {
  marker.on('dragstart', () => {
    marker.getElement()?.classList.add('is-dragging');
  });
  marker.on('dragend remove', () => marker.getElement()?.classList.remove('is-dragging'));
}
