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
 *   2. A big derpy pixel-Ork HEAD (sprite, background-image) stands on the left
 *      of the composer and blinks; while a turn runs it writes cycling Ork
 *      gibberish into the composer placeholder.
 *   3. Input mask: pressing Enter (or the send button) masks the requirement as
 *      a random-length "waaaaaaaagh" (held, not sent); clicking the Ork reveals
 *      it; a second Enter sends it (the model never receives "waaaaagh").
 *   4. Output mask: assistant thinking + prose are hidden and replaced by a
 *      green "Waaaaaaagh!!!". It is STATIC for finished turns and only animates
 *      (growing a's, GPU clip-path) while the turn is streaming.
 *   5. Running indicator: the localized "Deep diving..." / "深度求索中" running
 *      label becomes green "Waaaaaaagh!!!".
 *
 * Compatibility notes (DSH 0.1.6-alpha.2 web + 0.1.7-rc.2 desktop):
 *   - The composer is a Lexical contenteditable with a dedicated
 *     `[data-composer-placeholder]` node, so the placeholder is styled through
 *     that node instead of `textarea::placeholder`.
 *   - The composer submit no longer travels through the slot's
 *     `inputActions.submit` face (the bar calls its own injected `keyboard`
 *     face, which is package-internal by design), so the input mask intercepts
 *     Enter/primary-click in the capture phase on the document instead of
 *     wrapping an action.
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
import orkClosed from '../assets/ork-closed.png'
import orkOpen from '../assets/ork-open.png'

/** The module-table `require` the bundle factory receives from the Loader. */
declare const require: (specifier: string) => unknown
const React = require('react') as typeof import('react')

/** Input-mask state machine: idle → masked → revealed. */
type Phase = 'idle' | 'masked' | 'revealed'

/** The three standard seats the composer Ork consumes (session-scope list slot). */
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

const CSS = [
  /* Big derpy Ork head on the left edge of the composer card */
  'html[data-waaagh-orc] [data-composer-card]{padding-left:100px!important}',
  `.waaagh-orc{position:absolute;left:0;top:50%;transform:translateY(-50%);width:96px;height:96px;background-image:url("${orkOpen}");background-size:contain;background-position:center;background-repeat:no-repeat;background-color:transparent;border:none;cursor:pointer;padding:0}`,
  `.waaagh-orc::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background-image:url("${orkClosed}");background-size:contain;background-position:center;background-repeat:no-repeat;animation:waaagh-blink 3.6s infinite}`,
  '@keyframes waaagh-blink{0%,92%,100%{opacity:0}95%,97%{opacity:1}}',
  '@media (prefers-reduced-motion:reduce){.waaagh-orc::after{animation:none;opacity:0}}',
  `.waaagh-toggle{flex:none;height:28px;color:${GREEN};cursor:pointer;background:0 0;border:1px solid ${GREEN};border-radius:999px;padding:0 12px;font-size:13px;font-weight:600}.waaagh-toggle:hover{background:rgba(75,191,42,.14)}`,
  '.waaagh-custom::after{display:none}',
  '.waaagh-settings{display:flex;flex-direction:column;gap:6px}',
  '.waaagh-settings-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  '.waaagh-settings-input{flex:1;min-width:220px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 8px;font-size:13px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
  '.waaagh-settings-row button{height:30px;padding:0 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px}',
  '.waaagh-settings-hint{font-size:12px;color:var(--dsw-alias-label-caption)}',
  /* Green composer card (input box) */
  `[data-composer-card]{border-color:${GREEN}!important;box-shadow:0 0 0 1px rgba(75,191,42,.3),0 4px 18px rgba(75,191,42,.18)!important}`,
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
   * runtime (visible polite live region on ≤0.1.6, the current turn's
   * process-row label on 0.1.7+) and tagged with `data-waaagh-run-label`. The
   * size reset needs `!important`: the owner's own class rule matches with the
   * same specificity and may be injected after this tag. The legacy status
   * element's duration/clock child stays readable.
   */
  'html[data-waaagh-running=on] [data-waaagh-run-label]{font-size:0!important;background:none;animation:none;-webkit-text-fill-color:currentColor}',
  `[data-waaagh-run-label]::before{content:"Waaaaaaagh!!!";font-size:14px;color:${GREEN}}`,
  '[data-waaagh-run-label] > span[class*=Clock]{font-size:13px!important;color:var(--dsw-alias-label-caption);-webkit-text-fill-color:currentColor;margin-left:8px}',
  /* Output mask: hide assistant thinking + prose */
  'html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step] > *{display:none!important}',
  'html:not([data-waaagh=revealed]) [data-variant=think]{display:none!important}',
  'html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]{cursor:pointer!important}',
  /* Finished turns → static green "Waaaaaaagh!!!" */
  `html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]::before{content:var(--waaagh-word,"Waaaaaaagh!!!");display:inline-block;color:${GREEN};font-size:16px;font-weight:700;line-height:24px}`,
  /* Streaming turns only → growing a's (GPU clip-path, no reflow) */
  '@keyframes waaagh-grow{0%{clip-path:inset(0 100% 0 0)}100%{clip-path:inset(0 0 0 0)}}',
  'html:not([data-waaagh=revealed]) [data-chat-flow-kind=assistant-step]:has([data-streaming])::before{content:"Waaaaaaaaaaaaaaagh!!!";white-space:nowrap;animation:waaagh-grow 1.6s steps(14,end) infinite}',
  /* ── process-row leading icons → green Ork (tool/context/compaction) ─ */
  `.waaagh-tool-icon{display:inline-block;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat}`,
  `[data-chat-flow-kind=tool-call] [class*=leading]{position:relative;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important}`,
  '[data-chat-flow-kind=tool-call] [class*=leading] svg,[data-chat-flow-kind=tool-call] [class*=leading] > *{visibility:hidden!important}',
  `[data-chat-flow-kind=context] [class*=leading]{position:relative;width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important}`,
  '[data-chat-flow-kind=context] [class*=leading] svg,[data-chat-flow-kind=context] [class*=leading] > *{visibility:hidden!important}',
  `[data-chat-flow-kind=compaction] [data-compaction-icon]{width:16px;height:16px;flex:none;background:url("${orkOpen}") center/contain no-repeat!important}`,
  '[data-chat-flow-kind=compaction] [data-compaction-icon] *{visibility:hidden!important}',
  /* keep a failure readable: red ring around the Ork on tool errors */
  '[data-chat-flow-kind=tool-call][data-state=error] [class*=leading]{outline:1px solid #e5484d;outline-offset:1px;border-radius:50%;filter:drop-shadow(0 0 2px rgba(229,72,77,.6))}'
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
/** Random-length Ork bellow: "w" + 2..31 "a" + "gh" + 0..2 "!". */
function randomWaaagh(): string {
  const a = 2 + Math.floor(Math.random() * 30)
  const bangs = '!'.repeat(Math.floor(Math.random() * 3))
  return 'w' + 'a'.repeat(a) + 'gh' + bangs
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
/** Drop the running label from whichever element carried it. */
function clearRunningLabel(): void {
  if (typeof document === 'undefined') return
  for (const el of document.querySelectorAll('[data-waaagh-run-label]')) {
    el.removeAttribute('data-waaagh-run-label')
  }
}
/**
 * Tag the element that shows the visible running label.
 *
 * The label moved between versions: ≤0.1.6 renders the turn status itself as a
 * visible `role=status aria-live=polite` element, while 0.1.7+ keeps that live
 * region screen-reader-only (`visuallyHidden`) and shows the label in the
 * current turn's process row. The visible polite region wins when one exists;
 * otherwise the last turn-process row (document order = turn order) supplies its
 * label.
 */
function markRunningLabel(): void {
  if (typeof document === 'undefined') return
  clearRunningLabel()
  if (!runningNow) return
  for (const el of document.querySelectorAll('[data-chat-flow] [role=status][aria-live=polite]')) {
    const box = el.getBoundingClientRect()
    if (box.width > 4 && box.height > 4) {
      el.setAttribute('data-waaagh-run-label', '')
      return
    }
  }
  const rows = document.querySelectorAll('[data-chat-flow-kind=turn-process] [data-turn-process]')
  const label = rows[rows.length - 1]?.querySelector(':scope > span') ?? null
  if (label) label.setAttribute('data-waaagh-run-label', '')
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

// ── WaaaghOrc (conversation.input.left): Ork head + input mask ───────────────
const ORK_WORDS = ['Waaagh!', '俺寻思这能成……', 'More dakka!', "Gork n' Mork!", '俺寻思……', 'Waaaaaaagh!!!']
const ORK_MASKS = [
  'Waaaaaaagh!!!',
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
function randomMaskWord(): string {
  return ORK_MASKS[Math.floor(Math.random() * ORK_MASKS.length)] ?? 'Waaaaaaagh!!!'
}

function WaaaghOrc(rawProps: OrkProps): React.ReactElement | null {
  const { useInput, inputActions, useSession } = rawProps
  // Defensive: a shell without the session input face would otherwise crash.
  if (useInput === undefined || inputActions === undefined || useSession === undefined) return null

  const draft = useInput((state) => state.draft)
  const draftRef = React.useRef('')
  draftRef.current = draft
  const running = useSession((state) => state.running) ?? false

  // Custom image (dynamic sprite).
  const [sprite, setSprite] = React.useState<string | null>(customImage)
  React.useEffect(() => subscribeCustom(setSprite), [])

  // Input-mask state machine: idle → masked → revealed.
  const [phase, setPhase] = React.useState<Phase>('idle')
  const phaseRef = React.useRef<Phase>('idle')
  const realRef = React.useRef('')
  /** The masked word currently standing in for the requirement. */
  const lastMaskRef = React.useRef('')
  const orcRef = React.useRef<HTMLButtonElement | null>(null)

  const setPhaseBoth = (next: Phase): void => {
    phaseRef.current = next
    setPhase(next)
  }

  // Reserve the card's left gutter only while the Ork is mounted.
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.waaaghOrc = 'on'
    return () => {
      delete document.documentElement.dataset.waaaghOrc
    }
  }, [])

  // Wrap the composer's submit path so Enter (and the primary send button)
  // masks — instead of sending — the first time, and always restores the real
  // text before a real send. The bar submits through its own injected keyboard
  // face, which no slot prop exposes, so the interception happens one layer
  // lower: capture-phase listeners that run before React's root listener sees
  // the event.
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    // Several composers can coexist (hero, session, sidebar subagent); each Ork
    // only ever drives the card it lives in.
    const inOwnComposer = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      const card = orcRef.current?.closest('[data-composer-card]')
      return card !== undefined && card !== null && card.contains(target)
    }
    const isStopButton = (el: Element): boolean => STOP_LABELS.includes(el.getAttribute('aria-label') ?? '')
    const isSendButton = (el: Element): boolean =>
      SEND_LABELS.includes(el.getAttribute('aria-label') ?? '') ||
      ((el.getAttribute('class') ?? '').includes('primary') && !isStopButton(el))
    /**
     * Apply the phase machine to one submit gesture.
     * @returns whether the gesture was swallowed (masked) or should continue.
     */
    const intercept = (): boolean => {
      const text = (draftRef.current ?? '').trim()
      // Untouched mask + Enter = "now send the real requirement".
      if (phaseRef.current === 'masked' && text === lastMaskRef.current) {
        const real = realRef.current
        realRef.current = ''
        setPhaseBoth('idle')
        if (real === '') return false
        inputActions.setDraft(real)
        // Let the editor's store update settle, then send on the next task so the
        // model can never receive the masked gibberish.
        setTimeout(() => inputActions.submit(), 0)
        return true
      }
      // Revealed requirement + Enter = ordinary send.
      if (phaseRef.current === 'revealed' && text === realRef.current) {
        realRef.current = ''
        setPhaseBoth('idle')
        return false
      }
      // Anything else with content becomes the next masked requirement (an edit
      // of the mask is hidden again rather than discarded).
      if (text !== '' && !text.startsWith('/')) {
        const word = randomWaaagh()
        realRef.current = text
        lastMaskRef.current = word
        setPhaseBoth('masked')
        inputActions.setDraft(word)
        return true
      }
      return false
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.isComposing || event.keyCode === 229) return
      if (!inOwnComposer(event.target)) return
      if (intercept()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0) return
      if (!inOwnComposer(event.target)) return
      const target = event.target instanceof Element ? event.target.closest('[data-composer-card] button') : null
      if (target === null || !isSendButton(target)) return
      if (intercept()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [inputActions])

  const onOrcClick = (): void => {
    if (phaseRef.current === 'masked' && realRef.current) {
      inputActions.setDraft(realRef.current)
      setPhaseBoth('revealed')
    }
  }

  const hint = phase === 'masked' ? '点击绿皮看俺的需求' : phase === 'revealed' ? '已揭示 · 再回车发送' : 'WAAAGH'

  // Cycling Ork word while the turn runs.
  const [wordIndex, setWordIndex] = React.useState(0)
  React.useEffect(() => {
    if (!running) return
    const id = setInterval(() => setWordIndex((index) => (index + 1) % ORK_WORDS.length), 700)
    return () => clearInterval(id)
  }, [running])

  // While running: flag the document, swap the composer placeholder for a
  // cycling Ork word (through a CSS variable, so React's own placeholder render
  // is never fought), and turn the running label into "Waaaaaaagh!!!".
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
  return React.createElement('button', {
    ref: orcRef,
    type: 'button',
    className: isCustom ? 'waaagh-orc waaagh-custom' : 'waaagh-orc',
    style: isCustom ? { backgroundImage: `url("${sprite}")` } : undefined,
    onClick: onOrcClick,
    title: hint,
    'aria-label': hint
  })
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

  // Give each masked message its own random Ork phrase, and paint the Ork over
  // every process-row leading icon.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const setWord = (el: Element): void => {
      try {
        ;(el as HTMLElement).style.setProperty('--waaagh-word', `"${randomMaskWord()}"`)
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
    const scan = (root: Element): void => {
      if (root.matches('[data-chat-flow-kind=assistant-step]')) setWord(root)
      for (const el of root.querySelectorAll('[data-chat-flow-kind=assistant-step]')) setWord(el)
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
    observer.observe(document.body, { childList: true, subtree: true })
    markRunningLabel()
    return () => observer.disconnect()
  })
}
