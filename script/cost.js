import { haversineDistanceMeters, get100mMeshCode } from "./utils.js";
import { getLandUseData } from "./landuse.js";
import { getPopulationDensityAtPoint } from "./population.js";
import { getLandUseCostAdditionPoint } from "./landuse-categories.js";

// 羽越・奥羽新幹線6県PT資料（2018年度価格）の構造別単価を参考に、
// 路盤 15億円/km = 100 とする。
// したがって、1コスト = 1,500万円/km。
const COST_UNIT_YEN_PER_KM = 15e6;

// 国土交通省「建設工事費デフレーター」の
// その他土木－鉄道軌道（2020年度基準）を使用。
// 2018年度平均 98.1083、2026年4～6月平均 129.0667。
// 月ごとの振れを抑えるため、2026年は公表済み3か月の平均とする。
export const CONSTRUCTION_PRICE_DEFLATOR = Object.freeze({
  basePeriod: '2018年度平均',
  baseIndex: 98.10833333333333,
  currentPeriod: '2026年4～6月平均',
  currentIndex: 129.06666666666666
});

export const CONSTRUCTION_PRICE_FACTOR =
  CONSTRUCTION_PRICE_DEFLATOR.currentIndex
  / CONSTRUCTION_PRICE_DEFLATOR.baseIndex;

function adjust2018ConstructionPrice(yen) {
  return yen * CONSTRUCTION_PRICE_FACTOR;
}

// 構造別の基本コスト
const STRUCTURE_COST_POINT = {
  ground: 100,    // 地上（土構造）
  elevated: 200,  // 高架
  tunnel: 220     // 山岳トンネル
};

// 実際の計算では円/kmに変換して使用
const STRUCTURE_COST = {
  ground:
    adjust2018ConstructionPrice(
      STRUCTURE_COST_POINT.ground
      * COST_UNIT_YEN_PER_KM
    ),

  elevated:
    adjust2018ConstructionPrice(
      STRUCTURE_COST_POINT.elevated
      * COST_UNIT_YEN_PER_KM
    ),

  tunnel:
    adjust2018ConstructionPrice(
      STRUCTURE_COST_POINT.tunnel
      * COST_UNIT_YEN_PER_KM
    )
};


// ========================================
// 土地利用による追加コスト
// ========================================

// 建物用地(0700)は人口密度から別途算定するため0。
// 河川・湖沼、海水域は、このファイル内で連続延長に応じた
// 橋梁相当コストとして別途算定する。
// コードごとの加算値は landuse-categories.js で一元管理する。

const WATER_LAND_USE_CODES = new Set([
  '1100', // 河川地・湖沼
  '1500'  // 海水域
]);

const WATER_BRIDGE_ADDITION_POINT = 340;

const WATER_BRIDGE_ADDITION_COST_YEN_PER_KM =
  adjust2018ConstructionPrice(
    WATER_BRIDGE_ADDITION_POINT
    * COST_UNIT_YEN_PER_KM
  );

/**
 * 連続水域区間の延長に応じた橋梁補正倍率。
 * 各基準点の間は線形補間し、境界でコストが跳ねないようにする。
 */
export function getWaterCrossingCostMultiplier(lengthKm) {
  const length = Math.max(0, Number(lengthKm) || 0);

  if (length <= 0.5) return 1;

  if (length <= 2) {
    return 1
      + (length - 0.5)
      / (2 - 0.5)
      * (1.5 - 1);
  }

  if (length <= 5) {
    return 1.5
      + (length - 2)
      / (5 - 2)
      * (2.5 - 1.5);
  }

  return 2.5;
}


// 用地幅（m）
const LAND_WIDTH_M = 16;


// ========================================
// 共通コスト
// ========================================

// 構造にかかわらず必要となる共通コスト
// 軌道費・電気設備費・電車線・その他
// 18.9億円/km ÷ 15億円/km × 100 = 126
const COMMON_COST_POINT = 126;

const COMMON_COST =
  adjust2018ConstructionPrice(
    COMMON_COST_POINT
    * COST_UNIT_YEN_PER_KM
  );


// ========================================
// 防音壁
// ========================================

