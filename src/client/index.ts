/**
 * dsh-waaagh-ork — browser half.
 *
 * Built into `lib/client.js`, which dsh-client-modules serves at
 * `/plugins/dsh-waaagh-ork/client.js`. The build wraps this module's CJS output
 * in the bundle protocol the vendored cordis Loader expects — a lazy-CJS factory
 * registration, `window.__ModuleLoader__.load({ id, factory })` — so the code
 * below is the factory BODY: `require` is the shell's frozen module table
 * (`react` is a platform seed) and the module's exports become the plugin.
 *
 * What it does:
 *   1. Green Ork skin: the composer card gets a vivid green border/glow and the
 *      primary send button becomes a green "Waaagh!" pill.
 *   2. The pixel-Ork HEAD (sprite, background-image) stands at the left of the
 *      composer on a bolted armour plate — gunmetal, hazard stripe, a riveted
 *      right seam, a row of bone teef and a saw-tooth silhouette — and blinks;
 *      while a turn runs it writes cycling Ork gibberish into the placeholder.
 *   3. Output mask: assistant thinking + prose are hidden and replaced by a
 *      green "Waaaaaaagh!!!". It is STATIC for finished turns and only animates
 *      (growing a's, GPU clip-path) while the turn is streaming.
 *   4. Running indicator: the localized "Deep diving..." / "深度求索中" running
 *      label becomes green "Waaaaaaagh!!!".
 *
 * What it deliberately does NOT do: touch the composer draft. The plugin used to
 * mask the requirement in the input box ("waaaaaaaagh", reveal with a second
 * Enter), which meant the message the model received depended on the ordering
 * between our draft restore and the bar's own submit — a race that could send
 * the mask itself. Nothing here writes to the draft, so what you type is what
 * gets sent.
 *
 * Compatibility notes (DSH 0.1.6-alpha.2 web + 0.1.7-rc.2 desktop):
 *   - The composer is a Lexical contenteditable with a dedicated
 *     `[data-composer-placeholder]` node, so the placeholder is styled through
 *     that node instead of `textarea::placeholder`.
 *   - 0.1.7 moved the visible running label out of the polite live region (which
 *     became screen-reader-only) into the current turn-process row; the running
 *     label is therefore located at runtime and tagged with
 *     `data-waaagh-run-label` rather than selected by CSS only.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only pulls: these bring in the SlotMap declarations this plugin
// registers into, the standard props of each seat, and `ctx.slots`.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// `settings.general.item` is typed by the settings domain base, not by the
// section package that declares it at runtime.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import orkIdle from '../assets/ork-idle.png'
import orkOpen from '../assets/ork-open.png'
import orkWork from '../assets/ork-work.png'

/** The module-table `require` the bundle factory receives from the Loader. */
declare const require: (specifier: string) => unknown
const React = require('react') as typeof import('react')

/** The standard seat the composer Ork consumes (session-scope list slot). */
type OrkProps = Partial<PropsRuntime<'conversation.input.left'>>

// ── styles ────────────────────────────────────────────────────────────────────
const GREEN = '#4bbf2a'
/**
 * Accessible names the composer's primary submit button carries: the plain send
 * label, plus the busy-state queue/steer variants that replace it while a turn
 * runs. Every locale bundled today is listed so the skin survives a language
 * switch.
 */
const SEND_LABELS = ['发送消息', 'Send message', '排队发送', 'Queue message', '插话发送', 'Steer message']
/** Accessible names of the stop button (which must keep its own square icon). */
const STOP_LABELS = ['停止生成', 'Stop generating']
/** Build one CSS rule per send-button label with a shared declaration/suffix. */
const sendRule = (suffix: string): string =>
  SEND_LABELS.map((label) => `[data-composer-card] button[aria-label="${label}"]${suffix}`).join(',')

// ── custom image (localStorage + pub/sub) ─────────────────────────────────────
const STORAGE_KEY = 'dsh-waaagh-ork:custom-image'
let customImage: string | null = null
try {
  customImage = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) || null
} catch {
  customImage = null
}
const customListeners = new Set<(value: string | null) => void>()
function setCustomImage(value: string | null): void {
  customImage = value || null
  try {
    if (customImage) localStorage.setItem(STORAGE_KEY, customImage)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable (private mode): the in-memory value still applies */
  }
  for (const listener of customListeners) listener(customImage)
}
function subscribeCustom(listener: (value: string | null) => void): () => void {
  customListeners.add(listener)
  listener(customImage)
  return () => {
    customListeners.delete(listener)
  }
}

// ── geometry ──────────────────────────────────────────────────────────────
/**
 * Mascot box. Every strip frame is 128x160, so the box has to keep that 0.8
 * aspect or `background-size` squashes the Ork. Waiting and working share it.
 */
