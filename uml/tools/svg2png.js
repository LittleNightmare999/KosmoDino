// SVG → PNG через Edge с подключённым шрифтом DejaVu Sans (те же метрики, что у Graphviz в контейнере)
// node svg2png.js <каталог_svg> <каталог_png> [масштаб]
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const [, , inDir, outDir, scaleArg] = process.argv
const scale = Number(scaleArg || 2)
const fontDir = path.join(__dirname, 'fonts').replace(/\\/g, '/')
const css = `
@font-face{font-family:'DejaVu Sans';src:url('file:///${fontDir}/DejaVuSans.ttf');}
@font-face{font-family:'DejaVu Sans';font-weight:bold;src:url('file:///${fontDir}/DejaVuSans-Bold.ttf');}
@font-face{font-family:'DejaVu Sans';font-style:italic;src:url('file:///${fontDir}/DejaVuSans-Oblique.ttf');}
html,body{margin:0;padding:0;background:#fff} svg{display:block}`

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    userDataDir: path.join(__dirname, 'edge-profile'),
    args: ['--disable-gpu', '--no-first-run', '--allow-file-access-from-files'],
  })
  const page = await browser.newPage()
  for (const f of fs.readdirSync(inDir).filter((x) => x.endsWith('.svg'))) {
    let svg = fs.readFileSync(path.join(inDir, f), 'utf8')
    svg = svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '')
    // картинки из /data/src (актёры) встраиваются как data URI
    svg = svg.replace(/(xlink:href|href)="\/data\/src\/([^"]+\.svg)"/g, (m, attr, name) => {
      const file = path.join(process.env.UML_SRC || '', name)
      const b64 = Buffer.from(fs.readFileSync(file)).toString('base64')
      return `${attr}="data:image/svg+xml;base64,${b64}"`
    })
    // узлы с классом actor: над подписью рисуется фигурка актёра UML
    svg = svg.replace(/(<g id="[^"]*" class="node actor">[\s\S]*?)(<text[^>]*x="([\d.-]+)" y="([\d.-]+)"[^>]*>)/g, (m, head, textTag, xs, ys) => {
      const x = Number(xs)
      const y = Number(ys) - 50
      const fig = `<g transform="translate(${x - 16},${y})" fill="#FFFFFF" stroke="#222222" stroke-width="1.6" stroke-linecap="round">` +
        `<circle cx="16" cy="8" r="7"/><line x1="16" y1="15" x2="16" y2="34"/><line x1="3" y1="21" x2="29" y2="21"/>` +
        `<line x1="16" y1="34" x2="5" y2="51"/><line x1="16" y1="34" x2="27" y2="51"/></g>`
      return head + fig + textTag
    })
    const w = Number((svg.match(/<svg[^>]*\swidth="([\d.]+)pt"/) || [])[1] || 800) * 4 / 3
    const h = Number((svg.match(/<svg[^>]*\sheight="([\d.]+)pt"/) || [])[1] || 600) * 4 / 3
    const tmp = path.join(__dirname, '_page.html')
    fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg}</body></html>`)
    await page.setViewport({ width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: scale })
    await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const el = await page.$('svg')
    await el.screenshot({ path: path.join(outDir, f.replace(/\.svg$/, '.png')) })
    console.log('png', f)
  }
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
