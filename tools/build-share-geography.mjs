// 共有画像の概略背景を一度生成し、利用時の外部タイル通信を不要にする。
import { readFile, writeFile } from 'node:fs/promises';
const source = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`背景データの取得失敗: ${response.status}`);
const world = await response.json();
const bounds = [128, 30, 133, 35];
function bbox(ring) {
  return ring.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)], [Infinity,Infinity,-Infinity,-Infinity]);
}
function overlaps(b) { return b[0]<=bounds[2] && b[2]>=bounds[0] && b[1]<=bounds[3] && b[3]>=bounds[1]; }
function simplify(ring) {
  const keep = new Set([0,ring.length-1]), stack=[[0,ring.length-1]];
  while(stack.length) {
    const [a,b]=stack.pop(), [ax,ay]=ring[a], [bx,by]=ring[b]; let far=-1, max=0.0004**2;
    for(let i=a+1;i<b;i++) {
      const [x,y]=ring[i],dx=bx-ax,dy=by-ay;
      const t=dx||dy?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy))):0;
      const d=(x-ax-t*dx)**2+(y-ay-t*dy)**2;
      if(d>max){max=d;far=i;}
    }
    if(far>=0){keep.add(far);stack.push([a,far],[far,b]);}
  }
  const result=[...keep].sort((a,b)=>a-b).map(i=>ring[i].map(v=>Number(v.toFixed(5))));
  return result.length>=4?result:[];
}
const land=[];
for(const feature of world.features) {
  // 日本の陸地は行政区域で描く。粗い海岸線を下に残すと湾が埋まるため除外する。
  if(feature.properties.ADM0_A3==='JPN') continue;
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  for(const polygon of polygons) if(overlaps(bbox(polygon[0]))) {
    const rings=polygon.map(simplify).filter(ring=>ring.length>=4);
    if(rings.length)land.push(rings);
  }
}
// 同梱の市区町村（福岡・佐賀・長崎・熊本）以外も海にしないよう、
// 描画範囲と交わる周辺県の陸地を同じ2020年の行政区域データから補う。
const prefectures=['32','34','35','38','39','44','45','46'];
const prefectureSource='https://raw.githubusercontent.com/niiyz/JapanCityGeoJson/master/geojson/prefectures/';
for(let i=0;i<prefectures.length;i+=3) {
  const collections=await Promise.all(prefectures.slice(i,i+3).map(async code=>{
    const response=await fetch(`${prefectureSource}${code}.json`,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`周辺県データの取得失敗: ${code} ${response.status}`);
    return response.json();
  }));
  for(const collection of collections)for(const feature of collection.features) {
    // 配布元は独立した外周をMultiPolygon.coordinates[0]へまとめている。
    for(const ring of feature.geometry.coordinates.flat())if(overlaps(bbox(ring))) {
      const simplified=simplify(ring);
      if(simplified.length>=4)land.push([simplified]);
    }
  }
}
const municipalities=JSON.parse(await readFile(new URL('../data/municipalities.json',import.meta.url),'utf8'));
const boundaries=municipalities.features.map(feature=>({bbox:feature.bbox,rings:feature.geometry.coordinates.flat().map(simplify).filter(ring=>ring.length>=4)}));
await writeFile(new URL('../data/share-geography.json',import.meta.url),JSON.stringify({
  bounds,land,boundaries,
  sources:[{name:'Natural Earth 1:10m Admin 0 Countries',url:source,license:'Public domain'},
    {name:'国土交通省 国土数値情報 行政区域（2020年）',url:'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html'},
    {name:'JapanCityGeoJson 周辺県の行政区域',url:prefectureSource,prefectures}],
  note:'共有用の概略背景。日本の陸地は行政区域、国外の陸地のみNatural Earth。boundariesは市区町村の陸地と境界の両方に使用。約40mの許容差で簡略化。測量・境界確定には使用しない。'
}));
console.log('共有用背景を生成しました。');
