import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const sourceDir = path.join(root, 'assets', 'source')
const outputDir = path.join(root, 'assets', 'final')

await mkdir(outputDir, { recursive: true })

const toDataUrl = async (filePath, mime) => {
  const data = await readFile(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

const editorialPhotographer = await toDataUrl(path.join(sourceDir, 'mina-editorial-photographer.png'), 'image/png')
const editorialCouple = await toDataUrl(path.join(sourceDir, 'mina-editorial-couple.png'), 'image/png')
const productShowcase = await toDataUrl(path.join(root, '..', '..', 'public', 'landing', 'mina-product-showcase.jpg'), 'image/jpeg')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })

const baseCss = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { color: #1d1d1f; background: #f6f3ed; -webkit-font-smoothing: antialiased; }
  .canvas { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .serif { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.045em; }
  .sans { font-family: Arial, Helvetica, sans-serif; }
  .brand { font: 500 28px/1 Arial, Helvetica, sans-serif; letter-spacing: .42em; }
  .eyebrow { font: 700 19px/1.2 Arial, Helvetica, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
  .url { font: 600 21px/1 Arial, Helvetica, sans-serif; letter-spacing: .02em; }
  .frame { position: absolute; inset: 48px; border: 1px solid rgba(29,29,31,.16); border-radius: 24px; }
  .gold { color: #b8965a; }
  .pill { display: inline-flex; align-items: center; border: 1px solid rgba(29,29,31,.15); border-radius: 999px; padding: 14px 22px; font: 600 18px/1 Arial, sans-serif; }
  .photo { position: absolute; width: 100%; height: 100%; object-fit: cover; }
  .browser { overflow: hidden; border-radius: 22px; box-shadow: 0 28px 80px rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.8); background: white; }
  .browser::before { content: '●  ●  ●'; display: block; height: 38px; padding: 10px 15px; color: #c4c4c7; background: #f7f7f8; font: 12px/1 Arial; letter-spacing: 5px; }
  .browser img { display: block; width: 100%; height: calc(100% - 38px); object-fit: cover; object-position: top center; }
`

const render = async (fileName, width, height, body, extraCss = '') => {
  await page.setViewportSize({ width, height })
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${baseCss}${extraCss}</style></head><body>${body}</body></html>`, { waitUntil: 'load' })
  await page.screenshot({ path: path.join(outputDir, fileName), type: 'png' })
}

await render('mina-profile-1024.png', 1024, 1024, `
  <main class="canvas" style="background:#1d1d1f;color:#f6f3ed;display:grid;place-items:center">
    <div style="width:700px;height:700px;border:1px solid rgba(246,243,237,.18);border-radius:50%;display:grid;place-items:center">
      <div style="text-align:center;transform:translateX(10px)">
        <div class="serif" style="font-size:320px;line-height:.75">M</div>
        <div class="brand" style="margin-top:76px;font-size:32px">MINA</div>
      </div>
    </div>
  </main>
`)

const coverBody = (wide = true) => `
  <main class="canvas" style="background:#f6f3ed">
    <div style="position:absolute;left:${wide ? 155 : 145}px;top:${wide ? 95 : 190}px;width:${wide ? 650 : 680}px;z-index:2">
      <div class="brand">MINA</div>
      <h1 class="serif" style="font-size:${wide ? 70 : 80}px;line-height:.98;margin:${wide ? 52 : 70}px 0 28px">Galerii care îți respectă fotografiile și timpul.</h1>
      <div class="url">cloudbymina.com</div>
    </div>
    <div class="browser" style="position:absolute;right:${wide ? 105 : 85}px;top:${wide ? 74 : 235}px;width:${wide ? 700 : 720}px;height:${wide ? 475 : 490}px;transform:rotate(-1.4deg)"><img src="${productShowcase}"></div>
    <div style="position:absolute;right:-120px;bottom:-240px;width:620px;height:620px;border-radius:50%;background:rgba(184,150,90,.12)"></div>
  </main>
`

await render('mina-facebook-cover-1640x624.png', 1640, 624, coverBody(true))
await render('mina-facebook-cover-1640x923-safe.png', 1640, 923, coverBody(false))

await render('post-01-brand-intro-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:#1d1d1f;color:#f6f3ed;padding:86px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:86px;right:86px;top:330px">
      <div class="eyebrow gold">Galerii foto online</div>
      <h1 class="serif" style="font-size:104px;line-height:.98;margin:40px 0">Fotografiile tale merită o livrare pe măsură.</h1>
    </div>
    <div style="position:absolute;left:86px;right:86px;bottom:88px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(246,243,237,.22);padding-top:34px">
      <span class="url">cloudbymina.com</span><span class="pill" style="border-color:rgba(246,243,237,.25)">Începi gratuit</span>
    </div>
  </main>
`)

await render('post-02-editorial-1080x1350.png', 1080, 1350, `
  <main class="canvas">
    <img class="photo" src="${editorialPhotographer}" style="object-position:center">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,18,16,.46) 0%,rgba(20,18,16,.02) 47%,rgba(20,18,16,.12) 100%)"></div>
    <div style="position:absolute;left:72px;right:72px;top:70px;color:white">
      <div class="brand">MINA</div>
      <h1 class="serif" style="font-size:78px;line-height:.98;margin:52px 0 0;max-width:820px;text-shadow:0 2px 18px rgba(0,0,0,.16)">Galeria ta ar trebui să arate la fel de bine ca fotografiile tale.</h1>
    </div>
    <div class="url" style="position:absolute;right:60px;bottom:55px;color:white">cloudbymina.com</div>
  </main>
`)

await render('post-03-product-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:#f6f3ed;padding:70px">
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="brand">MINA</div><div class="eyebrow gold">Produsul real</div></div>
    <h1 class="serif" style="font-size:78px;line-height:.98;margin:95px 0 60px;max-width:880px">Din Lightroom. În galeria clientului. Fără haos.</h1>
    <div class="browser" style="width:940px;height:625px"><img src="${productShowcase}"></div>
    <div style="position:absolute;left:70px;right:70px;bottom:66px;display:flex;justify-content:space-between;align-items:center"><span class="url">cloudbymina.com</span><span class="pill">Creează prima galerie</span></div>
  </main>
`)