const ORK_W = 122
const ORK_H = Math.round((ORK_W * 160) / 128)
/**
 * How far left of the card the mascot stands. He must clear the bubble entirely:
 * parked half over the card's edge (the first cut of this) read as the bubble
 * being overlapped, and the tail of the card was hidden behind his head. Measured
 * from the card's left edge, so this is "one mascot box plus a gap". The `clamp`
 * shrinks it on narrow windows, where there is less page margin to stand in.
 */
const FLOAT_OUT = ORK_W + 4
/**
 * 12-point comic starburst, used as the shout bubble's `clip-path`. A rounded
 * speech bubble says "indoor voice"; a starburst says the Ork is bellowing.
 */
function starburst(points = 12, inner = 60): string {
  const coords: string[] = []
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (Math.PI * i) / points - Math.PI / 2
    const radius = i % 2 === 0 ? 50 : inner
    coords.push(`${(50 + radius * Math.cos(angle)).toFixed(1)}% ${(50 + radius * Math.sin(angle)).toFixed(1)}%`)
  }
  return `polygon(${coords.join(',')})`
}

const CSS = [
  /*
   * The mascot stands in the margin beside the bubble, clear of it, and the card
   * keeps only a normal text inset. `z-index` matters: the desktop's sidebar and
   * chat column are siblings, and the mascot was being painted under the sidebar.
   * Width and left are re-derived from the real DOM by `fitMascot` — the desktop
   * leaves only ~68px of margin, so a fixed 122px mascot runs under the sidebar.
   * Centring uses the box offset (not `transform`) so the animations own
   * `transform` outright.
   */
  'html[data-waaagh-orc] [data-composer-card]{padding-left:18px!important}',
  `.waaagh-orc{position:absolute;z-index:40;left:-${FLOAT_OUT}px;top:calc(50% - ${ORK_H / 2}px);width:${ORK_W}px;height:${ORK_H}px;background:none;border:none;cursor:default;padding:0;pointer-events:none;animation:waaagh-breathe 4.2s ease-in-out infinite;transition:filter .25s ease}`,
  /*
   * Two animations, two strips. Waiting: sitting on the ground, three frames walked
   * as an eyelid roll. Working: at the keyboard, hammering away, sweating, yelling
   * WAAAGH — six frames. Everything else (the swim, the drown, three shout sets, the
   * standing idle, the pose rotation) is gone: one state, one drawing.
   */
  `.waaagh-act{position:absolute;inset:0;background-position:0 0;background-repeat:no-repeat;background-size:100% 300%;background-image:var(--waaagh-face,url("${orkIdle}"));animation:waaagh-blink 5s step-end infinite}`,
  'html[data-waaagh-running=on] .waaagh-act{background-image:var(--waaagh-face,url("' + orkWork + '"));background-size:100% 600%;animation:waaagh-work-frames .7s step-end infinite}',
  /* A custom avatar is one still image: no strip, so no walk. */
  '.waaagh-custom .waaagh-act{background-image:var(--waaagh-face)!important;background-size:contain!important;background-position:center!important;animation:none!important}',
  /* It leans in (and flushes greener) as soon as the composer holds something:
     the owner renders `[data-composer-placeholder]` only while the draft is
     empty, which is the one draft signal available without touching the editor. */
  '[data-composer-card]:not(:has([data-composer-placeholder])) .waaagh-orc{filter:saturate(1.18) brightness(1.06)}',
  /* It barks once when a message of yours lands in the transcript. */
  'html[data-waaagh-send] .waaagh-orc{animation:waaagh-bark .8s cubic-bezier(.2,1.5,.4,1) 1}',
  '@keyframes waaagh-work-frames{0%{background-position:0 0}16.66%{background-position:0 20%}33.33%{background-position:0 40%}50%{background-position:0 60%}66.66%{background-position:0 80%}83.33%{background-position:0 100%}}',
  '@keyframes waaagh-blink{0%,86%{background-position:0 0}90%{background-position:0 50%}94%,97%{background-position:0 100%}100%{background-position:0 0}}',
  /*
   * The turn finishing is worth a WAAAGH: the bellow lands in a starburst beside him
   * for a couple of seconds.
   */
  `html[data-waaagh-cheer=on] .waaagh-orc::after{content:var(--waaagh-bellow,"WAAAGH!");position:absolute;left:-84%;top:2%;padding:15px 12px;font:900 13px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.05em;color:#0f1a06;background:${GREEN};clip-path:${starburst(10, 62)};filter:drop-shadow(2px 2px 0 #24380f);transform:rotate(-7deg);white-space:nowrap;animation:waaagh-burst-pop 1.1s ease-in-out infinite}`,
  '@keyframes waaagh-burst-pop{0%,100%{transform:rotate(-6deg) scale(.92)}45%{transform:rotate(-9deg) scale(1.08)}}',
  '.waaagh-toggle{flex:none;height:28px;color:' + GREEN + ';cursor:pointer;background:0 0;border:1px solid ' + GREEN + ';border-radius:999px;padding:0 12px;font-size:13px;font-weight:600;transition:transform .12s ease,background .12s ease}.waaagh-toggle:hover{background:rgba(75,191,42,.14)}.waaagh-toggle:active{transform:scale(.94)}',
  '.waaagh-settings{display:flex;flex-direction:column;gap:6px}',
  '.waaagh-settings-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  '.waaagh-settings-input{flex:1;min-width:220px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 8px;font-size:13px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
  '.waaagh-settings-row button{height:30px;padding:0 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px}',
  '.waaagh-settings-hint{font-size:12px;color:var(--dsw-alias-label-caption)}',
  /*
   * Comic speech bubble: a chunky ink outline with a hard offset shadow, and a
   * tail on the left edge pointing at the Ork (kept near the card's middle, where
   * his head is). The tail is an inline SVG triangle: the conic-gradient wedge it
   * replaced resolved `calc(100% - 30px)` against the box *minus* the image, so it
   * landed mid-card and rendered as a black block instead of a point.
   */
  `[data-composer-card]{border:2px solid #2c3a22!important;border-radius:20px!important;box-shadow:4px 4px 0 rgba(28,42,18,.28),0 0 0 1px rgba(75,191,42,.35)!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='18'%3E%3Cpath d='M20 0 L20 18 L0 9 Z' fill='%232c3a22'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:left calc(50% - 9px)!important;background-size:20px 18px!important}`,
  /* Placeholder: `[data-composer-placeholder]` since the Lexical composer (textarea kept for older builds) */
  `[data-composer-card] textarea::placeholder,[data-composer-card] [data-composer-placeholder]{color:${GREEN}!important;opacity:.7}`,
  /* While a turn runs the real placeholder body is swapped for cycling Ork gibberish. */
  'html[data-waaagh-running=on] [data-composer-card] [data-composer-placeholder]{font-size:0}',
  `html[data-waaagh-running=on] [data-composer-card] [data-composer-placeholder]::before{content:var(--waaagh-placeholder,"WAAAGH");font-size:14px;color:${GREEN}}`,
  /* Primary buttons green (send + stop) */
  sendRule(`{background:${GREEN}!important;color:#fff!important}`),
  STOP_LABELS.map((label) => `[data-composer-card] button[aria-label="${label}"]{background:${GREEN}!important;color:#fff!important}`).join(','),
  /* Send button → green "Waaagh!" pill (stop button keeps its square icon) */
  sendRule('{width:auto!important;padding:0 14px!important}'),
  sendRule(' svg{display:none!important}'),
  sendRule('::before{content:"Waaagh!";font-size:13px;font-weight:700;line-height:1}'),
  /*
   * Running indicator → green "Waaaaaaagh!!!". The running label is located at
   * runtime and tagged with `data-waaagh-run-label`: `[data-chat-running]`'s
   * shimmer text on the desktop build (RunningStatus, the blue line), the
   * visible polite live region on ≤0.1.6, or the current turn-process row label
   * on npm's 0.1.7. The size reset needs `!important` (the owner's class rule
   * matches with the same specificity and may be injected later); the shimmer
   * paints text through `-webkit-text-fill-color`, so both the reset and the
   * pseudo-element have to restore it or the replacement stays invisible. The
   * bellow itself comes from `--waaagh-running` so its a-run is random per run.
   */
  '[data-waaagh-run-label]{font-size:0!important;background:none!important;animation:none!important;-webkit-text-fill-color:currentColor!important}',
  '[data-waaagh-run-label] *{background:none!important;-webkit-text-fill-color:currentColor!important}',
  `[data-waaagh-run-label]::before{content:var(--waaagh-running,"Waaaaaaagh!!!");font-size:14px;font-weight:400;color:${GREEN};-webkit-text-fill-color:currentColor}`,
  '[data-waaagh-run-label] > span[class*=Clock]{font-size:13px!important;color:var(--dsw-alias-label-caption);-webkit-text-fill-color:currentColor;margin-left:8px}',
  /* Output mask: hide assistant thinking + prose */
  'html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step] > *{display:none!important}',
  'html:not([data-waaagh=revealed]) [data-variant=think]{display:none!important}',
  'html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]{cursor:pointer!important}',
  /* Finished turns → static green "Waaaaaaagh!!!" (pops in, then holds) */
  `html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]::before{content:var(--waaagh-word,"Waaaaaaagh!!!");display:inline-block;color:${GREEN};font-size:16px;font-weight:700;line-height:24px;animation:waaagh-pop .34s cubic-bezier(.2,1.5,.4,1) 1}`,
  /* Streaming turns only → growing a's (GPU clip-path) + a shouting sway */
  '@keyframes waaagh-grow{0%{clip-path:inset(0 100% 0 0)}100%{clip-path:inset(0 0 0 0)}}',
  `html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]:has([data-streaming])::before{content:var(--waaagh-stream,"Waaaaaaaaaaaaaaagh!!!");white-space:nowrap;animation:waaagh-grow 1.6s steps(14,end) infinite,waaagh-shout .34s ease-in-out infinite alternate}`,
  /* ── process-row leading icons → green Ork (tool/context/compaction) ─ */
  `.waaagh-tool-icon{display:inline-block;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat}`,
  `[data-chat-flow-kind=tool-call] [class*=leading]{position:relative;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important;animation:waaagh-dakka .5s cubic-bezier(.2,1.5,.4,1) 1}`,
  '[data-chat-flow-kind=tool-call] [class*=leading] svg,[data-chat-flow-kind=tool-call] [class*=leading] > *{visibility:hidden!important}',
  `[data-chat-flow-kind=context] [class*=leading]{position:relative;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important;animation:waaagh-dakka .5s cubic-bezier(.2,1.5,.4,1) 1}`,
  '[data-chat-flow-kind=context] [class*=leading] svg,[data-chat-flow-kind=context] [class*=leading] > *{visibility:hidden!important}',
  `[data-chat-flow-kind=compaction] [data-compaction-icon]{width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important;animation:waaagh-dakka .5s cubic-bezier(.2,1.5,.4,1) 1}`,
  '[data-chat-flow-kind=compaction] [data-compaction-icon] *{visibility:hidden!important}',
  /* every row's Ork leans in when you point at it */
  '@media (hover:hover){[data-chat-flow-kind=tool-call] [class*=leading]:hover,[data-chat-flow-kind=context] [class*=leading]:hover,[data-chat-flow-kind=compaction] [data-compaction-icon]:hover{transform:scale(1.25) rotate(-6deg)}}',
  /* keep a failure readable: red ring around the Ork on tool errors */
  '[data-chat-flow-kind=tool-call][data-state=error] [class*=leading]{outline:1px solid #e5484d;outline-offset:1px;border-radius:50%;filter:drop-shadow(0 0 2px rgba(229,72,77,.6))}',
  /*
   * 0.2.0's step-process group row ("正在读取文件" / "准备写入文件" …) exposes a
   * stable icon hook, and its label is process chatter like the rest of them, so
   * both get the treatment: Ork head, masked label, reveal through 查看详情.
   */
  `[data-step-process-icon]{background:url("${orkOpen}") center/contain no-repeat}`,
  '[data-step-process-icon] > *{visibility:hidden!important}',
  /* 0.1.7 has no such hook: the same row leaves its glyph in the leading slot. */
  `[data-chat-flow-kind=turn-process] [class*=leading]{background:url("${orkOpen}") center/contain no-repeat}`,
  '[data-chat-flow-kind=turn-process] [class*=leading] > *{visibility:hidden!important}',
  'html:not([data-waaagh=revealed]) [data-process-activity] [class*=label]{font-size:0!important;background:none!important;-webkit-text-fill-color:currentColor!important}',
  'html:not([data-waaagh=revealed]) [data-process-activity] [class*=label] *{background:none!important;-webkit-text-fill-color:currentColor!important}',
  `html:not([data-waaagh=revealed]) [data-process-activity] [class*=label]::before{content:var(--waaagh-word,"Waaaaaaagh!!!");font-size:14px;color:${GREEN};-webkit-text-fill-color:currentColor}`,
  /* The running line's whale tail becomes an Ork head that keeps nodding. */
  `[data-chat-running] [class*=runningIcon]{background:url("${orkOpen}") center/contain no-repeat}`,
  '[data-chat-running] [class*=runningIcon] > *{visibility:hidden!important}',
  'html[data-waaagh-running=on] [data-chat-running] [class*=runningIcon]{animation:waaagh-icon-nod .9s ease-in-out infinite}',
  '@keyframes waaagh-icon-nod{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}',
  /* the send pill squashes under the finger */
  '@media (hover:hover){' + sendRule('{transition:transform .12s ease}') + sendRule(':hover{transform:scale(1.06)}') + '}',
  sendRule(':active{transform:scale(.93)}'),
  /* ── animation keyframes ──────────────────────────────────────────────── */
  '@keyframes waaagh-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.02)}}',
  '@keyframes waaagh-chant{0%,100%{transform:translateY(0) rotate(-2.5deg) scale(1)}50%{transform:translateY(-3px) rotate(2.5deg) scale(1.05)}}',
  '@keyframes waaagh-bark{0%{transform:scale(1) rotate(0)}22%{transform:scale(1.22) rotate(-8deg)}55%{transform:scale(1.05) rotate(6deg)}100%{transform:scale(1) rotate(0)}}',
  '@keyframes waaagh-pop{0%{transform:scale(.84) rotate(-2deg);opacity:0}70%{transform:scale(1.07) rotate(1deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}',
  '@keyframes waaagh-shout{from{transform:translateY(0) rotate(-1.4deg)}to{transform:translateY(-2px) rotate(1.4deg)}}',
  '@keyframes waaagh-dakka{0%{transform:scale(.55) rotate(-16deg);filter:brightness(2.4)}55%{transform:scale(1.2) rotate(9deg)}100%{transform:scale(1) rotate(0);filter:none}}',
  /* one switch turns the whole menagerie off */
  '@media (prefers-reduced-motion:reduce){.waaagh-orc,.waaagh-orc::before,html[data-waaagh-send] .waaagh-orc,html[data-waaagh-running=on] .waaagh-act,html[data-waaagh-cheer=on] .waaagh-act,html[data-waaagh-running=on] [data-chat-running] [class*=runningIcon],[data-chat-flow-kind=tool-call] [class*=leading],[data-chat-flow-kind=context] [class*=leading],[data-chat-flow-kind=compaction] [data-compaction-icon],html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]::before{animation:none!important}}'
].join('\n')

const TAG_ID = 'dsh-waaagh-ork/styles'
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-waaagh-ork'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ── helpers ───────────────────────────────────────────────────────────────────
/**
 * Random-length Ork bellow: "W" + (minAs..minAs+spread) "a" + "gh" + 1..3 "!".
 * Every mask draws its own a-run, so no two masks read the same.
 * @param minAs - lower bound of the a-run.
 * @param spread - size of the a-run's random window.
 */
function randomBellow(minAs = 2, spread = 30): string {
  const a = minAs + Math.floor(Math.random() * spread)
  const bangs = '!'.repeat(1 + Math.floor(Math.random() * 3))
  return `W${'a'.repeat(a)}gh${bangs}`
}

// ── global output-mask state (one toggle across sessions) ─────────────────────
let outputRevealed = false
const outputListeners = new Set<(value: boolean) => void>()
function setOutputRevealed(value: boolean): void {
  outputRevealed = value
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.waaagh = value ? 'revealed' : 'masked'
  }
  for (const listener of outputListeners) listener(value)
}
function subscribeOutput(listener: (value: boolean) => void): () => void {
  outputListeners.add(listener)
  listener(outputRevealed)
  return () => {
    outputListeners.delete(listener)
  }
}