// 羽越・奥羽新幹線6県PT資料
// 防音壁費 80百万円/km。
// 「明かり部のみ」のため、トンネル区間には加算しない。
const NOISE_BARRIER_COST_YEN_PER_KM =
  adjust2018ConstructionPrice(80e6);


// ========================================
// 新設駅
// ========================================

// 本アプリでは新設駅を
// 2面2線、6両対応の標準的な駅として扱う。
// 4線駅は考慮しない。

// 羽越・奥羽新幹線6県PT資料
const STATION_VIADUCT_COST_2018_YEN_PER_KM =
  5100e6;

const STATION_PLATFORM_COST_2018_YEN =
  270e6;

const STATION_BUILDING_COST_2018_YEN =
  2290e6;

// 西九州新幹線の6両対応駅を参考に、
// 駅部延長を160mと仮定。
const STATION_SECTION_LENGTH_KM =
  0.16;

// 通常の地上構造費は
// ルート本体ですでに計上されるため、
// 駅部高架橋については
// 地上構造との差額のみ追加する。
const STATION_VIADUCT_ADDITION_YEN =
  adjust2018ConstructionPrice(
    (
      STATION_VIADUCT_COST_2018_YEN_PER_KM
      - STRUCTURE_COST_POINT.ground
        * COST_UNIT_YEN_PER_KM
    )
    * STATION_SECTION_LENGTH_KM
  );

// 1駅あたり
//
// (51 - 15)億円/km × 0.16km
// + 2.7億円
// + 22.9億円
//
// = 31.36億円
const NEW_STATION_COST_YEN =
  STATION_VIADUCT_ADDITION_YEN
  + adjust2018ConstructionPrice(
      STATION_PLATFORM_COST_2018_YEN
    )
  + adjust2018ConstructionPrice(
      STATION_BUILDING_COST_2018_YEN
    );


// ========================================
// 建物・解体・移転等コスト
// ========================================

// 固定資産統計から推定した上物価値に対し、
// 解体、移転などに伴う付随的な負担を
// 簡易的に反映する係数。
// 公共用地補償制度上の補償率そのものではない。
const BUILDING_RELOCATION_FACTOR =
  1.5;


const MIN_POP_DENSITY = 0;
const DEFAULT_POP_DENSITY = 0;


/**
 * データ読み込み時の簡易ハンドラ。
 */
export async function handleCalculateClick() {

  const loadingIndicator =
    document.getElementById(
      "loading-message"
    );

  loadingIndicator.style.display =
    "block";

  loadingIndicator.innerText =
    "データを準備中...";

  // ユーザーがボタンを押したタイミングで、
  // 裏の読み込みが終わっていれば即座に次へ進む。
  //
  // 万が一、まだ土地利用データの読み込み途中だった場合は、
  // 終わるまでここで待つ。
  const landUseData =
    await getLandUseData();

  loadingIndicator.innerText =
    "計算中...";

  // ここで
  // estimateConstructionCostFromSamples
  // 等を実行する想定。

  loadingIndicator.style.display =
    "none";

  return landUseData;
}


/**
 * 人口密度から市街地の
 * 地価単価（円/㎡）を推定する。
 *
 * 公的な地価算定式ではなく、
 * 本アプリ独自の簡易近似式。
 *
 * @param {number} popDensity
 *   人口密度（人/km²）
 *
 * @returns {number}
 *   推定土地価格（円/㎡）
 */
export function estimateUrbanLandPricePerSqm(
  popDensity
) {

  const density =
    Math.max(
      MIN_POP_DENSITY,
      Number(popDensity)
        || DEFAULT_POP_DENSITY
    );

  return (
    30000
    + 5 * density
    + 0.001 * density ** 2
  );
}


/**
 * 人口密度から、
 * 宅地1㎡あたりの上物価値を
 * 簡易推定する。
 *
 * 福岡県29市・佐賀県10市・長崎市の計40市について、
 * 固定資産統計の家屋決定価格と宅地面積を用いて
 * 回帰分析した結果を参考に設定。
 *
 * D = 人口密度（人/km²）
 *
 * 上物価値 B(D)
 * = 5,000 + 0.5D + 0.0001D²
 *
 * 単位：円/㎡
 *
 * @param {number} popDensity
 *   人口密度（人/km²）
 *
 * @returns {number}
 *   上物価値の代理値（円/㎡）
 */