await render('post-04-client-selection-1080x1350.png', 1080, 1350, `
  <main class="canvas">
    <img class="photo" src="${editorialCouple}">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,19,17,.52),rgba(22,19,17,0) 49%,rgba(22,19,17,.46))"></div>
    <div style="position:absolute;left:72px;right:72px;top:70px;color:white">
      <div class="brand">MINA</div>
      <h1 class="serif" style="font-size:76px;line-height:.98;margin:52px 0 0">Clientul alege.<br>Tu primești selecția gata de lucru.</h1>
    </div>
    <div style="position:absolute;left:72px;right:72px;bottom:58px;color:white;display:flex;justify-content:space-between;align-items:center"><span class="url">cloudbymina.com</span><span class="pill" style="border-color:rgba(255,255,255,.45)">Simplu. Clar.</span></div>
  </main>
`)

await render('post-05-one-flow-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:#f6f3ed;padding:74px">
    <div class="brand">MINA</div>
    <h1 class="serif" style="font-size:90px;line-height:.98;margin:122px 0 84px">O galerie.<br>Tot fluxul.</h1>
    <div class="sans" style="font-size:31px;line-height:1.35">
      ${['Livrare profesională','Descărcare simplă','Selecții direct în galerie','Listă gata pentru Lightroom'].map((item, index) => `<div style="display:flex;gap:24px;align-items:center;padding:30px 0;border-top:1px solid rgba(29,29,31,.16)"><span class="gold" style="font-weight:700">0${index + 1}</span><span>${item}</span></div>`).join('')}
    </div>
    <div style="position:absolute;left:74px;right:74px;bottom:70px;display:flex;justify-content:space-between;align-items:center"><span class="url">cloudbymina.com</span><span class="pill">Un singur link</span></div>
  </main>
`)

await render('post-06-free-plan-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:white;padding:74px">
    <div class="brand">MINA</div><div class="frame"></div>
    <div style="position:absolute;left:100px;right:100px;top:285px;text-align:center">
      <div class="eyebrow gold">Planul Gratuit</div>
      <div class="serif" style="font-size:230px;line-height:.9;margin:64px 0 15px">15</div>
      <div class="sans" style="font-size:44px;font-weight:700;letter-spacing:.12em">GB INCLUȘI</div>
      <p class="serif" style="font-size:57px;line-height:1.05;margin:96px auto 0;max-width:760px">Testează MINA pe o galerie reală.</p>
    </div>
    <div style="position:absolute;left:100px;right:100px;bottom:90px;display:flex;justify-content:space-between;align-items:center"><span class="url">cloudbymina.com</span><span class="pill">Fără card</span></div>
  </main>
`)