// ── running indicator (located at runtime, version-agnostic) ─────────────────
/** Whether the addressed session currently runs a turn (set by the composer Ork). */
let runningNow = false
let markScheduled = false
/**
 * Bellow for the current run. It is redrawn once when a run starts and then
 * reused for every re-render: the status node is re-created as the duration
 * ticks, so keying the word on the node would reshuffle the a-run every second.
 */
let runningWord = randomBellow()
/**
 * Fit the mascot into the margin left of the composer card.
 *
 * Width comes from the room the chat column leaves beside the card. The offsets
 * cannot: `left`/`top` on an absolutely positioned element are relative to its
 * `offsetParent`, and on the desktop that is the composer's left seat — not the
 * card, and not the column. The first cut hard-coded the offset from the web CLI's
 * layout (where the seat does sit at the card's left edge) and the mascot ended up
 * parked inside the bubble. So both are derived from the card's own box minus the
 * offsetParent's.
 * @param orc - the mascot element, or null when it is not mounted.
 */
function fitMascot(orc: HTMLElement | null): void {
  if (orc === null || typeof document === 'undefined') return
  const card = orc.closest('[data-composer-card]') ?? document.querySelector('[data-composer-card]')
  if (card === null) return
  const column = card.parentElement
  const cardBox = card.getBoundingClientRect()
  const columnLeft = column?.getBoundingClientRect().left ?? cardBox.left
  // Width is limited three ways: the mascot's own art, the margin the column
  // leaves beside the card, and the card's own height — a 147px Ork beside a 102px
  // bubble looks wrong and leaves no room for a lap. Floor of 76px keeps him from
  // becoming a thumbnail on a narrow window.
  const byHeight = Math.round((cardBox.height * 1.2 * ORK_W) / ORK_H)
  const width = Math.round(Math.max(76, Math.min(ORK_W, cardBox.left - columnLeft - 6, byHeight)))
  const height = Math.round((width * ORK_H) / ORK_W)
  const parent = (orc.offsetParent as HTMLElement | null) ?? column
  const parentBox = parent?.getBoundingClientRect() ?? { left: 0, top: 0 }
  const left = Math.round(cardBox.left - width - 4 - parentBox.left)
  const top = Math.round(cardBox.top + cardBox.height / 2 - height / 2 - parentBox.top)
  orc.style.width = `${width}px`
  orc.style.height = `${height}px`
  orc.style.left = `${left}px`
  orc.style.top = `${top}px`
  orc.style.setProperty('--waaagh-w', `${width}px`)
  orc.style.setProperty('--waaagh-h', `${height}px`)
}
/** Drop the running label from whichever element carried it. */
function clearRunningLabel(): void {
  if (typeof document === 'undefined') return
  for (const el of document.querySelectorAll('[data-waaagh-run-label]')) {
    el.removeAttribute('data-waaagh-run-label')
    ;(el as HTMLElement).style.removeProperty('--waaagh-running')
  }
}
/**
 * Locate the element that shows the visible running label.
 *
 * The label moved twice: ≤0.1.6 renders the turn status itself as a visible
 * `role=status aria-live=polite` element; npm's 0.1.7 keeps that live region
 * screen-reader-only and shows the label in the current turn's process row; the
 * desktop build goes further — its turn-process row returns null while a turn is
 * open and the blue "深度求索中，用时 …" line comes from a separate RunningStatus
 * component, `[data-chat-running]`, mounted only while the session runs.
 * @returns the label element, or null when no running label is on screen.
 */
