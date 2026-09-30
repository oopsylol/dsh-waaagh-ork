# Changelog

## 0.2.5 (2026-09-30)

New mascot art. The old sprite was a photo-real-ish AI head; the ask was "cuter
and dumber", and no image API is reachable from a desktop session (dsh-imagegen
keeps its channel key as a sealed secret in the web profile), so the Ork is now
*drawn* — on a 48x48 pixel grid, upscaled to a 144x144 palette PNG.

- Design: one tall round head, two big googly eyes with the pupils pointing
  different ways, a flat brow, a wide lopsided grin with upper teef, two stubby
  tusks at the mouth corners, a tongue out, small swept ears and a bristle tuft.
- Blink frame: same art with the sockets filled and a thin eyelid arc, drawn from
  the same generator so the two frames stay aligned.
- `scripts/sprite.mjs` + `npm run sprite`: the mascot is a build product like
  `lib/`. Drawing order is silhouette → shading rings eroded from it → ink
  outline → features; two earlier revisions failed here (shading after the
  features erased the tusks; haloing a shading index in the blink frame outlined
  the whole head).
- PNGs are written by hand as 8-bit palette images with stored DEFLATE blocks and
  home-rolled CRC/Adler, so the bytes are identical on every platform and CI can
  fail on drift (`git diff --exit-code -- lib src/assets`).
- 192x192 RGBA (28 KB each) → 144x144 palette (21 KB each); typed-checked build
  pipeline unchanged.

## 0.2.4 (2026-09-30)

The left-hand Ork is no longer a bare sprite on the card: it now stands on a
bolted armour plate, all of it CSS (no new assets).

- Plate: gunmetal gradient with brushed scratches, a top bevel and an inner
  shadow so it reads as a cast slab rather than a flat patch.
- Warhammer trim: yellow/black hazard stripe across the top, a riveted seam of
  four bolts down the visible right-hand armour, a row of bone teef along the
  bottom, and a saw-tooth silhouette generated as a `clip-path` polygon (five
  teef per edge, so it scales with the plate).
- The face moved to its own layer (`::before`, inset inside the plate) so a
  custom avatar swaps in through the `--waaagh-face` variable and never fights
  the plate for `background-image` slots; the blink overlay follows the same box.
- The sprite's alpha decided the layout: it is opaque on its left/top and
  transparent on its right, so the face is pulled left and up and the armour
  stays visible on the right seam and along the bottom.
- Plate is 118px with a 124px composer gutter (was a flat 96px sprite on a 100px
  gutter); every existing animation still drives it unchanged.

## 0.2.3 (2026-09-30)

More Ork: seven small animations, all CSS-only and all switched off under
`prefers-reduced-motion`:

- Idle: the head breathes (4.2s bob) and keeps blinking; it leans in and flushes
  greener as soon as the composer holds something — detected through the owner's
  own `[data-composer-placeholder]`, which is rendered only while the draft is
  empty, so the editor is still never touched.
- Running: the Ork chants (fast bob + sway + green glow) for as long as the turn
  runs, and the composer placeholder keeps cycling Ork lines.
- Sending: the Ork barks once when your own message lands in the transcript
  (`html[data-waaagh-send]` for 900ms, restarted per message, with a boot grace
  window so opening a session does not bark at history).
- Output mask: each masked message pops in; while streaming it wipes *and* sways
  (two animations on different properties, so they compose).
- Process rows: each tool/context/compaction Ork icon plays a one-shot "dakka"
  flash as the row appears, and leans in on hover.
- Chrome: the send pill squashes on hover/press, the 查看详情 toggle pops on press.
- Centring moved from `transform:translateY(-50%)` to `top:calc(50% - 48px)` so
  every animation owns `transform` outright.

## 0.2.2 (2026-09-26)

The running indicator now covers the desktop build's own status line, and every
bellow draws its own a-run:

