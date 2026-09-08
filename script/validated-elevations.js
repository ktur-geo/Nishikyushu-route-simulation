import { get100mMeshCode } from './utils.js';

// 水域以外の欠測は新線全体で10地点まで0mで仮置きする。
// 元のsamplesは変更せず、実測の0mと欠測を断面図で区別する。
export function prepareElevationHeights(samples, landUseData) {
  let waterFallbackCount = 0;
  let nonWaterFallbackCount = 0;
  const heights = samples.map(sample => {
    if (Number.isFinite(sample.elevation)) return sample.elevation;
    const code = landUseData[get100mMeshCode(sample.lat, sample.lng)];
    if (code === '1100' || code === '1500') {
      waterFallbackCount++;
      return 0;
    }
    nonWaterFallbackCount++;
    return 0;
  });
  if (nonWaterFallbackCount > 10) {
    throw new Error(`水域と確認できない地点の標高が${nonWaterFallbackCount}地点で未取得のため、分析を中止しました。0mでの仮置きは10地点までです。位置または通信環境を確認して再試行してください。`);
  }
  return { heights, waterFallbackCount, nonWaterFallbackCount };
}