function findRunningLabel(): Element | null {
  // Newest layout: the dedicated running indicator. 0.2.0 renamed the shimmer's
  // marker (`data-shimmer`) and moved the text into an inner span, so match the
  // hash-suffixed `runningText` class first — it survives both revisions — and
  // keep the two attribute markers as fallbacks.
  for (const el of document.querySelectorAll('[data-chat-running]')) {
    if (el.getBoundingClientRect().height <= 4) continue
    const label =
      el.querySelector('[class*=runningText]') ??
      el.querySelector('[data-shimmer]') ??
      el.querySelector('[data-text-shimmer]')
    if (label !== null) return label
  }
  // ≤0.1.6: the visible polite live region IS the running label.
  for (const el of document.querySelectorAll('[data-chat-flow] [role=status][aria-live=polite]')) {
    const box = el.getBoundingClientRect()
    if (box.width > 4 && box.height > 4) return el
  }
  // npm's 0.1.7: the open turn's process-row label.
  const rows = document.querySelectorAll('[data-chat-flow-kind=turn-process] [data-turn-process]')
  return rows[rows.length - 1]?.querySelector(':scope > span') ?? null
}
/** Short bellow for the celebration bubble. */
let burstWord = randomBellow(2, 6)
/** True once a turn has run, so the celebration only fires after real work. */
let hasRun = false
/** How long the bellow hangs in its starburst after a turn lands. */
const CHEER_MS = 2600
/**
 * Mask the running label with the current run's bellow.
 */
