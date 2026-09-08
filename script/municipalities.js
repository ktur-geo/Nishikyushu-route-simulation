let dataPromise;
export function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if ((yi>lat)!==(yj>lat) && lng < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
export function findMunicipality(features, lat, lng) {
  for (const feature of features) {
    const [west,south,east,north]=feature.bbox;
    if(lng<west||lng>east||lat<south||lat>north) continue;
    for(const polygon of feature.geometry.coordinates) {
      if(pointInRing(lng,lat,polygon[0]) && !polygon.slice(1).some(ring=>pointInRing(lng,lat,ring))) return feature.properties;
    }
  }
  return null;
}
export async function getMunicipality(lat,lng) {
  if(!dataPromise) dataPromise=fetch(new URL('../data/municipalities.json',import.meta.url), {
    signal: AbortSignal.timeout(20000)
  }).then(response=>{
    if(!response.ok) throw new Error('市区町村データの取得に失敗しました。');
    return response.json();
  }).catch(error=>{dataPromise=null;throw error;});
  const data=await dataPromise;
  return findMunicipality(data.features,lat,lng);
}
