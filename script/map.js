import { addPoint, isRouteReadOnly } from "./points.js";

let mapInstance = null;
let baseLayer = null;
let selectedBaseMap = 'osm';
let effectiveBaseMap = null;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>';

const BASE_MAPS = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      crossOrigin: true,
      attribution: OSM_ATTRIBUTION,
      maxNativeZoom: 19,
      maxZoom: 20
    }
  },
  'gsi-standard': {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    options: {
      crossOrigin: true,
      attribution: GSI_ATTRIBUTION,
      minZoom: 5,
      maxNativeZoom: 18,
      maxZoom: 20
    }
  },
  'gsi-photo': {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    options: {
      crossOrigin: true,
      attribution: GSI_ATTRIBUTION,
      minZoom: 14,
      maxNativeZoom: 18,
      maxZoom: 20
    }
  }
};

function resolveEffectiveBaseMap(key) {
  // 全国最新写真（シームレス）はズーム14〜18。
  // 広域表示で真っ白にならないよう、航空写真選択時もz14未満は
  // 地理院標準地図を一時的に表示する。
  if (key === 'gsi-photo' && mapInstance?.getZoom() < 14) {
    return 'gsi-standard';
  }
  return key;
}

function applyBaseMap() {
  if (!mapInstance) return;

  const nextEffective = resolveEffectiveBaseMap(selectedBaseMap);
  if (baseLayer && effectiveBaseMap === nextEffective) return;

  if (baseLayer) {
    mapInstance.removeLayer(baseLayer);
  }

  const config = BASE_MAPS[nextEffective] || BASE_MAPS.osm;
  baseLayer = L.tileLayer(config.url, config.options).addTo(mapInstance);
  // 背景地図は必ず最背面へ。
  baseLayer.bringToBack?.();
  effectiveBaseMap = nextEffective;

  mapInstance.fire('basemap:changed', {
    selected: selectedBaseMap,
    effective: effectiveBaseMap,
    photoFallback: selectedBaseMap === 'gsi-photo' && effectiveBaseMap !== 'gsi-photo'
  });
}

export function initMap(){
  mapInstance = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 20 }).setView([33.3, 130.3], 10);
  applyBaseMap();

  mapInstance.on('zoomend', () => {
    if (selectedBaseMap === 'gsi-photo') {
      applyBaseMap();
    }
  });

  L.control.zoom({ position: 'bottomleft' }).addTo(mapInstance);
  window.__leafletMap = mapInstance;
  return mapInstance;
}

export function getMap(){
  return mapInstance;
}

export function setBaseMap(key) {
  if (!BASE_MAPS[key]) return getBaseMapState();
  selectedBaseMap = key;
  applyBaseMap();
  return getBaseMapState();
}

export function getBaseMapState() {
  return {
    selected: selectedBaseMap,
    effective: effectiveBaseMap,
    photoFallback: selectedBaseMap === 'gsi-photo' && effectiveBaseMap !== 'gsi-photo'
  };
}

// シンプルな polyline 描画ユーティリティ（グループに追加）
export function drawRouteLayer(latlngs,add=true,color="red"){
  let lineColor1='rgb(230,60,60)'
  let lineColor2='rgba(255,230,230,0.8)'
  if(color=="gray"){
    lineColor1='rgba(168, 168, 168, 1)'
    lineColor2='rgba(221, 221, 221, 0.96)'
  }

  const layer = L.layerGroup();
  
  if(!latlngs || latlngs.length < 2) { layer.addTo(mapInstance); return layer; }
  const poly1 = L.polyline(latlngs, { weight:6, color:'black' });
  const poly2 = L.polyline(latlngs, { color:lineColor1,interactive: false});
  const poly3 = L.polyline(latlngs, { dashArray:'8', color:lineColor2,interactive: false});
  layer.addLayer(poly1); layer.addLayer(poly2); layer.addLayer(poly3);

  for (let i = 0; i < latlngs.length - 1; i++) {
    const midLat = (latlngs[i].lat + latlngs[i + 1].lat) / 2;
    const midLng = (latlngs[i].lng + latlngs[i + 1].lng) / 2;
    const mid = L.latLng(midLat, midLng);
    if(add && !isRouteReadOnly()){
      const handle = L.marker(mid, {
        draggable: true,
        icon: L.divIcon({
          className: "curve-handle",
          iconSize: [8, 8],
        }),
      }).addTo(layer);

      handle.on("dragend", (e) => {
        if (isRouteReadOnly()) { handle.setLatLng(mid); return; }
        const pos = e.target.getLatLng();

        // この黒点は「i番目とi+1番目の間」を表しているため、
        // ドラッグ後の位置が元の線分から遠くても、同じ区間へ確実に挿入する。
        addPoint(pos, {
          type: "curve",
          name: "",
          pan: false,
          insertIndex: i + 1,
        });

        // ルート再描画で旧ハンドルは消えるが、念のため元レイヤーからも外す。
        if (layer.hasLayer(handle)) {
          layer.removeLayer(handle);
        }
      });
    }
  }

  layer.addTo(mapInstance);
  return layer;
}
