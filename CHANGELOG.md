# Changelog

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
