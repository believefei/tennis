import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:8137/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// libs present?
const libs = await page.evaluate(() => ({
  rough: typeof rough, gsap: typeof gsap,
  d3geo: !!(window.d3 && window.d3.geoConicEqualArea),
  geo: window.CHINA_GEO && window.CHINA_GEO.features.length,
  courts: window.TENNIS_COURTS && Object.keys(window.TENNIS_COURTS).length,
}));
console.log('LIBS', JSON.stringify(libs));

// drive to map page directly via exposed functions (faster than full animation)
await page.evaluate(() => { openGenderPage(); });
await page.waitForTimeout(700);
await page.evaluate(() => { document.querySelector('.gender-option[data-gender="boy"]').click(); });
await page.waitForTimeout(900);
// ratio runs an animation; jump straight to map
await page.evaluate(() => { openMapPage(); });
await page.waitForTimeout(900);

const mapReady = await page.evaluate(() => ({
  active: mapState.active,
  features: mapState.features.length,
  hitPaths: mapState.hitPaths.filter(Boolean).length,
  visible: document.getElementById('map-page').classList.contains('is-active'),
}));
console.log('MAP', JSON.stringify(mapReady));

// programmatically select Shanghai and read copy
const copy = await page.evaluate(async () => {
  selectRegion('上海市');
  await new Promise(r => setTimeout(r, 1200));
  return {
    title: document.getElementById('map-title').textContent,
    body: document.getElementById('map-body').innerText,
    reveal: mapState.reveal,
    copyOpacity: getComputedStyle(document.getElementById('map-copy')).opacity,
  };
});
console.log('COPY', JSON.stringify(copy));

// hit-test: does Shanghai centroid resolve to Shanghai?
const hit = await page.evaluate(() => {
  const idx = mapState.features.findIndex(f => f.properties.name === '上海市');
  const c = mapState.pathGen.centroid(mapState.features[idx]); // px (already CSS px space)
  // mapHitTest expects CSS coords
  return { centroid: c.map(Math.round), hit: mapHitTest(c[0], c[1]) };
});
console.log('HIT', JSON.stringify(hit));

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