function markRunningLabel(): void {
  if (typeof document === 'undefined') return
  clearRunningLabel()
  if (!runningNow) return
  const label = findRunningLabel()
  if (label === null) return
  label.setAttribute('data-waaagh-run-label', '')
  ;(label as HTMLElement).style.setProperty('--waaagh-running', JSON.stringify(runningWord))
}
/** Coalesce observer-driven re-marking into one pass per frame budget. */
function scheduleMarkRunningLabel(): void {
  if (markScheduled) return
  markScheduled = true
  setTimeout(() => {
    markScheduled = false
    markRunningLabel()
  }, 60)
}

// ── WaaaghOrc (conversation.input.left): the decorative Ork head ─────────────
const ORK_WORDS = ['Waaagh!', '俺寻思这能成……', 'More dakka!', "Gork n' Mork!", '俺寻思……', 'Waaaaaaagh!!!']
/**
 * Fixed Ork phrases for masked messages. The pure bellow is deliberately NOT in
 * this list: it is generated per mask so its a-run varies.
 */
const ORK_PHRASES = [
  '俺寻思这能成……',
  'More dakka!',
  "Gork n' Mork!",
  'Dakka dakka dakka!',
  'WAAAGH!',
  "Krump 'em!",
  'Da green iz best!',
  'Letz smash!',
  'Nuff teef!',
  'Oomie gets krumped!',
  'Dakka, dakka, WAAAGH!',
  'Green iz best, boss!',
  "Wot iz da meanin'?"
]
/** One message mask: half bellows (random a-run), half fixed Ork phrases. */
function randomMaskWord(): string {
  if (Math.random() < 0.5) return randomBellow()
  return ORK_PHRASES[Math.floor(Math.random() * ORK_PHRASES.length)] ?? randomBellow()
}

