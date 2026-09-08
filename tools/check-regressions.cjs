// node --experimental-vm-modules tools/check-regressions.cjs
// ブラウザー境界を置き換え、製品コードの計算・入力検証を検証する。
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {pathToFileURL,fileURLToPath}=require('node:url');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
async function load(file,names,env={}) {
 const source=read(file).replace(/^import\s+[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gm,'')
  .replace(/^export\s*\{[^}]*\};?/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let|var)/g,'')
  .replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,file)).href));
 return vm.runInNewContext(`(async()=>{${source}\nreturn {${names.join(',')}};})()`,{console,URL,URLSearchParams,AbortSignal,...env},{filename:file});
}
const response=data=>({ok:true,json:async()=>data});
const jsonFetch=async url=>response(JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8')));
(async()=>{
 let count=0;
 for(const dir of ['script','tools','jquery']) for(const name of fs.readdirSync(path.join(root,dir))) {
   if(!/\.(?:js|mjs)$/.test(name))continue;
   new vm.SourceTextModule(read(dir+'/'+name));count++;
 }
 for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.html'))) for(const match of read(name).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
   if(!/\bsrc=/.test(match[1]))new vm.SourceTextModule(match[2]);
 }
 const input=await load('script/route-data.js',['validateRouteData']);
 const points=[
  {name:'武雄温泉',order:0,type:'startStation',latlng:{lat:33.19633114711281,lng:130.0230646133423}},
  {name:'佐賀',order:1,type:'station',latlng:{lat:33.2647,lng:130.2977}},
  {name:'新鳥栖',order:2,type:'endStation',latlng:{lat:33.369602958,lng:130.4916572}}
 ];
 const copy=()=>JSON.parse(JSON.stringify(points));
 assert.equal(input.validateRouteData({points}).points.length,3);
 for(const lat of [null,NaN,Infinity,'33',90]) {const p=copy();p[1].latlng.lat=lat;assert.throws(()=>input.validateRouteData({points:p}));}
 {const p=copy();p[1].order=0;assert.throws(()=>input.validateRouteData({points:p}));}
 assert.throws(()=>input.validateRouteData({points:points.slice(0,1)}));
 {const p=copy();p[1].name='<b>検証</b>';assert.equal(input.validateRouteData({points:p}).points[1].name,'<b>検証</b>');}
 let requests=0;
 const land=await load('script/landuse.js',['getLandUseData'],{fetch:async()=>{requests++;if(requests===1)throw Error('通信失敗');return response({test:'0100'});}});
 await assert.rejects(land.getLandUseData());
 assert.equal((await land.getLandUseData()).test,'0100'); assert.equal(requests,2);
 const utils=await load('script/utils.js',['haversineDistanceMeters','get100mMeshCode','findNearestSegment']);
 const elevation=await load('script/validated-elevations.js',['prepareElevationHeights'],utils);
 const sample={lat:33.1,lng:130.2,elevation:null};const mesh=utils.get100mMeshCode(sample.lat,sample.lng);
 for(const code of ['1100','1500']) {const result=elevation.prepareElevationHeights([sample],{[mesh]:code});assert.equal(result.heights[0],0);assert.equal(result.waterFallbackCount,1);}
 for(const code of ['0700',undefined]) {
   for(const count of [1,10]) {
     const samples=Array.from({length:count},()=>({...sample}));
     const result=elevation.prepareElevationHeights(samples,{[mesh]:code});
     assert.equal(result.nonWaterFallbackCount,count);
     assert.equal(result.waterFallbackCount,0);
     assert(result.heights.every(height=>height===0));
     assert(samples.every(point=>point.elevation===null),'元の欠測を実測0mに書き換えない');
   }
   assert.throws(()=>elevation.prepareElevationHeights(Array(11).fill(sample),{[mesh]:code}),/11地点.*10地点まで/);
 }
 const waterSample={...sample,lat:33.3,lng:130.3};
 const mixedLandUse={[mesh]:'0700',[utils.get100mMeshCode(waterSample.lat,waterSample.lng)]:'1500'};
 const mixed=elevation.prepareElevationHeights([...Array(20).fill(waterSample),...Array(10).fill(sample),{...sample,elevation:-2},{...sample,elevation:0}],mixedLandUse);
 assert.equal(mixed.waterFallbackCount,20);assert.equal(mixed.nonWaterFallbackCount,10);
 assert.equal(mixed.heights.at(-2),-2);assert.equal(mixed.heights.at(-1),0);
 assert.throws(()=>elevation.prepareElevationHeights([...Array(20).fill(waterSample),...Array(11).fill(sample)],mixedLandUse),/11地点/);
 assert.equal(elevation.prepareElevationHeights([{...sample,elevation:25}],{}).heights[0],25);
 const population=await load('script/population.js',['loadPopulationMesh','getPopulationWithinRadius'],{fetch:jsonFetch});
 await population.loadPopulationMesh();
 const initial=JSON.parse(read('data/init-stations.json')).map(s=>({...s,pass:s.type==='nishikyushu'||s.type==='hakata'}));
 const time=await load('script/time.js',['calTotalTime','calEachStationTime','getStationTimetable'],{...utils,getPoints:()=>points,getInitStations:()=>initial,nishikyushuCompetedRoute:JSON.parse(read('data/nishikyushu-competed-route.json')),kyushuCompetedRoute:JSON.parse(read('data/kyushu-competed-route.json'))});
 const tamana=copy();tamana[2].latlng={lat:32.942557,lng:130.573518};
 for(const route of [points,tamana]) {
   const timetable=time.getStationTimetable(route);
   for(let i=1;i<timetable.length;i++)assert(timetable[i].arrivalMinutes>timetable[i-1].arrivalMinutes, '到着時刻が距離順に増加する');
   assert.equal(Math.ceil(timetable.at(-1).arrivalMinutes),time.calTotalTime(route));
   for(let i=0;i<route.length;i++)assert(Math.abs(timetable.find(s=>s.point===route[i]).arrivalMinutes-time.calEachStationTime(route,i))<0.0001);
 }
 const t=time.getStationTimetable(tamana); const tn=t.findIndex(s=>s.point===tamana[2]);
 assert(t[tn+1].arrivalMinutes-t[tn].arrivalMinutes>2, '新玉名→次駅は停車2分と走行時間が必要');
 const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
 const ui=await load('script/ui.js',['calculatePopulationReport','updateSummary'],{...utils,...population,...time,document,getPoints:()=>points,getPointsLatlngs:()=>points.map(p=>p.latlng),getInitStations:()=>initial,getTerminalRole:p=>p.type==='endStation'?'endStation':p.type==='startStation'?'startStation':null,ORIGINAL_TERMINAL_STATIONS:{endStation:points[2].latlng}});
 assert.equal(ui.calculatePopulationReport(),608278);
 points.splice(1,0,{name:'通過点',type:'curve',latlng:{lat:33.22,lng:130.1}});ui.updateSummary();assert.equal(elements.get('stationCount').innerText,3);points.splice(1,1);
 // 標高応答を遅延させ、その間にルートを変更する。旧結果を採用せず再実行可能にする。
 const raceElements=new Map();
 const raceDocument={getElementById:id=>{
   if(!raceElements.has(id))raceElements.set(id,{textContent:'',style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},setAttribute(){},getContext(){return {clearRect(){}}}});
   return raceElements.get(id);
 }};
 let resolveElevation, elevationCalls=0;
 const race=await load('script/ui.js',['generateAnalysisReport','invalidateAnalysis'],{
   ...utils,...population,...time,document:raceDocument,window:{Chart:{getChart:()=>null}},
   console:{...console,error(){}},getPoints:()=>points,getPointsLatlngs:()=>points.map(p=>p.latlng),
   getInitStations:()=>initial,getTerminalRole:p=>p.type,ORIGINAL_TERMINAL_STATIONS:{endStation:points[2].latlng},
   nishikyushuCompetedRoute:[],kyushuCompetedRoute:[],
   getElevationsAlongPolyline:()=>{elevationCalls++;return new Promise(resolve=>{resolveElevation=resolve})}
 });
 for(let attempt=0;attempt<2;attempt++) {
   const pending=race.generateAnalysisReport();assert.equal(elevationCalls,attempt+1);
   points[1].name='変更'+attempt;race.invalidateAnalysis();resolveElevation([]);await pending;
   assert.equal(raceElements.get('report-cost').textContent,'--');
   assert.equal(raceElements.get('route-evaluation-entry').hidden,true);
   assert.equal(raceElements.get('generate-report-btn').disabled,false);
   assert.match(raceElements.get('report-status').textContent,/ルートが変更/);
 }
 points[1].name='佐賀';
 const municipality=await load('script/municipalities.js',['findMunicipality','pointInRing']);
 const features=JSON.parse(read('data/municipalities.json')).features;
 for(const [lat,lng,city] of [[33.2647,130.2977,'佐賀市'],[33.196331,130.023065,'武雄市'],[32.752,129.87,'長崎市'],[33.59,130.42,'福岡市博多区'],[32.789,130.688,'熊本市西区']]) {
   assert.equal(municipality.findMunicipality(features,lat,lng)?.city,city);
 }
 assert.equal(municipality.findMunicipality(features,35.68,139.76),null);
 assert.equal(municipality.findMunicipality(features,33,130.25),null);
 const evaluation=await load('script/route-evaluation.js',['calculateTourismAccessScoreFromData','calculateDevelopmentScoreFromStations'],utils);
 assert.equal(evaluation.calculateTourismAccessScoreFromData([{rank:'S',lat:33.3,lng:130.3}],[{lat:33.3,lng:130.3}]).score,18);
 assert.equal(evaluation.calculateDevelopmentScoreFromStations([points[1]],JSON.parse(read('data/landuse.json'))).score,17);
 console.log(`PASS: 構文${count}ファイル、共有入力、再試行、分析中の編集、水域欠測・水域未確認10地点許容／11地点中止、全駅時刻、人口、駅数、市区町村、既存の採点修正`);
})().catch(error=>{console.error(error);process.exitCode=1;});