export function estimateBuildingValuePerSqm(
  popDensity
) {

  const density =
    Math.max(
      MIN_POP_DENSITY,
      Number(popDensity)
        || DEFAULT_POP_DENSITY
    );

  return (
    5000
    + 0.5 * density
    + 0.0001 * density ** 2
  );
}


/**
 * 土地利用による追加コストを算定する。
 *
 * 建物用地(0700)
 *   → 土地取得費と
 *      建物・解体・移転等コストを個別に算定
 *
 * それ以外
 *   → 土地利用区分ごとの固定追加コスト
 *
 * @param {string} useCode
 *   土地利用コード
 *
 * @param {{lat:number,lng:number}} sample
 *   セグメント中点等
 *
 * @param {number} distKm
 *   区間距離（km）
 *
 * @returns {number}
 *   土地利用による追加コスト（円）
 */
export function estimateLandCostForSegment(
  useCode,
  sample,
  distKm
) {

  // 水域は連続延長に応じた橋梁相当コストとして、
  // estimateConstructionCostFromSamples() 側で算定する。
  if (WATER_LAND_USE_CODES.has(useCode)) {
    return 0;
  }

  // ========================================
  // 建物用地以外
  // ========================================

  if (useCode !== "0700") {

    const additionalPoint =
      getLandUseCostAdditionPoint(
        useCode
      );

    const rate =
      additionalPoint
      * COST_UNIT_YEN_PER_KM;

    return (
      rate
      * distKm
    );
  }


  // ========================================
  // 建物用地
  // ========================================

  const populationDensity =
    getPopulationDensityAtPoint(
      sample.lat,
      sample.lng
    );


  // ----------------------------------------
  // 1. 土地取得費
  // ----------------------------------------

  const landPricePerSqm =
    estimateUrbanLandPricePerSqm(
      populationDensity
    );

  const landAcquisitionCost =
    landPricePerSqm
    * LAND_WIDTH_M
    * 1000
    * distKm;


  // ----------------------------------------
  // 2. 建物・解体・移転等コスト
  // ----------------------------------------

  const buildingValuePerSqm =
    estimateBuildingValuePerSqm(
      populationDensity
    );

  const buildingRelocationCost =
    buildingValuePerSqm
    * LAND_WIDTH_M
    * 1000
    * BUILDING_RELOCATION_FACTOR
    * distKm;


  // ----------------------------------------
  // 合計
  // ----------------------------------------

  return (
    landAcquisitionCost
    + buildingRelocationCost
  );
}


function getSegmentConstructionMethod(
  index,
  samples,
  designHeights,
  isStation
) {
  if (isStation[index] || isStation[index + 1]) {
    return 'ground';
  }

  const terrainMid =
    (
      (samples[index].elevation ?? 0)
      + (samples[index + 1].elevation ?? 0)
    )
    / 2;

  const designMid =
    (
      designHeights[index]
      + designHeights[index + 1]
    )
    / 2;

  if (designMid < terrainMid) return 'tunnel';
  if (designMid > terrainMid) return 'elevated';
  return 'ground';
}


function buildCostSegments(
  samples,
  designHeights,
  isStation,
  landUseData
) {
  const segments = [];

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const distanceMeters = haversineDistanceMeters(a, b);

    if (!Number.isFinite(distanceMeters)) {
      segments.push(null);
      continue;
    }

    const method = getSegmentConstructionMethod(
      i,
      samples,
      designHeights,
      isStation
    );

    const midSample = {
      lat: (a.lat + b.lat) / 2,
      lng: (a.lng + b.lng) / 2
    };

    const useCode =
      method !== 'tunnel'
        ? landUseData?.[
            get100mMeshCode(
              midSample.lat,
              midSample.lng
            )
          ] || 'unknown'
        : 'unknown';

    segments.push({
      distanceKm: distanceMeters / 1000,
      method,
      midSample,
      useCode,
      isWater:
        method !== 'tunnel'
        && WATER_LAND_USE_CODES.has(useCode),
      waterMultiplier: 1
    });
  }

  return segments;
}


