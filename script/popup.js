import { getElevation } from './elevation.js';
import { getAddress } from './addres.js';
import { getMap,  } from './map.js';
import {
  points,
  stationIcon,
  renamePoint, removePoint, getTerminalRole, isRouteReadOnly,
  setPointPassThrough,
  nishikyushuCompetedRoute,
  kyushuCompetedRoute
} from "./points.js";
import { getPopulationDensityAtPoint, getPopulationWithinRadius } from './population.js';
import { getExistingTrackElevation } from './existing-track-elevation.js';

// 吹き出しを保持する変数（1つだけ表示する想定）
let currentPopup = null;

// 駅マーカーをクリックしたときの処理
export function bindStationPopup(marker/*, stationData 不要でもOK */) {
  const map = getMap();

  marker.on('click', async (e) => {
    // 既存ポップアップを閉じる
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }

    // --- 最新の station オブジェクトを points から取得 ---
    const pointId = marker.pointId;
    const currentStation = points.find(p => p.id === pointId);
    if (!currentStation) {
      console.warn('clicked marker has no matching point in points[]:', pointId);
      return;
    }

    // 吹き出し要素を生成
    const popupEl = document.createElement('div');
    popupEl.className = 'station-popup';

    // 伝播を止めて地図パン/スクロールを防ぐ（既にやっているなら重複してもOK）
    L.DomEvent.disableClickPropagation(popupEl);
    L.DomEvent.disableScrollPropagation(popupEl);

    // --- 描画は currentStation の状態に依存させる ---
    if (currentStation.type === "curve") {
      popupEl.innerHTML = `
        <div class="popup-header">
          <span class="popup-title">通過点</span>
          <button class="popup-close">×</button>
        </div>
        <div class="popup-body">
          <p class="popup-elev">標高：<span class="popup-elev-value">取得中...</span></p>
           <p>市区町村（概略）：<span class="popup-addr-value">取得中...</span></p>
          <p>座標：${currentStation.latlng.lat.toFixed(5)}, ${currentStation.latlng.lng.toFixed(5)}</p>
        </div>
        <div class="popup-footer">
          <button class="btn-rename">駅名変更</button>
          <button class="btn-switch">駅に変更</button>
          <button class="btn-delete">削除</button>
        </div>
      `;
    } else {
      popupEl.innerHTML = `
        <div class="popup-header">
          <span class="popup-title"></span>
          <button class="popup-close">×</button>
        </div>
        <div class="popup-body">
          <p>周辺人口密度（半径1km）：${getPopulationDensityAtPoint(currentStation.latlng.lat,currentStation.latlng.lng, 1).toFixed(1)}人/km2</p>
          <p>周辺人口（5km）：${getPopulationWithinRadius(currentStation.latlng.lat,currentStation.latlng.lng, 5).totalPopulation}人</p>
          <p class="popup-elev">標高：<span class="popup-elev-value">取得中...</span></p>
           <p>市区町村（概略）：<span class="popup-addr-value">取得中...</span></p>
          <p>座標：${currentStation.latlng.lat.toFixed(5)}, ${currentStation.latlng.lng.toFixed(5)}</p>
        </div>
        <div class="popup-footer">
          <button class="btn-rename">駅名変更</button>
          <button class="btn-switch">通過点に変更</button>
          <button class="btn-delete">削除</button>
        </div>
      `;
    }

    popupEl.querySelector('.popup-title').textContent = currentStation.type === 'curve' ? '通過点' : currentStation.name;
    popupEl.querySelector('.btn-delete').disabled = !!getTerminalRole(currentStation) || isRouteReadOnly();
    if (getTerminalRole(currentStation)) popupEl.querySelector('.btn-delete').title = '起点・終点は削除できません。ドラッグで接続位置を変更できます。';
    popupEl.querySelector('.btn-rename').disabled = isRouteReadOnly();
    popupEl.querySelector('.btn-switch').disabled = isRouteReadOnly();
    // 閉じる
    popupEl.querySelector('.popup-close').addEventListener('click', () => {
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
    });

// 切替ボタン（駅⇄通過点）
popupEl
  .querySelector('.btn-switch')
  .addEventListener(
    'click',
    async () => {

      // 最新の状態を取得
      const target =
        points.find(
          p => p.id === pointId
        );

      if (!target) {
        return;
      }


      /*
       * 現在がcurveなら駅へ戻す。
       * それ以外なら通過点へ変更。
       *
       * 起終点の場合は
       * terminalRole が残っているため、
       * setPointPassThrough() 内で
       * startStation / endStation に
       * 正しく復元される。
       */
      const isPassThrough =
        target.type !== "curve";


      await setPointPassThrough(
        pointId,
        isPassThrough
      );


      // ポップアップを閉じる
      if (currentPopup) {

        currentPopup.remove();
        currentPopup = null;
      }


      // 新しい状態で再描画
      marker.fire(
        'click',
        {
          latlng:
            marker.getLatLng()
        }
      );
    }
  );

    // 削除ボタン（確認ダイアログ例）
    popupEl.querySelector('.btn-delete').addEventListener('click', () => {
      if (!confirm('本当にこの点を削除しますか？')) return;
      if (!removePoint(pointId)) return;
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
      // route再描画等必要ならここで呼ぶ

    });

    // （駅名変更ボタンの処理は既存の入力ボックス方式に接続してください）
    popupEl.querySelector('.btn-rename').addEventListener('click', async () => {
      // 例：簡易 prompt を使う（お好みで入力モーダルに差し替え）
      const newName = prompt('駅名を入力してください', currentStation.name || '');
      if (newName === null) return;
      if (!renamePoint(pointId, newName)) return;
      // 再描画
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
      marker.fire('click', { latlng: marker.getLatLng() });
    });

    // 吹き出しを地図上に追加
    currentPopup = L.DomUtil.create('div', 'leaflet-popup-container', map.getPanes().popupPane);
    currentPopup.appendChild(popupEl);

    // 座標（イベント引数 or marker位置のいずれか）を使ってポップアップ位置を決める
    const latlngForPos = (e && e.latlng) ? e.latlng : marker.getLatLng();
    const pos = map.latLngToLayerPoint(latlngForPos);
    const offsetX = 20; // 必要に応じて微調整
    const offsetY = -60;

    L.DomUtil.setPosition(currentPopup, L.point(pos.x + offsetX, pos.y + offsetY));

    try {
      const terminalRole =
        currentStation.terminalRole
        || (
          currentStation.type === 'startStation'
          || currentStation.type === 'endStation'
            ? currentStation.type
            : null
        );

      let existingTrack = null;

      try {
        if (terminalRole === 'startStation') {
          existingTrack =
            await getExistingTrackElevation({
              latlng: currentStation.latlng,
              route: nishikyushuCompetedRoute,
              profileKey: 'nishikyushu'
            });
        } else if (terminalRole === 'endStation') {
          existingTrack =
            await getExistingTrackElevation({
              latlng: currentStation.latlng,
              route: kyushuCompetedRoute,
              profileKey: 'kyushu'
            });
        }
      } catch (error) {
        console.warn(
          '既存線標高を取得できないためDEMへ切り替えます。',
          error
        );
      }

      const elevation = existingTrack
        ? existingTrack.elevation
        : await getElevation(
            currentStation.latlng.lat,
            currentStation.latlng.lng
          );

      if (existingTrack) {
        const elevationRow =
          popupEl.querySelector('.popup-elev');

        if (elevationRow?.firstChild) {
          elevationRow.firstChild.textContent =
            '線路標高（概算）：';
        }
      }

      const elevText = Number.isFinite(elevation)
        ? `${elevation.toFixed(1)} m`
        : "データなし";

      popupEl
        .querySelector('.popup-elev-value')
        .textContent = elevText;
    } catch (err) {
      popupEl.querySelector('.popup-elev-value').textContent = "取得失敗";
      console.error(err);
    }
     try {
      const addr = await getAddress(currentStation.latlng.lat, currentStation.latlng.lng);
      popupEl.querySelector('.popup-addr-value').textContent = addr;
    } catch {
      popupEl.querySelector('.popup-addr-value').textContent = "取得失敗";
    }
  });
}
