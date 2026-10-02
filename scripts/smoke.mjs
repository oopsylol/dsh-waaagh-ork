/**
 * Smoke test for the built plugin, against a live DSH instance.
 *
 * Everything here was previously run by hand in throwaway scripts, which meant the
 * one thing that actually matters — "does the mascot switch drawings when a turn
 * starts, and does the console stay clean?" — had no regression net. This is that net.
 *
 * It needs a running instance and a browser driver:
 *
 *   DSH_SMOKE_URL='http://127.0.0.1:PORT/?token=...' pnpm run smoke
 *   pnpm run smoke -- --url http://127.0.0.1:PORT/?token=...
 *
 * Playwright is NOT a dependency of this package (it drags browsers along), so the
 * script looks for it where a developer is likely to have it and SKIPS with a clear
 * message and exit code 0 when it cannot find one — CI stays green either way.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const urlIndex = args.indexOf('--url')
const url = (urlIndex >= 0 ? args[urlIndex + 1] : undefined) ?? process.env.DSH_SMOKE_URL

if (!url) {
  console.log('smoke: skipped — set DSH_SMOKE_URL (or pass --url) to run it')
  process.exit(0)
}

/** Candidate places to find playwright, most specific first. */
const CANDIDATES = [
  process.env.DSH_SMOKE_PLAYWRIGHT,
  new URL('../package.json', import.meta.url).pathname,
  'C:/Users/mr.p/package.json'
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0)

