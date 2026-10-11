// Render the captions and title cards as transparent PNGs (same fonts as the game).
//   node overlays.js <outDir>
const fs = require('fs');
const path = require('path');
const { loadPlaywright } = require('./lib');
const edit = require('./edit.json');

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=ZCOOL+XiaoWei&display=block');
  html, body { margin: 0; background: transparent; }
  body { font-family: "Quicksand", sans-serif; color: #fff; }
  .zh { font-family: "ZCOOL XiaoWei", serif; }
  .glow { text-shadow: 0 2px 22px rgba(40, 28, 70, 0.6), 0 0 3px rgba(40, 28, 70, 0.5); }
  #o { display: inline-block; padding: 70px; }
  /* landscape lower-third */
  .cap { padding: 16px 44px 18px; border-radius: 999px; text-align: center;
         background: radial-gradient(ellipse at center, rgba(34, 26, 58, 0.46), rgba(34, 26, 58, 0.30) 70%, rgba(34, 26, 58, 0.0));
         box-shadow: 0 0 60px 10px rgba(34, 26, 58, 0.18); }
  .cap .a { font-size: 46px; letter-spacing: 0.08em; line-height: 1.25; }
  .cap .b { font-size: 23px; font-weight: 600; opacity: 0.88; margin-top: 4px; letter-spacing: 0.02em; }
  /* end card */
  .end { width: 1500px; text-align: center; padding: 40px 0; }
  .end .t { font-size: 150px; letter-spacing: 0.16em; line-height: 1.1; text-shadow: 0 4px 40px rgba(255, 200, 130, 0.65), 0 2px 6px rgba(40, 28, 70, 0.5); }
  .end .s { font-size: 40px; font-weight: 600; letter-spacing: 0.45em; margin-top: 6px; }
  .end .line { width: 120px; height: 2px; margin: 34px auto 30px; background: linear-gradient(90deg, transparent, rgba(255, 226, 160, 0.9), transparent); }
  .end .d { font-size: 40px; color: #ffe2ea; letter-spacing: 0.06em; }
  .end .f { font-size: 27px; margin-top: 18px; opacity: 0.85; letter-spacing: 0.06em; }
  /* vertical header + captions */
  .vh { width: 1080px; text-align: center; padding: 10px 0 20px; }
  .vh .t { font-size: 138px; letter-spacing: 0.16em; line-height: 1.1; text-shadow: 0 4px 36px rgba(255, 200, 130, 0.6), 0 2px 6px rgba(40, 28, 70, 0.5); }
  .vh .s { font-size: 38px; font-weight: 600; letter-spacing: 0.45em; margin-top: 4px; }
  .vh .tag { display: inline-block; margin-top: 30px; padding: 12px 30px; border-radius: 999px; font-size: 34px;
             background: rgba(255, 252, 246, 0.16); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.45); letter-spacing: 0.04em; }
  .vc { width: 1080px; text-align: center; padding: 10px 0; }
  .vc .a { font-size: 58px; letter-spacing: 0.06em; line-height: 1.3; }
  .vc .b { font-size: 30px; font-weight: 600; opacity: 0.85; margin-top: 8px; }
  .ve { width: 1080px; text-align: center; padding: 10px 0; }
  .ve .d { font-size: 44px; color: #ffe2ea; letter-spacing: 0.04em; line-height: 1.45; }
  .ve .f { font-size: 30px; margin-top: 16px; opacity: 0.85; letter-spacing: 0.04em; line-height: 1.5; }
`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  async function render(name, html) {
    await page.setContent(`<style>${CSS}</style><div id="o">${html}</div>`);
    await page.evaluate(async () => {
      await document.fonts.load('40px "ZCOOL XiaoWei"', document.body.innerText);
      await document.fonts.load('600 20px "Quicksand"', document.body.innerText);
      await document.fonts.ready;
    });
    await page.locator('#o').screenshot({ path: path.join(out, name + '.png'), omitBackground: true });
  }
  for (const s of edit.shots) {
    if (!s.cap) continue;
    await render('cap-' + s.id, `<div class="cap glow"><div class="a zh">${esc(s.cap[0])}</div><div class="b">${esc(s.cap[1])}</div></div>`);
    await render('vcap-' + s.id, `<div class="vc glow"><div class="a zh">${esc(s.cap[0])}</div><div class="b">${esc(s.cap[1])}</div></div>`);
  }
  const [t, sub, ded, foot] = edit.endCard;
  await render('end', `<div class="end glow"><div class="t zh">${esc(t)}</div><div class="s">${esc(sub)}</div><div class="line"></div><div class="d zh">${esc(ded)}</div><div class="f zh">${esc(foot)}</div></div>`);
  const v = edit.vertical;
  await render('vhead', `<div class="vh glow"><div class="t zh">${esc(v.title)}</div><div class="s">${esc(v.subtitle)}</div><div class="tag zh">${esc(v.tag)}</div></div>`);
  await render('vend', `<div class="ve glow"><div class="d zh">${esc(ded).replace('，', '，<br>')}</div><div class="f zh">${esc(foot).replace(' · ', '<br>')}</div></div>`);
  console.log('overlays written to', out, fs.readdirSync(out).join(' '));
  await browser.close();
})();