- The desktop's in-app chat package is newer than npm's 0.1.7-rc.2: its
  turn-process row returns `null` while a turn is open (`if (turn?.status !==
  "closed") return null`), and the blue "深度求索中，用时 …" line comes from a
  separate `RunningStatus` component. The indicator is now located by
  `[data-chat-running] [data-text-shimmer]` first, with the visible polite live
  region (≤0.1.6) and the turn-process row (npm 0.1.7) kept as fallbacks. The
  shimmer paints through `-webkit-text-fill-color`, so the replacement restores
  it explicitly or it would stay invisible.
- Every mask gets a random a-run: `W` + 2..31 `a` + `gh` + 1..3 `!`. Masked
  messages draw one per message (half bellows, half the fixed Ork phrases), the
  streaming wipe draws a longer one, and the running label draws one per run —
  reused while that run streams, because the status node is re-created on every
  duration tick and a per-node draw would reshuffle it once a second.

## 0.2.1 (2026-09-26)

**Removed the input mask.** It masked the requirement *inside the composer draft*
(a random-length "waaaaaaaagh", revealed by a second Enter), so the text the model
received depended on the ordering between the plugin restoring the draft and the
composer bar reading it for its own submit — a race that could send the mask
instead of the requirement. The plugin never writes to the draft now:

- Typing, the input box and the submitted payload are untouched: what you type is
  what gets sent, always.
- The Ork head is decorative again — no click-to-reveal, no second Enter, and it
  no longer swallows composer pointer events.
- The output mask, running indicator, green skin, process-row icons, placeholder
  cycling and the custom-avatar setting are unchanged.

(0.2.0 was never published to npm.)

## 0.2.0 (2026-09-21)

Adapted to DSH 0.1.6-alpha.2 (web) and 0.1.7-rc.2 (desktop):

- Input mask now intercepts the composer's own submit path (capture-phase Enter
  / primary-button click) instead of wrapping the slot's `inputActions.submit`,
  which the composer bar stopped using; the requirement is still revealed by
  clicking the Ork and never reaches the model as "waaaaagh".
- Running indicator follows the 0.1.7 layout: the polite live region became
  screen-reader-only, so the visible running label in the current turn-process
  row is located at runtime and becomes "Waaaaaaagh!!!" (the 0.1.6 visible
  status element is still handled).
- Composer placeholder: the Lexical composer renders `[data-composer-placeholder]`
  instead of a `textarea::placeholder`, which the green skin and the cycling Ork
  words now target (through a CSS variable, so React's render is untouched).
- Send button: green "Waaagh!" pill also covers the busy-state labels
  (排队发送 / 插话发送 / Queue message / Steer message); the stop button keeps
  its square icon.
- `dsh.client` declaration refreshed: dropped the removed
  `@deepseek-ai/dsh-client-runtime` inject edge, added the real UI rows and
  stage-one prefetch; peer ranges now name 0.1.6-alpha.2+.
- Slash-command drafts (`/…`) are never masked.

Engineering (no behaviour change):

- The browser half is TypeScript under `src/client/`; `lib/client.js` and
  `lib/index.js` are esbuild build products (`pnpm run build`) instead of
  hand-edited bundles. Sprites live in `src/assets/` and are inlined at build.
- `pnpm run typecheck` checks slot names and props against the published
  `@deepseek-ai/dsh-client-*` declarations (devDependencies pinned to
  0.1.7-rc.2), so a wrong slot key or state field fails the compiler instead of
  the page.
- CI installs, typechecks, rebuilds and then asserts `lib/` has no drift from
  `src/`; `prepublishOnly` rebuilds before every publish.

## 0.1.4 (2026-08-29)

- Tool / context / compaction process rows now show a green Ork head instead of the default leading icon.
- Tool errors keep a red ring so a failed call stays readable.

## 0.1.1 (2026-08-29)

- Ork sprite now sits flush against the composer's left edge.
- Clicking a masked `Waaaaaaagh!!!` message reveals the original text.
- Simplified the README.
- Published to npm.

## 0.1.0 (2026-08-29)

- Initial release: green pixel-Ork mascot, input mask, output mask, custom avatar, and a green "Deep diving..." indicator.
