import { findNearestSegment } from './utils.js';

// 画面のパン・ズームに依存せず、実際に接続する既存区間を含める。
export function getShareJourney(points, routes = {}) {
  const newLine = points.map(point => point.latlng);
  function existingSection(route, terminal) {
    if (!route?.length || !terminal) return [];
    const segment = findNearestSegment(route, terminal);
    if (segment.index < 0) return [];
    return [terminal, ...route.slice(segment.index + 1)];
  }
  const nishikyushu = existingSection(routes.nishikyushu, newLine[0]);
  const kyushu = existingSection(routes.kyushu, newLine.at(-1));
  return { newLine, existing: [nishikyushu, kyushu], boundsPoints: [...newLine, ...nishikyushu, ...kyushu] };
}

export function createShareProjection(latlngs, width = 1200, height = 675) {
  const raw = ({ lat, lng }) => ({ x: lng * Math.PI / 180,
    y: -Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360)) });
  const valid = latlngs.filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (!valid.length) throw new Error('共有するルートがありません。');
  const projected = valid.map(raw);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of projected){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  // タイトル・出典と、駅名の余白を確保した描画範囲。
  const frame={left:110,top:145,right:width-190,bottom:height-110};
  const scale=Math.min((frame.right-frame.left)/Math.max(maxX-minX,0.00025), (frame.bottom-frame.top)/Math.max(maxY-minY,0.00025));
  const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
  return {
    frame, scale,
    getSize:()=>({x:width,y:height}),
    latLngToContainerPoint:latlng=>{const p=raw(latlng);return {x:(p.x-centerX)*scale+(frame.left+frame.right)/2,y:(p.y-centerY)*scale+(frame.top+frame.bottom)/2};}
  };
}

let geographyPromise;
export function loadShareGeography() {
  if (!geographyPromise) geographyPromise=fetch(new URL('../data/share-geography.json',import.meta.url),{signal:AbortSignal.timeout(5000)})
    .then(response=>{if(!response.ok)throw new Error('共有用背景を取得できませんでした。');return response.json();})
    .catch(error=>{geographyPromise=null;throw error;});
  return geographyPromise;
}

export function drawShareGeography(ctx, projection, data) {
  const {x:width,y:height}=projection.getSize();
  ctx.fillStyle='#edf1f1';ctx.fillRect(0,0,width,height);
  if(!data) return;
  const project=([lng,lat])=>projection.latLngToContainerPoint({lat,lng});
  const nw=project([data.bounds[0],data.bounds[3]]),se=project([data.bounds[2],data.bounds[1]]);
  ctx.save();ctx.beginPath();ctx.rect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);ctx.clip();
  ctx.fillStyle='#dbeef2';ctx.fillRect(0,0,width,height);
  function trace(rings) {
    ctx.beginPath();
    for(const ring of rings){ring.forEach((coordinate,i)=>{const p=project(coordinate);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();}
  }
  ctx.fillStyle='#f5f4e9';ctx.strokeStyle='#9ebbb8';ctx.lineWidth=1;
  for(const polygon of data.land){trace(polygon);ctx.fill('evenodd');ctx.stroke();}
  // 水色の背景に市区町村の陸地を重ねる。境界と同じ座標で海岸線を揃える。
  // 各ringは独立した外周（島も含む）。隣接する市区町村を先に全て塗る。
  for(const feature of data.boundaries)for(const ring of feature.rings){trace([ring]);ctx.fill();}
  ctx.strokeStyle='rgba(106,133,112,0.24)';ctx.lineWidth=0.65;
  for(const feature of data.boundaries){trace(feature.rings);ctx.stroke();}
  ctx.fillStyle='#6b929c';ctx.font='16px "Yu Gothic", sans-serif';ctx.textAlign='center';
  for(const [lng,lat,name] of [[130.26,32.97,'有明海'],[130.03,33.65,'玄界灘']]) {
    const p=project([lng,lat]);ctx.fillText(name,p.x,p.y);
  }
  ctx.restore();
}
