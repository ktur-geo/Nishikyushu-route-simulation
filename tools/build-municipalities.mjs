// 国土数値情報（2020年）のGeoJSON変換データから、4県の概略市区町村境界を作る。
// 元データは保存せず、表示・地点判定用に約10mの許容差で簡略化する。
import { writeFile } from 'node:fs/promises';
const source = 'https://raw.githubusercontent.com/niiyz/JapanCityGeoJson/master/geojson';
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
function simplify(ring) {
  if (ring.length <= 4) return ring;
  const keep = new Set([0, ring.length - 1]);
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop(); const [ax, ay] = ring[start], [bx, by] = ring[end];
    let max = 0.00008 ** 2, chosen = -1;
    for (let i = start + 1; i < end; i++) {
      const [x, y] = ring[i], dx = bx-ax, dy = by-ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy))) : 0;
      const d = (x-ax-t*dx)**2 + (y-ay-t*dy)**2;
      if (d > max) { max = d; chosen = i; }
    }
    if (chosen >= 0) { keep.add(chosen); stack.push([start,chosen],[chosen,end]); }
  }
  const result = [...keep].sort((a,b)=>a-b).map(i => ring[i].map(n=>Number(n.toFixed(6))));
  return result.length >= 4 ? result : ring.map(p=>p.map(n=>Number(n.toFixed(6))));
}
const features=[];
for (const pref of ['40','41','42','43']) {
  const files = await json(`https://api.github.com/repos/niiyz/JapanCityGeoJson/contents/geojson/${pref}`);
  const entries=files.filter(f=>/^\d{5}\.json$/.test(f.name));
  for (let i=0;i<entries.length;i+=6) {
    const batch=await Promise.all(entries.slice(i,i+6).map(file=>json(`${source}/${pref}/${file.name}`)));
    for(const data of batch) for(const feature of data.features) {
      const props=feature.properties;
      // 変換元のgeo.Split/mergeFeatureは独立した面の外周を1つの配列へ集約する。
      // 内周として扱わず、それぞれを独立したPolygonへ戻す（離島・分割市域）。
      const polygons=feature.geometry.coordinates.flat().map(ring=>[ring]);
      const simplified=polygons.map(polygon=>polygon.map(simplify));
      const city = (/市$/.test(props.N03_003 || '') ? props.N03_003 : '') + props.N03_004;
      const bbox=[Infinity,Infinity,-Infinity,-Infinity];
      for(const polygon of simplified) for(const ring of polygon) for(const [x,y] of ring) {
        bbox[0]=Math.min(bbox[0],x);bbox[1]=Math.min(bbox[1],y);bbox[2]=Math.max(bbox[2],x);bbox[3]=Math.max(bbox[3],y);
      }
      features.push({type:'Feature',bbox,properties:{code:props.N03_007,prefecture:props.N03_001,city},geometry:{type:'MultiPolygon',coordinates:simplified}});
    }
  }
  console.log(`行政区域 ${pref}: ${entries.length}自治体`);
}
await writeFile(new URL('../data/municipalities.json', import.meta.url), JSON.stringify({
  type:'FeatureCollection',source:'国土交通省 国土数値情報 行政区域データ（2020年）を加工',
  sourceUrl:'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html',
  conversionSource:'https://github.com/niiyz/JapanCityGeoJson',
  note:'福岡・佐賀・長崎・熊本の概略境界。境界付近の精密な判定、測量、権利確認には使用しない。',features
}));
console.log(`市区町村データを保存: ${features.length}件`);