function loadPlaywright() {
  for (const candidate of CANDIDATES) {
    try {
      const require = createRequire(candidate.startsWith('file:') ? candidate : pathToFileURL(candidate).href)
      return require('playwright')
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

const playwright = loadPlaywright()
if (playwright === null) {
  console.log('smoke: skipped — playwright not found (pnpm add -D playwright, or set DSH_SMOKE_PLAYWRIGHT)')
  process.exit(0)
}

const failures = []
const check = (ok, label, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` (${detail})`}`)
  if (!ok) failures.push(label)
}

const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(String(error)))

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('[data-composer-card] .waaagh-orc', { timeout: 60000 })
  await page.waitForTimeout(2000)
  // A fresh session can open a "continue where you left off" panel.
  const resume = page.getByRole('button', { name: '继续', exact: true })
  if (await resume.count()) {
    await resume.first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)
  }

  const probe = () =>
    page.evaluate(() => {
      const act = getComputedStyle(document.querySelector('.waaagh-act'))
      const card = getComputedStyle(document.querySelector('[data-composer-card]'))
      const orc = document.querySelector('.waaagh-orc')
      const o = orc.getBoundingClientRect()
      const c = document.querySelector('[data-composer-card]').getBoundingClientRect()
      // Layout geometry, not the painted rect: the mascot is animated (breathe, and a
      // 1.22x "bark" when your message lands), so `getBoundingClientRect()` reports the
      // animated box and a scale of 1.22 looks like an 18% overlap that is not there.
      const parent = orc.offsetParent
      const parentLeft = parent === null ? 0 : parent.getBoundingClientRect().left
      const laidOutRight = parentLeft + orc.offsetLeft + orc.offsetWidth
      return {
        strip: act.animationName,
        size: act.backgroundSize,
        walk: act.animationDuration,
        cardImage: card.backgroundImage,
        cardBorder: card.borderTopWidth,
        clearsCard: Math.round(c.left - laidOutRight),
        detail: `card.left=${Math.round(c.left)} laidOutRight=${Math.round(laidOutRight)} width=${orc.offsetWidth}`
      }
    })

  const idle = await probe()
  check(idle.strip === 'waaagh-blink', 'waiting shows the sitting strip', idle.strip)
  check(idle.size === '100% 300%', 'waiting strip is 3 frames', idle.size)
  check(idle.cardImage === 'none', 'the bubble has no tail image left over', idle.cardImage)
  check(idle.cardBorder === '2px', 'the bubble keeps its ink border', idle.cardBorder)
  check(idle.clearsCard >= 0, 'the mascot stands clear of the bubble', `${idle.clearsCard}px`)

  // The invariant the whole plugin is built around: the draft is never touched.
  const draft = 'waaagh smoke test message'
  await page.evaluate(() => document.querySelector('[data-composer-card] [contenteditable="true"]')?.focus())
  await page.keyboard.type(draft)
  const sent = await page.evaluate(() => {
    const editor = document.querySelector('[data-composer-card] [contenteditable="true"]')
    return editor ? editor.textContent : null
  })
  check(sent !== null && sent.includes(draft), 'the draft is left exactly as typed', sent ?? 'no editor')
  await page.keyboard.press('Enter')
  // Early, while the turn is certainly still running: the title badge and the working
  // strip are both assertions about "mid-turn", and a fast turn can end before a later
  // probe (that is exactly how this check flaked once).
  await page.waitForTimeout(700)
  const titleWhileRunning = await page.evaluate(() => document.title)
  check(titleWhileRunning.startsWith('WAAAGH! · '), 'the title carries the badge while working', titleWhileRunning)

  const work = await probe()
  check(work.strip === 'waaagh-work-frames', 'working shows the keyboard strip', work.strip)
  check(work.size === '100% 800%', 'working strip is 8 frames', work.size)
  // He may borrow up to 10px of the card's own left padding — that is how he stays big on a
  // narrow window — and no more, because the "+" button sits further in than that.
  check(work.clearsCard >= -12, 'the mascot overlaps the card by at most its padding', `${work.clearsCard}px · ${work.detail}`)

  // The shout bubble is up for the whole turn, not only after a click, and it cycles.
  const bubbleText = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('.waaagh-orc'), '::after').content)
  const firstBubble = await bubbleText()
  check(
    typeof firstBubble === 'string' && firstBubble !== 'none' && firstBubble.length > 4,
    'the shout bubble is up while working',
    String(firstBubble)
  )
  await page.waitForTimeout(900)
  const secondBubble = await bubbleText()
  check(secondBubble !== firstBubble && secondBubble !== 'none', 'the bubble cycles while working', `${firstBubble} → ${secondBubble}`)

  await page.waitForTimeout(1200)
  const echoed = await page.evaluate((text) => document.body.innerText.includes(text), draft)
  check(echoed, 'the message reached the transcript unmasked', echoed ? 'found' : 'not found')

  // Clicking him is an easter egg: the bellow appears without touching the composer.
  await page.click('.waaagh-orc', { force: true })
  await page.waitForTimeout(120)
  const clicked = await page.evaluate(() => ({
    cheer: document.documentElement.dataset.waaaghCheer ?? '-',
    draft: document.querySelector('[data-composer-card] [contenteditable="true"]')?.textContent ?? null
  }))
  check(clicked.cheer === 'on', 'clicking the Ork makes him shout', clicked.cheer)
  check(clicked.draft === '', 'clicking him does not type into the draft', JSON.stringify(clicked.draft))

  // The bellow has to be readable at any window size. It hangs above the mascot, and the
  // two offsets that keep it there are measured by `fitMascot`: on a narrow window the
  // mascot stands at the column's left edge, so a bubble anchored to his left edge would
  // be clipped by the column's `overflow:hidden` (the owner saw "gh!!" and nothing else).
  const bellowAt = async (width, height) => {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(400)
    return page.evaluate(() => {
      const orc = document.querySelector('.waaagh-orc')
      const card = document.querySelector('[data-composer-card]')
      const o = orc.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      // The nearest clipping ancestor is the chat column.
      let column = null
      for (let el = orc.parentElement; el !== null && el !== document.body; el = el.parentElement) {
        if (getComputedStyle(el).overflow !== 'visible') { column = el.getBoundingClientRect(); break }
      }
      const left = parseFloat(getComputedStyle(orc).getPropertyValue('--waaagh-bellow-left')) || 0
      const lift = parseFloat(getComputedStyle(orc).getPropertyValue('--waaagh-bellow-lift')) || 0
      return {
        startsAt: Math.round(o.left + left),
        columnLeft: column === null ? null : Math.round(column.left),
        bellowBottom: Math.round(o.top - lift),
        cardTop: Math.round(c.top),
        clearsCardHorizontally: Math.round(c.left - o.left) > 0
      }
    })
  }
  // The mascot has to be whole at every window size: nothing paints over him, and he is
  // not collapsed to the floor by a wrong measurement. Both were real bugs — the width was
  // measured against a 16px wrapper (so he was pinned at the floor AND hung 63px left of
  // it, under the sidebar on a narrow window).
  const orcAt = async (width, height) => {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(400)
    return page.evaluate(() => {
      const orc = document.querySelector('.waaagh-orc')
      const o = orc.getBoundingClientRect()
      let column = null
      for (let el = orc.parentElement; el !== null && el !== document.body; el = el.parentElement) {
        if (getComputedStyle(el).overflow !== 'visible') { column = el.getBoundingClientRect(); break }
      }
      const x = Math.round(o.left + 3)
      const y = Math.round(o.top + o.height / 2)
      const stack = document.elementsFromPoint(x, y)
      const topMost = stack[0] === undefined ? null : stack[0]
      return {
        left: Math.round(o.left),
        width: Math.round(o.width),
        wallLeft: column === null ? null : Math.round(column.left),
        paintedOverBy: topMost === null ? 'nothing' : topMost.className.toString().slice(0, 24) || topMost.tagName,
        oursOnTop: topMost !== undefined && topMost.closest('.waaagh-orc') !== null
      }
    })
  }
  for (const [width, height] of [[1440, 900], [1000, 760], [880, 700]]) {
    const orc = await orcAt(width, height)
    check(
      orc.oursOnTop,
      `nothing paints over the mascot at ${width}px`,
      `topmost is ${orc.paintedOverBy} at x=${orc.left}`
    )
    check(
      orc.wallLeft !== null && orc.left >= orc.wallLeft,
      `the mascot stands inside the wall at ${width}px`,
      `left ${orc.left} vs wall ${orc.wallLeft}`
    )
  }
  const wide = await orcAt(1440, 900)
  check(wide.width >= 110, 'he is drawn at full size when there is room', `${wide.width}px wide`)

  for (const [width, height] of [[1440, 900], [1000, 760], [880, 700]]) {
    const bellow = await bellowAt(width, height)
    check(
      bellow.columnLeft !== null && bellow.startsAt >= bellow.columnLeft,
      `the bellow starts inside the column at ${width}px`,
      `bellow ${bellow.startsAt} vs column ${bellow.columnLeft}`
    )
    check(
      bellow.bellowBottom <= bellow.cardTop,
      `the bellow clears the card at ${width}px`,
      `bottom ${bellow.bellowBottom} vs card top ${bellow.cardTop}`
    )
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(300)

  // A failure makes him panic: the plugin watches `data-error`, both as a new node and
  // as the attribute appearing on an existing one.
  await page.evaluate(() => {
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', 'tool-call')
    row.textContent = 'smoke failure probe'
    document.body.appendChild(row)
    const inner = document.createElement('div')
    row.appendChild(inner)
    inner.setAttribute('data-error', '')
  })
  await page.waitForTimeout(300)
  const panicking = await page.evaluate(() => {
    const act = getComputedStyle(document.querySelector('.waaagh-act'))
    const card = getComputedStyle(document.querySelector('[data-composer-card]'))
    return {
      flag: document.documentElement.dataset.waaaghError ?? '-',
      strip: act.animationName,
      border: card.borderTopColor
    }
  })
  check(panicking.flag === 'on', 'a failure raises the panic flag', panicking.flag)
  check(panicking.strip === 'waaagh-error-frames', 'a failure switches him to the panic strip', panicking.strip)
  check(/rgb\(168, 50, 20\)/.test(panicking.border), 'the bubble goes red while failing', panicking.border)
  await page.evaluate(() => document.querySelectorAll('[data-error]').forEach((el) => el.removeAttribute('data-error')))

  // Clan colours: read from storage on boot, applied as a hue rotation on the mascot.
  await page.evaluate(() => localStorage.setItem('dsh-waaagh-ork:clan', 'sunz'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card] .waaagh-orc', { timeout: 60000 })
  await page.waitForTimeout(1200)
  const clan = await page.evaluate(() => ({
    attribute: document.documentElement.dataset.waaaghClan ?? '-',
    filter: getComputedStyle(document.querySelector('.waaagh-orc')).filter
  }))
  check(clan.attribute === 'sunz', 'the clan survives a reload', clan.attribute)
  check(clan.filter.includes('hue-rotate(-111deg)'), 'the clan recolours the mascot', clan.filter)
  await page.evaluate(() => localStorage.removeItem('dsh-waaagh-ork:clan'))

  check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | ') || 'none')
} finally {
  await browser.close()
}

console.log(failures.length === 0 ? 'smoke: all checks passed' : `smoke: ${failures.length} failed — ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
