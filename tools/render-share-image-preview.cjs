// node tools/render-share-image-preview.cjs <出力先> <Chart.js 4.5.1のUMDファイル>
// 描画確認用の固定指標を使う。製品の算定処理には関与しない。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]);
const Chart=require(path.resolve(process.argv[3]));
class PreviewChart extends Chart {constructor(canvas,config){super(canvas,{...config,platform:Chart.BasicPlatform});}}
const canvases=[],elements=new Map();
function makeCanvas(width=1200,height=675){
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),texts=[];
  const fillText=ctx.fillText.bind(ctx);
  ctx.fillText=(text,x,y,...rest)=>{if(canvas.width===1200&&canvas.height===675){const w=ctx.measureText(String(text)).width,left=ctx.textAlign==='right'?x-w:ctx.textAlign==='center'?x-w/2:x;assert(left>=0&&left+w<=1200,`文字の横切れ: ${text}`);assert(y>=0&&y<675,`文字の縦切れ: ${text}`);texts.push(String(text));}fillText(text,x,y,...rest)};
  canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')]));
  canvases.push({canvas,texts});return canvas;
}
global.window={Chart:PreviewChart};global.Chart=PreviewChart;
global.document={createElement:type=>{assert.equal(type,'canvas');return makeCanvas()},getElementById:id=>elements.get(id)||null};
global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
(async()=>{
 const {drawProfileChart}=await import(pathToFileURL(path.join(root,'script/showProfile.js')));
 const {createShareImageFiles}=await import(pathToFileURL(path.join(root,'script/share-images.js')));
 const profile=makeCanvas(500,220);elements.set('profileChart',profile);
 const samples=read('existing-track-terrain-100m.json').routes.nishikyushu.points.slice(0,480).map((p,i)=>({distanceMeters:p.route_distance_m,elevation:p.elevation_m,isStation:[0,160,320,479].includes(i)}));
 const design=samples.map((sample,i)=>i<160?12:i<320?18:25);
 drawProfileChart({canvasId:'profileChart',samples,designHeights:design});
 const source=Chart.getChart(profile),before=JSON.stringify({data:source.config.data,options:source.config.options});
 const points=[{name:'武雄温泉',type:'startStation',latlng:{lat:33.196331,lng:130.023065}}, {name:'佐賀',type:'station',latlng:{lat:33.2647,lng:130.2977}}, {name:'新鳥栖',type:'endStation',latlng:{lat:33.369603,lng:130.491657}}];
 const metrics={distanceKm:49.2,totalTime:56,populationTotal:552000,costIndex:98,scores:[69,92,76,50,50],gradientWarning:false,waterFallbackCount:0};
 const metricsBefore=JSON.stringify(metrics);
 const args={points,metrics,routes:{nishikyushu:read('nishikyushu-competed-route.json'),kyushu:read('kyushu-competed-route.json')},existingStations:read('init-stations.json').map(st=>({...st,pass:st.type!=='kyushu'}))};
 const files=await createShareImageFiles(args);
 for(const file of files)fs.writeFileSync(path.join(output,file.name),Buffer.from(await file.arrayBuffer()));
 assert.equal(JSON.stringify(metrics),metricsBefore);
 assert.equal(JSON.stringify({data:source.config.data,options:source.config.options}),before,'画面側のグラフを変更しない');
 const footer='西九州ルートシミュレーション ｜ 非公式・参考値 ｜ 人口2020年・土地利用2021年度';
 for(const item of canvases.filter(item=>item.texts.length)){assert(item.texts.includes(footer));assert(!item.texts.some(text=>/私が描いた|[0-9]+点/.test(text)));}
 const all=canvases.flatMap(item=>item.texts);for(const expected of ['作成した仮想ルート ｜ 全体図','基準ルート＝100','ルート比較指標','各指標は候補ルートを比較するための相対値です。'])assert(all.includes(expected));
 const warned=await createShareImageFiles({...args,metrics:{...metrics,gradientWarning:true,waterFallbackCount:5,nonWaterFallbackCount:10}});
 assert(canvases.some(item=>item.texts.some(text=>text.includes('水域未確認10地点は標高0mで仮置き。'))));
 fs.writeFileSync(path.join(output,'nishikyushu-analysis-warnings.png'),Buffer.from(await warned.find(file=>file.name==='nishikyushu-analysis.png').arrayBuffer()));
 source.destroy();
 console.log('PASS: 3画像1200×675、文字の範囲、共通文言、警告併記、元の指標・縦断データ・画面設定の不変');
})().catch(error=>{console.error(error);process.exitCode=1});
