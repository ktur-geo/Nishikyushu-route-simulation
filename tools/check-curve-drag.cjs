// NODE_PATHにplaywrightを設定し、検証サーバーURL・ライブラリ保存先・Chart.jsパスを渡す。
// ライブラリはindex.htmlと同じ版のleaflet.js/css・lz-string.min.jsを使用。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const [base, assets, chart] = process.argv.slice(2);
const mobile = process.argv[5] !== 'desktop';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 812 }, hasTouch: mobile });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      const file = url.includes('leaflet.js') ? path.join(assets, 'leaflet.js')
        : url.includes('leaflet.css') ? path.join(assets, 'leaflet.css')
        : url.includes('lz-string') ? path.join(assets, 'lz-string.min.js')
        : url.includes('chart.js') ? chart : null;
      return file ? route.fulfill({ path: file }) : route.abort();
    });
    const page = await context.newPage();
    await page.goto(base + '/index.html');
    await page.waitForFunction(() => !document.getElementById('guide-start-btn').disabled, { }, { timeout: 30000 });
    await page.evaluate(async () => {
      const points = await import('/script/points.js');
      const { getMap } = await import('/script/map.js');
      points.endTutorial();
      points.initPoints([
        { name: '武雄温泉', type: 'startStation', latlng: { lat: 33.196331, lng: 130.023065 } },
        { name: '佐賀', type: 'station', latlng: { lat: 33.2647, lng: 130.2977 } },
        { name: '新鳥栖', type: 'endStation', latlng: { lat: 33.369603, lng: 130.491657 } }
      ]);
      const map = getMap();
      map.fitBounds(points.getPointsLatlngs(), { padding: [60, 170], animate: false });
      window.curveTest = { points, map, updates: 0 };
      map.on('points:updated', () => window.curveTest.updates++);
    });
    if (!mobile) await page.locator('#hide-side-panels-btn').click();
    const cdp = await context.newCDPSession(page);
    const touch = async (type, x, y) => {
      if (mobile) return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      if (type === 'touchEnd') return page.mouse.up();
      await page.mouse.move(x, y);
      if (type === 'touchStart') await page.mouse.down();
    };
    const count = () => page.evaluate(() => window.curveTest.points.getPoints().length);
    const previewCoordinates = () => page.evaluate(() => {
      let route;
      window.curveTest.map.eachLayer(layer => {
        if (layer.updatePreview && layer.getLayers().some(item => item.options?.icon?.options?.className?.includes('curve-handle'))) route = layer;
      });
      return route.getLayers()[0].getLatLngs();
    });
    async function drag(selector, dx, dy, inserted) {
      const element = page.locator(selector).first();
      const box = await element.boundingBox();
      const size = mobile ? 48 : 24;
      assert.equal(box.width, size); assert.equal(box.height, size);
      // 見える四角から外れた場所を指でつかむ。
      const x = box.x + size / 2, y = box.y + size / 2 + (mobile ? 17 : 9);
      assert(await page.evaluate(({x,y}) => !!document.elementFromPoint(x,y)?.closest('.route-curve-marker'), {x,y}));
      const before = await previewCoordinates(), beforeCount = await count();
      const saved = await page.evaluate(() => JSON.stringify(window.curveTest.points.getPointsLatlngs()));
      await page.evaluate(() => window.curveTest.updates = 0);
      await touch('touchStart', x, y);
      for (let i = 1; i <= 5; i++) { await touch('touchMove', x + dx * i / 5, y + dy * i / 5); await page.waitForTimeout(30); }
      await page.waitForFunction(() => !!document.querySelector('.route-curve-marker.is-dragging'), {}, { timeout: 5000 });
      const during = await previewCoordinates();
      assert.notDeepEqual(during, before, '指を離す前からルートが追従する');
      assert.equal(during.length, before.length + (inserted ? 1 : 0));
      assert.equal(await count(), beforeCount);
      assert.equal(await page.evaluate(() => JSON.stringify(window.curveTest.points.getPointsLatlngs())), saved);
      assert.equal(await page.evaluate(() => window.curveTest.updates), 0, 'ドラッグ中は算定結果を更新しない');
      const style = await element.evaluate(el => ({ ring: getComputedStyle(el, '::after').opacity, dot: getComputedStyle(el.firstElementChild).transform }));
      assert.equal(style.ring, '1'); assert.match(style.dot, /1\.4/);
      await page.screenshot({ path: path.join(assets, `${mobile ? 'touch' : 'mouse'}-${inserted ? 'drag-new-point' : 'drag-existing-point'}.png`) });
      await touch('touchEnd');
      await page.waitForFunction(() => window.curveTest.updates > 0, {}, { timeout: 5000 });
      assert.equal(await count(), beforeCount + (inserted ? 1 : 0));
      assert.equal(await page.locator('.is-dragging').count(), 0);
      const final = await page.evaluate(() => window.curveTest.points.getPointsLatlngs());
      final.forEach((point, i) => {
        assert(Math.abs(point.lat - during[i].lat) < 1e-8 && Math.abs(point.lng - during[i].lng) < 1e-8, 'プレビュー位置で確定する');
      });
    }
    await drag('.curve-handle', 20, 45, true);
    await drag('.curve', -15, 35, false);
    async function dragStation(type, dx, dy) {
      const station = page.locator(`.route-station-marker.${type}`).first();
      const dot = station.locator('.station-dot');
      const box = await dot.boundingBox();
      assert.equal(box.width, 15); assert.equal(box.height, 15);
      if (mobile) {
        const hit = await station.boundingBox();
        assert.equal(hit.width, 48); assert.equal(hit.height, 48);
        assert(Math.abs(box.x + box.width / 2 - hit.x - hit.width / 2) < 1);
        assert(Math.abs(box.y + box.height / 2 - hit.y - hit.height / 2) < 1);
      }
      // スマホでは駅の見た目の外側からもドラッグできることを確認。
      const x = box.x + box.width / 2, y = box.y + box.height / 2 + (mobile ? 17 : 0);
      assert(await page.evaluate(({x,y}) => !!document.elementFromPoint(x,y)?.closest('.route-station-marker'), {x,y}));
      const saved = await page.evaluate(() => JSON.stringify(window.curveTest.points.getPointsLatlngs()));
      const before = await previewCoordinates(), beforeCount = await count();
      await page.evaluate(() => window.curveTest.updates = 0);
      await touch('touchStart', x, y);
      for (let i = 1; i <= 5; i++) {
        await touch('touchMove', x + dx * i / 5, y + dy * i / 5);
        await page.waitForTimeout(30);
      }
      const style = await station.evaluate(el => ({ active: el.classList.contains('is-dragging'), ring: getComputedStyle(el, '::after').opacity, dot: getComputedStyle(el.querySelector('.station-dot')).transform }));
      assert(style.active); assert.equal(style.ring, '1'); assert.match(style.dot, /1\.4/);
      const during = await previewCoordinates();
      assert.notDeepEqual(during, before, `${type}のルートがドラッグ中に追従する`);
      assert.equal(await page.evaluate(() => JSON.stringify(window.curveTest.points.getPointsLatlngs())), saved);
      assert.equal(await page.evaluate(() => window.curveTest.updates), 0);
      if (type !== 'station') {
        assert(await page.evaluate(type => {
          const {points} = window.curveTest;
          const point = points.getPoints().find(p => p.type === type);
          const position = point.marker.getLatLng();
          const snapped = points.snapToPolyline(position, type === 'startStation' ? points.nishikyushuCompetedRoute : points.kyushuCompetedRoute);
          return Math.abs(position.lat - snapped.lat) < 1e-8 && Math.abs(position.lng - snapped.lng) < 1e-8;
        }, type), '起終点のプレビューも既存線に沿う');
      }
      await page.screenshot({ path: path.join(assets, `${mobile ? 'touch' : 'mouse'}-drag-${type}.png`) });
      await touch('touchEnd');
      await page.waitForFunction(() => window.curveTest.updates > 0, {}, { timeout: 5000 });
      assert.equal(await count(), beforeCount);
      const final = await page.evaluate(() => window.curveTest.points.getPointsLatlngs());
      final.forEach((point, i) => assert(Math.abs(point.lat - during[i].lat) < 1e-8 && Math.abs(point.lng - during[i].lng) < 1e-8));
      assert.equal(await page.locator('.is-dragging').count(), 0);
      // 起終点は駅名取得後にアイコンが差し替わるので、その完了も待つ。
      await page.waitForFunction(type => {
        const dot = document.querySelector(`.route-station-marker.${type} .station-dot`);
        return dot && getComputedStyle(dot).transform === 'none';
      }, type, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
    }
    await dragStation('station', 20, -40);
    await dragStation('startStation', 30, 40);
    await dragStation('endStation', -25, 45);
    const checks = await page.evaluate(async () => {
      const { points, map } = window.curveTest;
      const point = points.getPoints().find(point => point.type === 'curve');
      const dot = point.marker.getElement().firstElementChild.getBoundingClientRect();
      const projected = map.latLngToContainerPoint(point.latlng), mapBox = map.getContainer().getBoundingClientRect();
      const centered = Math.abs(dot.x + dot.width / 2 - projected.x - mapBox.x) < 1 && Math.abs(dot.y + dot.height / 2 - projected.y - mapBox.y) < 1;
      await points.setPointPassThrough(point.id, false);
      const stationDot = point.marker.getElement().querySelector('.station-dot').getBoundingClientRect();
      const stationCentered = Math.abs(stationDot.x + stationDot.width / 2 - projected.x - mapBox.x) < 1 && Math.abs(stationDot.y + stationDot.height / 2 - projected.y - mapBox.y) < 1;
      const stationPane = point.marker.getElement().parentElement === map.getPane('markerPane');
      await points.setPointPassThrough(point.id, true);
      const curvePane = point.marker.getElement().parentElement === map.getPane('routeCurvePane');
      const station = points.getPoints()[1];
      const otherStation = points.getPoints().find(p => p.type !== 'curve' && p !== station);
      point.marker.setLatLng(otherStation.latlng);
      const center = map.latLngToContainerPoint(otherStation.latlng);
      const target = document.elementFromPoint(center.x + mapBox.x, center.y + mapBox.y);
      const stationWins = !target.closest('.route-curve-marker');
      point.marker.setLatLng(point.latlng);
      points.setRouteReadOnly(true);
      return { centered, stationCentered, stationPane, curvePane, stationWins, readOnly: !point.marker.dragging.enabled() && !document.querySelector('.curve-handle') };
    });
    for (const [name, result] of Object.entries(checks)) assert(result, name);
    console.log(`PASS: ${mobile ? 'タッチ入力・48px判定' : 'マウス入力・24px判定'}、黒点・灰色点・中間駅・起終点の追従と強調、既存線スナップ、確定前の座標保持、中心一致、駅優先、種類変更、読み取り専用`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