function WaaaghOrc(rawProps: OrkProps): React.ReactElement | null {
  const { useSession } = rawProps
  // Defensive: a shell without the session seat would otherwise crash.
  if (useSession === undefined) return null

  const running = useSession((state) => state.running) ?? false

  // Custom image (dynamic sprite).
  const [sprite, setSprite] = React.useState<string | null>(customImage)
  React.useEffect(() => subscribeCustom(setSprite), [])
  /** The mascot element, so `fitMascot` can size it against the real layout. */
  const orcRef = React.useRef<HTMLDivElement | null>(null)

  // Reserve the card's left gutter only while the Ork is mounted, rotate the
  // waiting set every so often (one pose on a loop for a whole session reads as a
  // still image rather than a mascot), and keep the mascot inside the margin the
  // layout actually leaves: the desktop only gives it ~68px beside the card, and
  // anything wider slides under the sidebar.
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.waaaghOrc = 'on'
    // Waiting is one drawing: he sits there. No pose rotation, no timers.
    const resize = (): void => fitMascot(orcRef.current)
    resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    const card = document.querySelector('[data-composer-card]')
    if (observer !== null && card !== null) observer.observe(card)
    return () => {
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      delete root.dataset.waaaghOrc
    }
  }, [])

  // Cycling Ork word while the turn runs.
  const [wordIndex, setWordIndex] = React.useState(0)
  React.useEffect(() => {
    if (!running) return
    const id = setInterval(() => setWordIndex((index) => (index + 1) % ORK_WORDS.length), 700)
    return () => clearInterval(id)
  }, [running])

  // A turn starts: draw this run's bellow, then flip the mascot to the keyboard.
  // There is no progress state machine any more — the two animations are "sitting"
  // and "typing", and `data-waaagh-running` is the whole switch between them.
  React.useEffect(() => {
    if (!running) return
    runningWord = randomBellow()
    burstWord = randomBellow(2, 6)
    hasRun = true
    markRunningLabel()
  }, [running])

  // The turn landing is worth a WAAAGH: the bellow hangs in a starburst beside him
  // for a couple of seconds.
  React.useEffect(() => {
    if (running || typeof document === 'undefined') return
    if (!hasRun) return
    const root = document.documentElement
    root.dataset.waaaghCheer = 'on'
    root.style.setProperty('--waaagh-bellow', JSON.stringify(burstWord))
    const id = setTimeout(() => {
      delete root.dataset.waaaghCheer
      root.style.removeProperty('--waaagh-bellow')
    }, CHEER_MS)
    return () => {
      clearTimeout(id)
      delete root.dataset.waaaghCheer
      root.style.removeProperty('--waaagh-bellow')
    }
  }, [running])

  // While running: flag the document, swap the composer placeholder for a
  // While running: flag the document, swap the composer placeholder for a
  // cycling Ork word (through a CSS variable, so React's own placeholder render
  // is never fought) and turn the running label into "Waaaaaaagh!!!".
  // This effect re-runs on every placeholder tick, so the burst text is NOT drawn
  // here: doing that reshuffled the bellow every 700ms and it flickered.
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    runningNow = running
    if (running) {
      root.setAttribute('data-waaagh-running', 'on')
      root.style.setProperty('--waaagh-placeholder', JSON.stringify(ORK_WORDS[wordIndex] ?? 'WAAAGH'))
      markRunningLabel()
    } else {
      root.removeAttribute('data-waaagh-running')
      root.style.removeProperty('--waaagh-placeholder')
      clearRunningLabel()
    }
    return () => {
      runningNow = false
      root.removeAttribute('data-waaagh-running')
      root.style.removeProperty('--waaagh-placeholder')
      clearRunningLabel()
    }
  }, [running, wordIndex])

  const isCustom = sprite !== null
  return React.createElement(
    'div',
    {
      ref: orcRef,
      className: isCustom ? 'waaagh-orc waaagh-custom' : 'waaagh-orc',
      // The custom avatar feeds the idle head layer's variable.
      style: isCustom ? ({ '--waaagh-face': `url("${sprite}")` } as React.CSSProperties) : undefined,
      title: 'WAAAGH',
      'aria-hidden': true
    },
    // The one strip. Which drawing it shows is the stylesheet's call: sitting by
    // default, at the keyboard once `data-waaagh-running` is set.
    React.createElement('span', { className: 'waaagh-act' })
  )
}

