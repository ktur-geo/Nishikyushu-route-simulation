// アプリのエントリポイント
import { initMap, getMap } from './map.js';
import {endTutorial,initPoints, getPoints,bindAddByClick, drawRoute, getPointsLatlngs, drawinitRoute, drawInitStations ,updateIgnoredSections,getDefaultRoutePoints} from './points.js';
import { loadPopulationMesh, getMeshdata,getPopulationWithinRadius } from './population.js';
import { bindUIEvents, updateSummary, initToggleButtons, initHeaderActions, invalidateAnalysis, showToast } from './ui.js';
import { updateStationList } from './station-list.js';
import { loadFromQuery } from './share-url.js';
import { showPopulationCoverage } from './show-population.js';
import { preloadLandUseData } from './landuse.js';
import { initDataMode } from './data-mode.js';
let defaultPoints = getDefaultRoutePoints()
async function boot(){
  document.body.classList.add("mode-tutorial");
  // 1. 地図初期化
  initMap();

  // トグルボタンのイベントをバインド
  initToggleButtons()


  const { nishikyushuCompetedRoute, kyushuCompetedRoute, getInitStations } = await import('./points.js');
  if (nishikyushuCompetedRoute.length < 2 || kyushuCompetedRoute.length < 2 || !getInitStations().length) {
    throw new Error('既存線のデータを読み込めませんでした。');
  }
  // 2. 人口メッシュを読む（/data/population-mesh.json を想定）
  await loadPopulationMesh(new URL('../data/population-mesh.json', import.meta.url));

// ==========================================
  // 2. 37MBの土地利用データを裏側で読み込み開始
  // 【重要】await を付けない！ 
  // これにより、読み込みの完了を待たずにすぐ下の処理（画面の描画）へ進む
  // ==========================================
  preloadLandUseData();

  const loaded = loadFromQuery();
  if (loaded && loaded.points) {
    defaultPoints = loaded.points;
    endTutorial()
  }
  console.log(defaultPoints)
  if (loaded.error) showToast(loaded.error, 6500);
  initPoints(defaultPoints)
  if (loaded.mapState) getMap().setView(loaded.mapState.center, loaded.mapState.zoom);
  bindAddByClick();  // 初回、または「駅を追加」後の1クリックだけ駅を追加する処理
  drawRoute();//ルートを書く処理
  drawinitRoute();//既存ルートを書く処理
  updateIgnoredSections()//既存ルートのうち、西九州に関係ない個所をグレーにする処理
  drawInitStations();//既存駅を書く処理
  bindUIEvents();//メイン画面のボタンを機能させる処理
  initHeaderActions();//ヘッダーのボタンを機能させる処理
  initDataMode(); // 背景地図切替＋人口・土地利用・標高・観光地の閲覧モード
  document.getElementById("edit-toggle").addEventListener("click",()=>{ updateStationList() })//駅名編集ボタンを押した処理

  // 4. 地図の station 更新イベントをハンドル
  const map = getMap();
  map.on("points:updated", () => { invalidateAnalysis(); updateSummary(); updateStationList(); });
  updateSummary();

  map.on('points:updated', async () => {
    // ルート描画更新
    drawRoute();
  });
  console.log(getPoints())
  updateStationList()
  //showPopulationCoverage(getMeshdata(),map) //人口メッシュの位置を呼び出す関数(デバック用)
  // フロントから手動で更新したいときは map.fire('points:updated') を呼べば更新される
}

boot().catch(error => {
  console.error(error);
  const panel = document.createElement('div'); panel.className = 'boot-error'; panel.setAttribute('role', 'alert');
  const message = document.createElement('p'); message.textContent = 'データの読み込みに失敗しました。通信環境を確認して再試行してください。';
  const retry = document.createElement('button'); retry.textContent = '再読み込み'; retry.onclick = () => location.reload();
  panel.append(message, retry); document.body.appendChild(panel);
});