await render('post-07-founder-offer-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:#1d1d1f;color:#f6f3ed;padding:78px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:78px;right:78px;top:260px">
      <div class="eyebrow gold">Preț Fondator</div>
      <h1 class="serif" style="font-size:92px;line-height:.98;margin:44px 0 82px">Crești acum.<br>Plătești mai puțin.</h1>
      <div style="display:flex;align-items:flex-end;gap:18px"><span class="serif" style="font-size:190px;line-height:.75">29</span><span class="sans" style="font-size:30px;line-height:1.2">lei<br>/ lună</span></div>
      <p class="sans" style="font-size:24px;line-height:1.45;margin-top:52px;max-width:760px;color:#d5d1ca">Planurile plătite pornesc de aici. Oferta Fondator este disponibilă până la 30 septembrie 2026.</p>
    </div>
    <div style="position:absolute;left:78px;right:78px;bottom:75px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(246,243,237,.22);padding-top:35px"><span class="url">cloudbymina.com</span><span class="pill" style="border-color:rgba(246,243,237,.26)">Vezi planurile</span></div>
  </main>
`)

await render('post-08-no-chaos-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:#ece7de;padding:74px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:74px;right:74px;top:285px">
      <div class="sans" style="font-size:30px;color:#7a7772;text-decoration:line-through;line-height:1.9">Drive &nbsp; WhatsApp &nbsp; WeTransfer &nbsp; liste</div>
      <h1 class="serif" style="font-size:108px;line-height:.96;margin:56px 0 52px">Fără haos la livrare.</h1>
      <p class="sans" style="font-size:31px;line-height:1.45;max-width:770px;color:#555257">O experiență clară pentru client și un flux care rămâne sub controlul tău.</p>
    </div>
    <div style="position:absolute;left:74px;right:74px;bottom:72px;display:flex;justify-content:space-between;align-items:center"><span class="url">cloudbymina.com</span><span class="pill">Încearcă gratuit</span></div>
  </main>
`)

await render('post-09-launch-cta-1080x1350.png', 1080, 1350, `
  <main class="canvas" style="background:white;padding:74px">
    <div class="brand">MINA</div><div class="frame"></div>
    <div style="position:absolute;left:104px;right:104px;top:300px;text-align:center">
      <div class="eyebrow gold">MINA este live</div>
      <h1 class="serif" style="font-size:91px;line-height:.98;margin:55px 0 52px">Ai o galerie de livrat săptămâna aceasta?</h1>
      <p class="sans" style="font-size:29px;line-height:1.5;color:#606064;margin:0 auto;max-width:730px">Public-o în MINA. Trimite-o unui client real. Spune-ne ce trebuie să facem mai bine.</p>
    </div>
    <div style="position:absolute;left:104px;right:104px;bottom:112px;text-align:center"><span class="pill" style="padding:22px 34px;background:#1d1d1f;color:white;font-size:22px">Creează prima galerie →</span><div class="url" style="margin-top:34px">cloudbymina.com</div></div>
  </main>
`)