function applyWaterRunMultipliers(segments) {
  const waterRuns = [];
  let index = 0;

  while (index < segments.length) {
    if (!segments[index]?.isWater) {
      index++;
      continue;
    }

    const startIndex = index;
    let lengthKm = 0;

    while (index < segments.length && segments[index]?.isWater) {
      lengthKm += segments[index].distanceKm;
      index++;
    }

    const multiplier =
      getWaterCrossingCostMultiplier(lengthKm);

    for (let i = startIndex; i < index; i++) {
      segments[i].waterMultiplier = multiplier;
    }

    waterRuns.push({
      startIndex,
      endIndex: index - 1,
      lengthKm,
      multiplier
    });
  }

  return waterRuns;
}


/**
 * サンプル点列から
 * 建設費・用地費を概算する。
 *
 * @param {Array<{
 *   lat:number,
 *   lng:number,
 *   elevation:number|null
 * }>} samples
 *
 * @param {Array<number>} designHeights
 *   計画高
 *
 * @param {Array<boolean>} isStation
 *   駅かどうかのフラグ
 *
 * @param {Object} landUseData
 *   100mメッシュコードをキーとした
 *   土地利用状況のJSON
 *
 * @param {number} newStationCount
 *   新設駅数。
 *   既存駅は含めず、
 *   呼び出し元で数えて渡す。
 *
 * @returns {Object}
 *   総合計、建設費、用地費、
 *   防音壁費、駅費、
 *   構造別内訳、土地利用別内訳
 */
export function estimateConstructionCostFromSamples(
  samples,
  designHeights,
  isStation,
  landUseData = {},
  newStationCount = 0
) {

  let totalConstructionCost = 0;
  let totalLandCost = 0;
  let totalNoiseBarrierCost = 0;
  let totalStationCost = 0;
  let totalWaterCrossingCost = 0;

  const byMethod = {
    ground: 0,
    elevated: 0,
    tunnel: 0
  };

  const byLandUse = {};

  const costSegments = buildCostSegments(
    samples,
    designHeights,
    isStation,
    landUseData
  );

  const waterRuns =
    applyWaterRunMultipliers(costSegments);


  // ========================================
  // 各セグメントを計算
  // ========================================

  for (const segment of costSegments) {
    if (!segment) continue;

    const {
      distanceKm: distKm,
      method,
      midSample,
      useCode,
      isWater,
      waterMultiplier
    } = segment;


    // ========================================
    // 2. 建設費
    // ========================================

    // 構造にかかわらず
    // 必要となる共通コスト
    const commonCost =
      COMMON_COST
      * distKm;


    // 地上・高架・山岳トンネルの
    // 構造コスト
    const structureCost =
      STRUCTURE_COST[
        method
      ]
      * distKm;


    // 防音壁費
    //
    // 6県PT資料の
    // 「明かり部のみ」に合わせ、
    // トンネル区間には加算しない。
    const noiseBarrierCost =
      method !== "tunnel"
        ? NOISE_BARRIER_COST_YEN_PER_KM
          * distKm
        : 0;


    totalConstructionCost +=
      commonCost
      + structureCost
      + noiseBarrierCost;


    totalNoiseBarrierCost +=
      noiseBarrierCost;


    // byMethod は
    // 構造費だけを集計する。
    byMethod[
      method
    ] +=
      structureCost;


    // ========================================
    // 3. 土地利用による追加コスト
    // ========================================

    // トンネル区間には
    // 地表土地利用による補正を加えない。
    if (
      method !== "tunnel"
    ) {

      const additionalCost = isWater
        ? WATER_BRIDGE_ADDITION_COST_YEN_PER_KM
          * waterMultiplier
          * distKm
        : estimateLandCostForSegment(
            useCode,
            midSample,
            distKm
          );

      if (isWater) {
        totalConstructionCost += additionalCost;
        totalWaterCrossingCost += additionalCost;
      } else {
        totalLandCost += additionalCost;
      }


      if (
        !byLandUse[
          useCode
        ]
      ) {

        byLandUse[
          useCode
        ] = 0;
      }


      byLandUse[
        useCode
      ] +=
        additionalCost;
    }
  }


  // ========================================
  // 4. 新設駅の追加コスト
  // ========================================

  // newStationCount は呼び出し元で、
  // 「既存駅を除いた新設駅」だけを
  // 数えて渡す想定。
  const safeNewStationCount =
    Math.max(
      0,
      Math.floor(
        Number(
          newStationCount
        )
        || 0
      )
    );


  totalStationCost =
    safeNewStationCount
    * NEW_STATION_COST_YEN;


  totalConstructionCost +=
    totalStationCost;


  // ========================================
  // 結果
  // ========================================

  return {

    totalCost:
      Math.round(
        totalConstructionCost
        + totalLandCost
      ),

    constructionCost:
      Math.round(
        totalConstructionCost
      ),

    landCost:
      Math.round(
        totalLandCost
      ),

    noiseBarrierCost:
      Math.round(
        totalNoiseBarrierCost
      ),

    stationCost:
      Math.round(
        totalStationCost
      ),

    waterCrossingCost:
      Math.round(
        totalWaterCrossingCost
      ),

    newStationCount:
      safeNewStationCount,

    byMethod,

    byLandUse,

    waterRuns
  };
}


