let landUseDataPromise = null;
export function getLandUseData() {
  if (!landUseDataPromise) {
    landUseDataPromise = fetch(new URL('../data/landuse.json', import.meta.url), {
      signal: AbortSignal.timeout(60000)
    }).then(response => {
      if (!response.ok) throw new Error('土地利用データの取得に失敗しました。再試行してください。');
      return response.json();
    }).then(data => {
      if (!data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length) {
        throw new Error('土地利用データが不正です。');
      }
      return data;
    }).catch(error => { landUseDataPromise = null; throw error; });
  }
  return landUseDataPromise;
}
export function preloadLandUseData() {
  getLandUseData().catch(error => console.warn('土地利用データは分析時に再試行します。', error));
}
