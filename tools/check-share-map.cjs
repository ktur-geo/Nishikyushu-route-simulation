// 任意の画像出力先を引数に指定。描画確認には @napi-rs/canvas を使用する。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]||'.');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
global.document={createElement:type=>{assert.equal(type,'canvas');const canvas=createCanvas(1200,675);canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')]));return canvas;}};
let requests=0,fail=true;
global.fetch=async url=>{assert.equal(url.protocol,'file:','外部タイル通信がない');requests++;if(fail)throw Error('背景取得失敗の試験');return {ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))};};
// 画面やLeafletのズーム状態を読む処理が残れば失敗させる。
global.window=new Proxy({}, {get(){throw Error('共有地図が画面に依存しています。');}});
(async()=>{
 const {getShareJourney,createShareProjection}=await import(pathToFileURL(path.join(root,'script/share-map-layout.js')));
 const {createRouteMapFile}=await import(pathToFileURL(path.join(root,'script/share-images.js')));
 const routes={nishikyushu:read('nishikyushu-competed-route.json'),kyushu:read('kyushu-competed-route.json')};
 const points=[{name:'武雄温泉',type:'startStation',latlng:{lat:33.196331,lng:130.023065}},
   {name:'佐賀',type:'station',latlng:{lat:33.2647,lng:130.2977}},
   {name:'新鳥栖',type:'endStation',latlng:{lat:33.369603,lng:130.491657}}];
 const stations=read('init-stations.json').map(st=>({...st,pass:st.type!=='kyushu'}));
 const fallback=await createRouteMapFile(points,routes,stations);assert(fallback.size>1000);
 fs.writeFileSync(path.join(output,'route-overview-no-background.png'),Buffer.from(await fallback.arrayBuffer()));
 fail=false;
 for(const [name,route] of [['route-overview',points],['route-overview-tamana',[points[0],{name:'有明海経由',type:'curve',latlng:{lat:32.93,lng:130.28}},{...points[2],name:'新玉名',latlng:{lat:32.942557,lng:130.573518}}]],['route-overview-detour',[points[0],{name:'離島経由の検証駅',type:'station',latlng:{lat:32.7,lng:128.85}},points[2]]]]) {
   const journey=getShareJourney(route,routes),projection=createShareProjection(journey.boundsPoints);
   for(const coordinate of journey.boundsPoints){const p=projection.latLngToContainerPoint(coordinate),f=projection.frame;assert(p.x>=f.left-1e-8&&p.x<=f.right+1e-8&&p.y>=f.top-1e-8&&p.y<=f.bottom+1e-8,'全ルートが安全領域に収まる');}
   assert(journey.existing.every(section=>section.length>1));
   const start=performance.now(),file=await createRouteMapFile(route,routes,stations);
   fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(await file.arrayBuffer()));
   console.log(name+': '+Math.round(performance.now()-start)+' ms');
 }
 assert.equal(requests,2,'背景失敗後に再取得し、成功後は再利用する');
 for(const route of [[points[0].latlng],Array(200).fill(points[0].latlng)]) {
   const p=createShareProjection(route).latLngToContainerPoint(route[0]);assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
 console.log('PASS: 全体表示・既存接続区間・迂回・同一点・画面非依存・外部タイル通信なし・背景失敗と再試行');
})().catch(error=>{console.error(error);process.exitCode=1});