/**
 * ルートの総コストを、
 * 基準ルート=100の指数に変換する。
 *
 * 例：
 *
 * 基準ルート
 * 1000億円
 *
 * 対象ルート
 * 1200億円
 *
 * → コスト指数120
 *
 * @param {number} totalCost
 *   対象ルートの内部コスト
 *
 * @param {number} referenceCost
 *   基準ルートの内部コスト
 *
 * @returns {number|null}
 */

 // ========================================
// コスト指数の基準
// ========================================

// 基準ルート：
// 武雄温泉駅－現佐賀駅－新鳥栖駅を直線で結び、
// 現佐賀駅に新幹線駅を1駅設置するルート。
//
// このルートの内部計算コストを100とする。
// 2026年価格補正後の再計算値は約2902.68億円。
// 指数計算には丸める前の内部計算値を使用する。

export const REFERENCE_ROUTE_COST_YEN =
  290_267_879_653;
export function calculateCostIndex(
  totalCost,
  referenceCost = REFERENCE_ROUTE_COST_YEN
) {

  const cost =
    Number(
      totalCost
    );

  const reference =
    Number(
      referenceCost
    );


  if (
    !Number.isFinite(
      cost
    )
    || !Number.isFinite(
      reference
    )
    || reference <= 0
  ) {

    return null;
  }


  return Math.round(
    cost
    / reference
    * 100
  );
}


/**
 * 土地利用データを
 * キャッシュして取得する。
 *
 * getLandUseData() が既にあるため、
 * こちらは薄いラッパーとして使用する。
 */
let landUseDataCache =
  null;


export async function fetchLandUseData() {

  if (
    landUseDataCache
  ) {

    return (
      landUseDataCache
    );
  }


  try {

    landUseDataCache =
      await getLandUseData();

    return (
      landUseDataCache
    );

  } catch (
    error
  ) {

    console.error(
      "データの読み込みに失敗しました",
      error
    );

    return {};
  }
}


/**
 * 駅～駅単位で
 * 縦断線形を生成する。
 *
 * 基本方針
 *
 * 1.
 * 駅間平均勾配が30‰を超える場合
 * → 30‰以内では接続不能なので、
 *   駅同士を直線で結ぶ。
 *
 * 2.
 * 30‰以内で接続可能な場合
 * → まず駅同士を直線で結ぶ。
 * → その後、
 *   30‰制限を守りながら
 *   地表面へ近づける。
 *
 * @param {number[]} heights
 *   各サンプル点の地表標高。
 *   DEM未取得地点は
 *   事前に0mへ変換しておく。
 *
 * @param {boolean[]} isStation
 *   駅位置ならtrue。
 *
 * @param {number[]} distances
 *   始点からの累積距離[m]。
 *
 * @param {number} maxSlope
 *   最大勾配。
 *   0.03 = 30‰
 *
 * @param {number} maxIter
 *   最大反復回数
 *
 * @param {number} tolerance
 *   収束判定値
 *
 * @returns {{
 *   designHeights:number[],
 *   warnings:Array
 * }}
 */
