// ========================================
// 土地利用コードの共通定義
// ========================================
//
// 土地利用コードの名称・表示色・コスト加算値を
// このファイルで一元管理する。
//
// data-mode.js（地図表示）と cost.js（コスト計算）が
// 別々の対応表を持たないことで、コードの解釈違いを防ぐ。

export const LAND_USE_CATEGORIES = Object.freeze({
  "0100": Object.freeze({
    label: "田",
    color: "#d9d36b",
    costAdditionPoint: 5
  }),

  "0200": Object.freeze({
    label: "その他の農用地",
    color: "#b9d87a",
    costAdditionPoint: 5
  }),

  "0500": Object.freeze({
    label: "森林",
    color: "#3e8b57",
    costAdditionPoint: 3
  }),

  "0600": Object.freeze({
    label: "荒地",
    color: "#c9b98f",
    costAdditionPoint: 1
  }),

  "0700": Object.freeze({
    label: "建物用地",
    color: "#e39a78",
    costAdditionPoint: 0
  }),

  "0901": Object.freeze({
    label: "道路",
    color: "#7a7a7a",
    costAdditionPoint: 15
  }),

  "0902": Object.freeze({
    label: "鉄道",
    color: "#444444",
    costAdditionPoint: 20
  }),

  "1000": Object.freeze({
    label: "その他の用地",
    color: "#bca9d9",
    costAdditionPoint: 3
  }),

  "1100": Object.freeze({
    label: "河川地・湖沼",
    color: "#62afd2",
    costAdditionPoint: 340
  }),

  "1400": Object.freeze({
    label: "海浜",
    color: "#efd39a",
    costAdditionPoint: 3
  }),

  "1500": Object.freeze({
    label: "海水域",
    color: "#3d8fc2",
    costAdditionPoint: 340
  }),

  "1600": Object.freeze({
    label: "ゴルフ場",
    color: "#86c978",
    costAdditionPoint: 10
  })
});


// 国土数値情報「土地利用細分メッシュ」の定義表順。
// JavaScriptでは "1000" などが整数インデックスとして先に列挙されるため、
// Object.values(LAND_USE_CATEGORIES) の順序を凡例表示には使用しない。
export const LAND_USE_DISPLAY_ORDER = Object.freeze([
  "0100", // 田
  "0200", // その他の農用地
  "0500", // 森林
  "0600", // 荒地
  "0700", // 建物用地
  "0901", // 道路
  "0902", // 鉄道
  "1000", // その他の用地
  "1100", // 河川地・湖沼
  "1400", // 海浜
  "1500", // 海水域
  "1600"  // ゴルフ場
]);

export function getLandUseCategory(code) {
  return LAND_USE_CATEGORIES[String(code)] ?? null;
}

export function getLandUseLabel(code) {
  return getLandUseCategory(code)?.label ?? String(code);
}

export function getLandUseColor(code) {
  return getLandUseCategory(code)?.color ?? "#999999";
}

export function getLandUseCostAdditionPoint(code) {
  return getLandUseCategory(code)?.costAdditionPoint ?? 0;
}