await render('story-01-selection-poll-1080x1920.png', 1080, 1920, `
  <main class="canvas" style="background:#1d1d1f;color:#f6f3ed;padding:78px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:78px;right:78px;top:430px;text-align:center">
      <div class="eyebrow gold">Întrebare pentru fotografi</div>
      <h1 class="serif" style="font-size:105px;line-height:.98;margin:58px 0">Cum primești acum selecția clientului?</h1>
      <div style="height:310px;margin-top:90px;border:2px dashed rgba(246,243,237,.3);border-radius:34px;display:grid;place-items:center"><span class="sans" style="font-size:25px;color:#aaa7a1">Adaugă aici sondajul Instagram</span></div>
    </div>
    <div class="url" style="position:absolute;left:78px;bottom:95px">cloudbymina.com</div>
  </main>
`)

await render('story-02-selection-demo-1080x1920.png', 1080, 1920, `
  <main class="canvas">
    <img class="photo" src="${editorialCouple}" style="object-position:center">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,18,16,.62),rgba(20,18,16,.03) 50%,rgba(20,18,16,.6))"></div>
    <div style="position:absolute;left:72px;right:72px;top:92px;color:white"><div class="brand">MINA</div><h1 class="serif" style="font-size:98px;line-height:.98;margin-top:95px">Clientul selectează direct în galerie.</h1></div>
    <div style="position:absolute;left:72px;right:72px;bottom:115px;color:white"><p class="sans" style="font-size:31px;line-height:1.45;max-width:760px">Tu primești lista gata de lucru. Fără capturi de ecran și mesaje pierdute.</p><div class="url" style="margin-top:42px">cloudbymina.com</div></div>
  </main>
`)

await render('story-03-faq-1080x1920.png', 1080, 1920, `
  <main class="canvas" style="background:#f6f3ed;padding:78px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:78px;right:78px;top:300px">
      <div class="eyebrow gold">FAQ rapid</div>
      <h1 class="serif" style="font-size:96px;line-height:.98;margin:48px 0 90px">Ce poți face în MINA?</h1>
      ${['Protejezi galeria cu parolă','Livrezi pe mobil și laptop','Primești selecția clientului','Începi gratuit cu 15 GB'].map((item, index) => `<div class="sans" style="font-size:31px;line-height:1.35;padding:38px 0;border-top:1px solid rgba(29,29,31,.16);display:flex;gap:25px"><span class="gold" style="font-weight:700">0${index + 1}</span><span>${item}</span></div>`).join('')}
    </div>
    <div class="url" style="position:absolute;left:78px;bottom:105px">cloudbymina.com</div>
  </main>
`)

await render('story-04-founder-1080x1920.png', 1080, 1920, `
  <main class="canvas" style="background:#1d1d1f;color:#f6f3ed;padding:78px">
    <div class="brand">MINA</div>
    <div style="position:absolute;left:78px;right:78px;top:390px;text-align:center">
      <div class="eyebrow gold">Preț Fondator</div>
      <div class="serif" style="font-size:280px;line-height:.82;margin:95px 0 35px">29</div>
      <div class="sans" style="font-size:39px">lei / lună</div>
      <h1 class="serif" style="font-size:74px;line-height:1.02;margin:115px auto 45px;max-width:780px">Disponibil până la 30 septembrie 2026.</h1>
      <p class="sans" style="font-size:28px;color:#c9c5bd">Păstrezi prețul cât timp abonamentul rămâne activ.</p>
    </div>
    <div style="position:absolute;left:78px;right:78px;bottom:110px;text-align:center"><span class="pill" style="padding:22px 34px;border-color:rgba(246,243,237,.35);font-size:22px">Vezi planurile</span><div class="url" style="margin-top:42px">cloudbymina.com</div></div>
  </main>
`)

await browser.close()
console.log(`Generated social assets in ${outputDir}`)