export function generateDesignProfileByStations(
  heights,
  isStation,
  distances,
  maxSlope = 0.03,
  maxIter = 200,
  tolerance = 0.0001
) {

  const n =
    heights.length;


  // ========================================
  // 入力確認
  // ========================================

  if (
    n !== isStation.length
    || n !== distances.length
  ) {

    throw new Error(
      "縦断計算用データの配列長が一致していません。"
    );
  }


  if (
    n === 0
  ) {

    return {
      designHeights: [],
      warnings: []
    };
  }


  const designHeights =
    heights.slice();

  const warnings = [];


  /*
   * 縦断計算の拘束点を作る。
   *
   * 原則は駅。
   * 念のため
   * ルート始点・終点も
   * 必ず拘束点とする。
   */
  const controlIndices =
    [];


  for (
    let i = 0;
    i < n;
    i++
  ) {

    if (
      isStation[i]
    ) {

      controlIndices.push(
        i
      );
    }
  }


  if (
    !controlIndices.includes(
      0
    )
  ) {

    controlIndices.push(
      0
    );
  }


  if (
    !controlIndices.includes(
      n - 1
    )
  ) {

    controlIndices.push(
      n - 1
    );
  }


  controlIndices.sort(
    (a, b) =>
      a - b
  );


  // 重複除去
  const uniqueControlIndices =
    [
      ...new Set(
        controlIndices
      )
    ];


  /*
   * 駅～駅ごとに処理
   */
  for (
    let segmentNo = 0;
    segmentNo
      < uniqueControlIndices.length - 1;
    segmentNo++
  ) {

    const start =
      uniqueControlIndices[
        segmentNo
      ];

    const end =
      uniqueControlIndices[
        segmentNo + 1
      ];


    if (
      end <= start
    ) {

      continue;
    }


    const startDistance =
      distances[
        start
      ];

    const endDistance =
      distances[
        end
      ];

    const totalDistance =
      endDistance
      - startDistance;


    const startHeight =
      heights[
        start
      ];

    const endHeight =
      heights[
        end
      ];


    // ========================================
    // 距離確認
    // ========================================

    if (
      !Number.isFinite(
        totalDistance
      )
      || totalDistance <= 0
    ) {

      warnings.push({
        type:
          "invalid-distance",

        startIndex:
          start,

        endIndex:
          end
      });

      continue;
    }


    // ========================================
    // 駅間平均勾配
    // ========================================

    const stationSlope =
      Math.abs(
        endHeight
        - startHeight
      )
      / totalDistance;


    /*
     * まず駅同士を直線で結ぶ。
     *
     * 30‰以内なら、
     * この線形は必ず成立する。
     *
     * 30‰を超える場合も、
     * 表示用線形として使用する。
     */
    for (
      let i = start;
      i <= end;
      i++
    ) {

      const ratio =
        (
          distances[i]
          - startDistance
        )
        / totalDistance;


      designHeights[i] =
        startHeight
        +
        (
          endHeight
          - startHeight
        )
        * ratio;
    }


    /*
     * ========================================
     * ケース1
     * ========================================
     *
     * 駅そのものの高低差が
     * 30‰を超える。
     *
     * 物理的に
     * 30‰以内では結べないため、
     * 直線のまま終了する。
     */
    if (
      stationSlope
      > maxSlope + 1e-10
    ) {

      warnings.push({

        type:
          "station-slope-exceeded",

        startIndex:
          start,

        endIndex:
          end,

        slopePermille:
          stationSlope
          * 1000,

        distanceMeters:
          totalDistance,

        heightDifference:
          endHeight
          - startHeight
      });


      continue;
    }


    /*
     * ========================================
     * ケース2
     * ========================================
     *
     * 駅間は
     * 30‰以内で接続可能。
     *
     * 成立している直線を初期値として、
     * 地表へ徐々に近づける。
     */
    let converged =
      false;


    for (
      let iter = 0;
      iter < maxIter;
      iter++
    ) {

      let maxChange =
        0;


      /*
       * 1点の高さを更新する関数
       */
      const updatePoint =
        i => {


          // 駅間の端点は固定
          if (
            i <= start
            || i >= end
          ) {

            return;
          }


          const dxLeft =
            distances[i]
            - distances[i - 1];

          const dxRight =
            distances[i + 1]
            - distances[i];


          if (
            !Number.isFinite(
              dxLeft
            )
            || !Number.isFinite(
              dxRight
            )
            || dxLeft <= 0
            || dxRight <= 0
          ) {

            return;
          }


          /*
           * 左側の点から見て
           * 許される高さ
           */
          const leftLower =
            designHeights[i - 1]
            - maxSlope
            * dxLeft;

          const leftUpper =
            designHeights[i - 1]
            + maxSlope
            * dxLeft;


          /*
           * 右側の点から見て
           * 許される高さ
           */
          const rightLower =
            designHeights[i + 1]
            - maxSlope
            * dxRight;

          const rightUpper =
            designHeights[i + 1]
            + maxSlope
            * dxRight;


          /*
           * 左右双方の条件を
           * 満たす範囲
           */
          const lower =
            Math.max(
              leftLower,
              rightLower
            );

          const upper =
            Math.min(
              leftUpper,
              rightUpper
            );


          /*
           * 初期線形が成立しているので、
           * 通常
           * lower <= upper
           * となる。
           *
           * 数値誤差等で逆転した場合は
           * その点は更新しない。
           */
          if (
            lower
            > upper + 1e-9
          ) {

            return;
          }


          /*
           * 地表標高へ
           * できるだけ近づける。
           */
          const target =
            heights[i];


          const newHeight =
            Math.max(
              lower,
              Math.min(
                upper,
                target
              )
            );


          const change =
            Math.abs(
              newHeight
              - designHeights[i]
            );


          designHeights[i] =
            newHeight;


          if (
            change
            > maxChange
          ) {

            maxChange =
              change;
          }
        };


      // ========================================
      // 左 → 右
      // ========================================

      for (
        let i = start + 1;
        i < end;
        i++
      ) {

        updatePoint(
          i
        );
      }


      // ========================================
      // 右 → 左
      // ========================================

      for (
        let i = end - 1;
        i > start;
        i--
      ) {

        updatePoint(
          i
        );
      }


      // ========================================
      // 収束判定
      // ========================================

      if (
        maxChange
        < tolerance
      ) {

        converged =
          true;

        break;
      }
    }


    // ========================================
    // 最終安全確認
    // ========================================

    let valid =
      true;

    let maxFoundSlope =
      0;


    for (
      let i = start;
      i < end;
      i++
    ) {

      const dx =
        distances[i + 1]
        - distances[i];


      if (
        !Number.isFinite(
          dx
        )
        || dx <= 0
      ) {

        valid =
          false;

        break;
      }


      const slope =
        Math.abs(
          designHeights[i + 1]
          - designHeights[i]
        )
        / dx;


      maxFoundSlope =
        Math.max(
          maxFoundSlope,
          slope
        );


      /*
       * 少量の浮動小数点誤差は許容
       */
      if (
        slope
        > maxSlope + 1e-6
      ) {

        valid =
          false;

        break;
      }
    }


    /*
     * 想定外に
     * 30‰を超えた場合は、
     * 必ず成立する駅間直線へ戻す。
     */
    if (
      !valid
    ) {

      for (
        let i = start;
        i <= end;
        i++
      ) {

        const ratio =
          (
            distances[i]
            - startDistance
          )
          / totalDistance;


        designHeights[i] =
          startHeight
          +
          (
            endHeight
            - startHeight
          )
          * ratio;
      }


      warnings.push({

        type:
          "profile-fallback",

        startIndex:
          start,

        endIndex:
          end,

        maxSlopePermille:
          maxFoundSlope
          * 1000
      });
    }


    if (
      !converged
    ) {

      warnings.push({

        type:
          "not-converged",

        startIndex:
          start,

        endIndex:
          end
      });
    }
  }


  // ========================================
  // 結果
  // ========================================

  return {
    designHeights,
    warnings
  };
}
