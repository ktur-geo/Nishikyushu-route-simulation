// populationData: [{lat, lng, population}, ...]
// map: Leafletのインスタンス
export function showPopulationCoverage(populationData, map) {
  // ---- メッシュサイズ（約500m） ----
  const gridSize = 1 / 240; // 約0.0041666度

  // ---- 地図レイヤーグループを用意 ----
  const layerGroup = L.layerGroup().addTo(map);

  // ---- 各人口メッシュを矩形として描画 ----
  populationData.forEach(d => {
    const rect = L.rectangle([
      [d.lat - gridSize / 2, d.lng - gridSize / 2],
      [d.lat + gridSize / 2, d.lng + gridSize / 2]
    ], {
      color: d.population > 0 ? '#ff0000' : '#999', // 人口あり→赤
      weight: 0.5,
      fillColor: '#ff0000',
      fillOpacity: 0.15
    });
    rect.addTo(layerGroup);
  });

  // ---- 全体範囲にズーム ----
  const bounds = L.latLngBounds(populationData.map(d => [d.lat, d.lng]));
  map.fitBounds(bounds);

  // ---- 範囲情報をログ出力（保険用）----
  const lats = populationData.map(d => d.lat);
  const lngs = populationData.map(d => d.lng);
  console.log('人口データ範囲：', {
    minLat: Math.min(...lats).toFixed(4),
    maxLat: Math.max(...lats).toFixed(4),
    minLng: Math.min(...lngs).toFixed(4),
    maxLng: Math.max(...lngs).toFixed(4),
    count: populationData.length
  });

  return layerGroup;
}