// ── WaaaghToggle (conversation.input.right): output-mask reveal ──────────────
function WaaaghToggle(): React.ReactElement {
  const [revealed, setRevealed] = React.useState(outputRevealed)
  React.useEffect(() => subscribeOutput(setRevealed), [])
  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'waaagh-toggle',
      onClick: () => setOutputRevealed(!revealed)
    },
    revealed ? 'WAAAGH' : '查看详情'
  )
}

// ── AvatarSettings (settings.general.item): custom image ─────────────────────
function AvatarSettings(): React.ReactElement {
  const [value, setValue] = React.useState(customImage ?? '')
  const apply = (): void => {
    const next = value.trim()
    if (next === '' || /^(https?:|data:image\/)/.test(next)) setCustomImage(next === '' ? null : next)
  }
  const reset = (): void => {
    setValue('')
    setCustomImage(null)
  }
  return React.createElement(
    'div',
    { className: 'waaagh-settings' },
    React.createElement(
      'div',
      { className: 'waaagh-settings-hint' },
      '绿皮头像：粘贴图片 URL 或 data:image 数据（留空并点「恢复默认」回到内置头像）'
    ),
    React.createElement(
      'div',
      { className: 'waaagh-settings-row' },
      React.createElement('input', {
        className: 'waaagh-settings-input',
        type: 'text',
        value,
        placeholder: 'https://… 或 data:image/png;base64,…',
        onChange: (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
        onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') apply()
        }
      }),
      React.createElement('button', { type: 'button', onClick: apply }, '应用'),
      React.createElement('button', { type: 'button', onClick: reset }, '恢复默认')
    )
  )
}

// ── plugin body ───────────────────────────────────────────────────────────────
export const name = 'dsh-waaagh-ork'
export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register({ name: 'conversation.input.left', id: 'waaagh-ork', order: 0 }, WaaaghOrc)
  )
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({ name: 'conversation.input.right', id: 'waaagh-toggle', order: 0 }, WaaaghToggle)
  )
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'waaagh-avatar', order: 100 }, AvatarSettings)
  )

  // Click any masked "Waaaaagh!!!" message to reveal the original text.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const onClick = (event: MouseEvent): void => {
      if (document.documentElement.dataset.waaagh === 'revealed') return
      const target = event.target
      if (target instanceof Element && target.closest('[data-chat-flow-kind=assistant-step]')) {
        setOutputRevealed(true)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  })

  // Give each masked message its own random Ork phrase (and its own random
  // streaming bellow), and paint the Ork over every process-row leading icon.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    // One-shot bark when one of YOUR messages lands in the transcript. The flag
    // is cleared after the animation; a fresh one restarts it via a layout read.
    const startedAt = Date.now()
    let barkTimer: ReturnType<typeof setTimeout> | undefined
    const bark = (): void => {
      const root = document.documentElement
      root.removeAttribute('data-waaagh-send')
      void root.offsetWidth
      root.setAttribute('data-waaagh-send', 'on')
      clearTimeout(barkTimer)
      barkTimer = setTimeout(() => root.removeAttribute('data-waaagh-send'), 900)
    }
    const setWord = (el: Element): void => {
      try {
        const node = el as HTMLElement
        node.style.setProperty('--waaagh-word', `"${randomMaskWord()}"`)
        node.style.setProperty('--waaagh-stream', `"${randomBellow(8, 14)}"`)
      } catch {
        /* detached node: the CSS fallback phrase applies */
      }
    }
    // CSS covers the confirmed [class*=leading] slots; this is the robust
    // fallback for rows whose icon container class does not contain "leading".
    const orkify = (row: Element): void => {
      if ((row as HTMLElement).dataset.waaaghOrked === '1') return
      let slot: Element | null = row.querySelector('[class*=leading]')
      if (!slot) slot = row.querySelector('[data-compaction-icon]')
      if (!slot) slot = row.querySelector('[data-context-recall-icon]')
      if (!slot) {
        const svg = Array.prototype.find.call(
          row.querySelectorAll('svg'),
          (candidate: SVGElement) => !candidate.closest('[class*=chevron]')
        )
        slot = svg ? svg.parentElement : null
      }
      if (!slot) return
      ;(row as HTMLElement).dataset.waaaghOrked = '1'
      if (slot.tagName === 'svg' || slot.tagName === 'SVG') {
        ;(slot as SVGElement).style.visibility = 'hidden'
        const span = document.createElement('span')
        span.className = 'waaagh-tool-icon'
        slot.insertAdjacentElement('afterend', span)
        return
      }
      for (const child of slot.children) (child as HTMLElement).style.visibility = 'hidden'
      slot.classList.add('waaagh-tool-icon')
    }
    const PROCESS_ROWS = '[data-process-activity]'
    const scan = (root: Element): void => {
      // A user bubble that just arrived = the message you sent; bark at it.
      // (The grace window keeps a session/app boot from barking at history.)
      if (
        Date.now() - startedAt > 1500 &&
        (root.matches('[data-chat-flow-kind=user]') || root.querySelector(':scope > [data-chat-flow-kind=user]') !== null)
      ) {
        bark()
      }
      if (root.matches('[data-chat-flow-kind=assistant-step]')) setWord(root)
      for (const el of root.querySelectorAll('[data-chat-flow-kind=assistant-step]')) setWord(el)
      // Step-process rows carry the per-row bellow for their masked label.
      if (root.matches(PROCESS_ROWS)) setWord(root)
      for (const el of root.querySelectorAll(PROCESS_ROWS)) setWord(el)
      if (root.matches('[data-chat-flow-kind=tool-call],[data-chat-flow-kind=context],[data-chat-flow-kind=compaction]')) {
        orkify(root)
      }
      for (const el of root.querySelectorAll(
        '[data-chat-flow-kind=tool-call],[data-chat-flow-kind=context],[data-chat-flow-kind=compaction]'
      )) {
        orkify(el)
      }
    }
    const FLOW_ROWS = '[data-chat-flow-kind=tool-call],[data-chat-flow-kind=context],[data-chat-flow-kind=compaction]'
    for (const el of document.querySelectorAll('[data-chat-flow-kind=assistant-step]')) setWord(el)
    for (const el of document.querySelectorAll(PROCESS_ROWS)) setWord(el)
    for (const el of document.querySelectorAll(FLOW_ROWS)) orkify(el)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) scan(node as Element)
        }
      }
      // The running label is re-rendered as the turn streams; re-locate it.
      scheduleMarkRunningLabel()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    markRunningLabel()
    return () => observer.disconnect()
  })
}
