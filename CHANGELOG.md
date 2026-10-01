# Changelog

## 0.16.1 (2026-09-30)

- **The bubble's tail is gone.** The dark triangle on the card's left edge was the
  speech-bubble tail added in 0.6.0 (an SVG triangle by the end, a conic-gradient
  block before that). Hidden on request; the border and the hard offset shadow carry
  the comic look on their own. Removing it also drops the `background-image` override
  the card carried, so nothing of the owner's own card background is overwritten.
- Verified live: the card reports `background-image: none` with its border, radius
  and shadow intact, and the mascot sits beside it as before.

## 0.16.0 (2026-09-30)

Two animations, as asked: sitting while waiting, and hammering a keyboard while
working.

- **Waiting is one drawing** — sitting on the ground, scratching his belly, three
  frames walking as an eyelid roll. The pose rotation is gone, which also settles the
  "switching too fast" complaint for good: there is nothing left to switch.
- **Working is new**: six frames of him hunched over a laptop, both hands hammering,
  head down at the screen, mouth wide open yelling, sweat flying. Generated from the
  sitting pose so the Ork at the desk is the same Ork, then chained off its own first
  frame so the laptop and desk stay the same object frame to frame.
- **A targeted edit pass cleaned it up**: the model painted the yell as black letters
  ("AAA", "GH") floating over his head and left the laptop screens black in half the
  frames. Re-prompting the whole set did it again — forbidding text in a prompt that
  also asks for a shout invites sound-effect letters — so the frames were edited in
  place instead ("erase every letter, put sweat drops there instead, keep the laptop
  screen white"), which worked on the first try.
- **Deleted**: `ork-idle-a`, `ork-shout-a/b/c`, `ork-swim`, `ork-drown`, the standing
  idle, the swim progress state machine, the pose run sheet, the celebration sets.
  Two strips instead of seven; assets 245KB → 102KB, bundle 360KB → 150KB.
- Verified live: waiting reports the 3-frame strip at 5s with the blink, working
  reports the 6-frame strip at 0.7s, his position is stable through a whole turn
  (1px), no console errors.

## 0.15.0 (2026-09-30)

He swims on the spot now: the working animation no longer travels anywhere.

- **The progress-bar sweep is gone.** Sent back and forth along the top edge of the
  composer, the owner's verdict was "看起来好傻". He keeps the position `fitMascot`
  gives him — the margin beside the bubble — and only the strip changes.
- **The effort signal is the frame walk instead**: 0.8s a loop while the reply
  streams, 1.3s once the transcript goes quiet. The drown stays in place too (the
  strip, a fade and a tilt), and the breathing bob is the same gentle one he uses
  while waiting, so working and waiting differ in what he is doing, not in where.
- The measured lap variables came out of `fitMascot` with it.
- Verified live: across a whole turn his position drifts 1px horizontally (the 4px
  vertical is the breathing bob), the walk is 0.8s with the swim strip, no console
  errors.

## 0.14.1 (2026-09-30)

Waiting was still switching pose too often — 9-30s a step still reads as fidgeting.

- **Holds are 30-110s now**, and the chance that a step replays the current pose went
  from 32% to 40%, so a pose often runs twice in a row and the corner sits still for
  a couple of minutes at a time.
- Verified live: the waiting pose held through a full 45s sample window without
  changing (the shortest hold is 30s and the clock only starts once the first pose
  is drawn), no console errors.
- The working state is untouched: 5s a pass while the reply streams, 14s while quiet.

## 0.14.0 (2026-09-30)

More Ork: bigger tusks, meaner eyebrows, and a heavier greenskin build.

- **Tusks and brows turned up**: two thick tusks that now stand taller than the
  mouth and curl outward, plus eyebrows that are thick, heavy and slanted down
  toward the middle, with the upper eyelid pinched under them.
- **More Ork, same charm**: a wider, jutting jaw, a slight hunch with the head
  pushed forward, broad shoulders, long thick arms with big knuckled hands, a wider
  flatter nose, and a fully saturated green skin.
- **The build had to be held back twice.** "Sturdy Ork" produced a bodybuilder; the
  fix was naming the failure modes ("不是人类小孩、也不是肌肉壮汉", "肚子又圆又鼓",
  "绝对不要画胸肌、腹肌或任何肌肉线条"). The body stays three-heads-tall with a round
  belly, which is where the cute half of "凶一点的萌" lives.
- **"Deep saturated green" came back as dark teal with heavy shading**, and the wash
  skipped it: the classifier tested brightness, and the skin measured hue 0.35-0.58
  at value 0.2-0.4. It now finds skin by hue and saturation instead — ink is what is
  dark *and* neutral — and pulls every skin pixel 0.75 toward one flat Ork green.
  That also flattens the volume shading the model likes to add on bellies and arms,
  which is what the line-art style wants anyway.
- Verified in the built strips: skin reads as one flat green across all 30 frames,
  ink and the pale props stay put. Assets 276KB → 245KB, bundle 403KB → 360KB.

## 0.13.0 (2026-09-30)

The line-art style stayed; the character was wrong. "太小孩，不太兽人" — he read as a
human baby. Redesigned, keeping the style and the chibi proportions (fierce, still
cute):

- **Ork features**: a big square head with a **wide jutting jaw** and **two thick
  tusks curling up out of the mouth**, a **heavy brow angled down toward the
  middle**, big round eyes, a wide flat nose with visible nostrils, long pointed
  ears, a topknot, a simple collar, belt, boots and a small shoulder plate. The body
  stays round and three-heads-tall — **no pecs, no abs, no muscle lines**.
- **The first attempt overshot**: asking for a "sturdy Ork" produced a bodybuilder —
  broad shoulders, defined muscles and soft rendered shading, which threw away both
  the chibi charm and the line-art style. The prompt now names the failure modes
  outright ("不是人类小孩、也不是肌肉壮汉", "不画肌肉线条、不画渐变和阴影").
- **`--rebase <dir>`** re-edits saved frames in place, which is how a redesign keeps
  30 poses that took rounds of prompting to get right. It worked for the standing
  sets and **broke the water sets**: the model turned "up to his waist in water" into
  "standing in a small puddle" and one set came back with a rectangle drawn around
  the character. Swim and drown were regenerated from scratch instead — for those,
  the pose *is* the point.
- **The wash is hue-based now** (`apply_wash`). Blending every desaturated pixel
  toward the sheet green — the 0.12.0 approach — turned boots and blades green, and
  with the new skin the model's own green is vivid enough that frames ranged from
  near-white to a strong green. Greens are now pulled 0.7 toward the sheet colour and
  near-white (unpainted skin or paper) 0.75, so only skin moves: within-strip fills
  now agree to within a few levels (`idle-a` #d7e3c6 three times, `idle-b` #d3e3c3),
  and ink, shorts and water are untouched.
- Assets 262KB → 276KB, bundle 386KB → 403KB.

## 0.12.0 (2026-09-30)

The mascot changed art direction: **ink line art** — the style of the reference the
user picked. Thick hand-drawn outlines with a little wobble, mostly bare paper, one
flat wash of colour, and the eyes drawn huge with tiny pupils, which is where the
cute-and-daft face comes from now.

- **All 30 frames regenerated** in the new style. The reference image was fed to the
  model as a *style* reference for the base frame, and every other frame then hangs
  off it as a character reference, so 30 frames stay one character in one style.
  `mascot.py` gained `--style <image>` for exactly this, plus `--prompts <sheet>` so
  a restyle does not mean editing the script.
- **A wash is applied in post-processing** (`apply_wash`). The style asks for "one
  flat wash and otherwise bare paper" and the model honours it only sometimes:
  measured fill colours ranged from near-white to a healthy green, which flickers
  when the flipbook runs. Desaturated mid-tones are now blended toward the sheet's
  pale green (0.8), which pulled the fills into a narrow band (`#cedcb4`-`#d6e6c7`);
  ink lines, the brown shorts and the blue water are saturated or dark enough to be
  left alone.
- **One scale and one baseline per strip.** Fitting each frame on its own made him
  pulse — a frame with a shorter silhouette got scaled up to fill the box. The strip
  is now sized once (by its largest silhouette) and every frame is pasted on the
  same bottom edge.
- **24-colour palette** instead of 64: line art with anti-aliasing at 64 colours
  compresses badly. Assets 369KB → 262KB, bundle 528KB → 386KB.
- The 16px icon head is still the hand-drawn pixel-art one; at 16px a line drawing
  turns to mush. Say the word and it gets a line-art pass too.

## 0.11.3 (2026-09-30)

0.11.2 read "11111111, 2222, 222, 333333, 444" as "random pose, random length" and
picked the pose freely — which jumps around (4 → 1 → 4) and can leave a pose unseen
for minutes. The labels in that pattern are *in order*: 1, 2, 2, 3, 4.

- **Waiting is a run sheet now, not a lottery.** The list is walked one step at a
  time — advance by one, or stay on the current pose for another run — so the order
  reads 1, 2, 3, 4 … with no skips and no jumping back, and every pose comes round.
- **Every step holds for a random 9-30s** (was a random 22-70s pick), and about a
  third of the steps replay the current pose, which is what produces "2222, 222" —
  the same face twice at different lengths.
- Measured over four minutes: `idle-a:27s idle-b:27s swim:12s drown:37s wave:25s
  choppa:39s dakka:17s idle-a:21s idle-b:33s` — in order, uneven, no console errors.

## 0.11.2 (2026-09-30)

Waiting was still on a schedule: one pose every 28 seconds, round and round. The ask
was runs of random length instead — 11111111, 2222, 222, 333333, 444.

- **Random dwell**: each waiting pose now holds for a random 22-70s, and the next
  pick is random too, so the same pose can come back twice in a row with a different
  length ("2222, 222"). One shared timer drives it, and it stands down while a turn
  runs, since the work state owns the mood then.
- **Slower strips**: a 5-frame waiting strip walks in 3.6s (720ms a frame) instead of
  2.2s, and the drowning strip in 2.8s. Working keeps its own pace — 0.8s a loop
  while the reply streams, 1.3s when it goes quiet, because effort should look like
  effort.
- The celebration hands the mood straight back to the waiting schedule when it ends,
  instead of leaving the corner frozen for up to a minute.
- Verified live over 150s: runs of `drown:61s, choppa:65s, swim:24s` — random picks,
  random lengths — and every waiting strip walks at 3.6s or slower (idle 5s blink,
  drown 2.8s).

## 0.11.1 (2026-09-30)

The waiting corner was fidgeting. Two things made it busy:

- **A pose held 9 seconds.** It holds 28 now, and the order was reshuffled so the
  calm strips come first (scratching, sitting, paddling, drowning) and the
  excitable ones last (waving, choppa, dakka) — most of the time he is just
  waiting, which is the point.
- **Every strip walked at 0.8s a loop**, a speed tuned for shouting while the model
  answers. Waiting walks at 2.2s now (a 5-frame strip at 440ms a frame); working
  keeps 0.8s fast / 1.3s slow, because effort should look like effort.

Verified live: the waiting pose held for a full 15s sample window without changing,
and the working state still reports the 0.8s walk with a 5s pass.

## 0.11.0 (2026-09-30)

The two states had their jobs swapped. Waiting is where the variety belongs, and
working should read like a progress bar.

- **Waiting rotates through every mood**, one every 9s: scratching his head,
  sitting on the ground, paddling, waving, flailing the choppa, dakka — and going
  under. Seven strips, so the corner is a little variety show instead of one pose.
- **Working swims along the top of the input box** — a horizontal sweep from the
  card's left edge to its right and back, on the outside, at 5s per pass while the
  reply streams and 14s while it is quiet. Measured live: the travel stays at one
  height (87px above the card's top) while sweeping 884px horizontally, which is
  the progress-bar read the request asked for. Drowning still stops him in place
  with the fade and tilt.
- **One layer for every state.** The waiting strips used to live on `::before` and
  the working strips on the child span; both are the same thing — "which mood strip
  is playing" — so the child span carries all of them, and a custom avatar is one
  override instead of two.
- Fixed while wiring it up: the waiting rotation kept ticking during a turn and
  fought the swim logic over the same attribute, so the strip flickered between
  moods mid-turn (measured `wave/fast` and `choppa/fast` during one run). The
  rotation now stands down while `running`.

## 0.10.0 (2026-09-30)

Two things from watching it in the real app again.

- **The black tab on the bubble's left edge** was the comic tail added in 0.6.0: a
  `conic-gradient` wedge whose `background-position: left calc(100% - 30px)` is
  resolved against the card's box *minus* the image's own height, so it landed
  mid-card, and at 26x22 a 94-degree wedge rendered as a block rather than a point.
  It is an inline SVG triangle now (20x18, `calc(50% - 9px)`), which is both the
  shape and the place it was always meant to be. One line removes it entirely if
  the bubble reads better without.
- **He laps the whole bubble and changes face as he goes.** The lap was a vertical
  shuffle down the card's left margin; now it is a rectangle around the card — down
  the left, under it, up the right, back over the top — with all four corners
  measured in `fitMascot` (percentages of the containing block are meaningless
  there). A lap takes 9s while the reply streams and 18s while it is quiet.
- **Expressions rotate every 6s while the turn lasts**: paddling → waving →
  paddling → choppa → paddling → dakka. Drowning still overrides it, since that is
  the "this is taking too long" signal.
- Verified live: the tail is the SVG layer at 20x18, the Ork is seen on both the
  left and right sides of the card during one turn, the mood walks swim → a → b,
  no console errors.

## 0.9.1 (2026-09-30)

The swimmer from 0.9.0 was invisible, and the sizing was anchored to the wrong box.
Both came out of measuring against the real DOM instead of the web CLI.

- **The leftover `display:none`.** 0.8.0 hid the whole composer mascot while a turn
  ran (the working Ork lived in the transcript then). 0.9.0 moved him back to the
  composer but left the rule in place, so the swim animation played on a hidden
  element — measured 0x0 during a turn. Removed.
- **The anchor is now the real one.** `left`/`top` on an absolutely positioned
  element are relative to its `offsetParent`, and on the desktop that is the
  composer's left seat, not the card. 0.8.0's offsets were derived from the web
  CLI's layout (where the seat does sit at the card's left edge), which parked the
  mascot inside the bubble on the desktop. `fitMascot` now takes the card's box
  *minus the measured offsetParent's* for both axes, so it works wherever the seat
  sits.
- **The lap is a swim, not a twitch.** He is capped by the card's height (a 147px
  Ork beside a 102px bubble looks wrong and left a 5px lap), and the range runs
  from above the card's top edge to below its bottom edge: measured travel went
  from 5px to ~114px, still clear of the card (3px of overlap from the rotation).
- He keeps his place while drowning now — sinking below the composer would just
  leave the window, so going under is the strip plus a fade and a tilt.
- Verified live: offsetParent is the card, clears it by 1px when waiting, swim state
  walks idle → fast → slow → drown → fast, no console errors.

## 0.9.0 (2026-09-30)

The working state is a swimmer. The brief: an Ork paddling laps along the chat
box — fast while the work is going well, and if it drags he drowns and then comes
back up. (0.8.0's transcript Ork was the wrong reading of that and is gone.)

- **Two new action sets.** `ork-swim.png`: five frames of him up to his waist in
  water, paddling with alternating arms, splashes and ripples around him.
  `ork-drown.png`: four frames with dizzy spiral eyes, bubbles, and the water line
  climbing past his chin.
- **Swim state machine**, driven by the model's own output, which is the only
  honest progress signal a plugin has:
  - `fast` — the transcript changed within 2.5s (i.e. the reply is streaming):
    five frames at 0.7s, a lap of the bubble in 3.6s.
  - `slow` — quiet for up to 9s: frames at 1.6s, a lap in 8s.
  - `drown` — quiet for 9s, or a turn that has run 45s: he sinks under the bubble
    with the drowning frames for 6s, then surfaces and swims again with the
    long-turn clock restarted.
  - Activity is counted from the transcript MutationObserver, excluding the
    plugin's own nodes so a swimming mascot cannot keep itself awake.
- **The shout sets earn their keep**: the turn landing plays 2.6s of WAAAGH with a
  starburst bellow before the waiting pose returns.
- Mascot geometry (`--waaagh-w` / `--waaagh-h`) is handed to the keyframes, so the
  laps use the size `fitMascot` measured rather than a hard-coded one.
- Verified live: idle → fast → slow → drown → fast across one turn, with the strip
  walk, the travel animation and the layer swapping at each step; no console
  errors. 9 more frames generated, 129s of API time.

## 0.8.0 (2026-09-30)

Two things the desktop screenshot made obvious.

- **Nothing is hidden under the sidebar any more.** The desktop's chat column
  leaves only ~68px of margin beside the card, so a fixed 122px mascot ran under
  the sidebar — and had no `z-index`, so paint order could bury it too. The mascot
  now carries `z-index:40` and `fitMascot()` measures the space off the live layout
  (card left minus column left) and sizes/repositions him to fit, with a 76px floor
  so he never shrinks to a thumbnail. Re-measured on resize and whenever the card
  resizes.
- **The working Ork moved into the transcript.** He was decorating the composer,
  which is where you type, not where the model works. While a turn runs he is now
  inserted as an in-flow flex child immediately before the running status line —
  the "深度求索中，用时 …" row, the one element that exists exactly as long as the
  model is answering — together with his bellow bubble, so he scrolls with the
  reply and follows it. In-flow rather than floating: the row makes room for him,
  so nothing is clipped by the chat column and nothing overlaps the bubble. The row
  re-renders as the duration ticks, so the same observer pass that tags the running
  label re-asserts him; the composer mascot hides for the duration and comes back
  when the turn ends.
- The action set still swaps every 9s and the bellow with it, now driving the
  transcript Ork instead of the composer one.

## 0.7.0 (2026-09-30)

The loops were flipbooks with three frames — too few, so every action read as a
flicker — and a long turn replayed the same one the whole way through.

- **Five frames per shout set** (was three) and **three per idle set** (was two).
  The idle blink is now a real eyelid roll: open, half shut, shut. 8 new frames
  generated, 124s of API time.
- **Slower walk**: the shout flip went 1.05s → 1.75s for five frames, i.e. ~350ms
  a frame at both ends of the change — smoother *and* calmer.
- **A long turn swaps sets.** Every 9s while the model is still replying the Ork
  changes action (`a`/`b`/`c`) and draws a fresh bellow, so a two-minute answer
  gets a changing mascot instead of one loop on repeat. The waiting pose rotates
  every 20s, and its timer now always picks a *different* set rather than possibly
  re-picking the same one.
- Fixed along the way: the burst text was being redrawn on every placeholder tick
  (700ms), so the bellow flickered. It is drawn once per run and once per set
  swap now. Verified live: blink walks three positions, flip walks five, and the
  set reads `b b b a a b` across a long turn with the bellow stable inside each.

## 0.6.0 (2026-09-30)

Three fixes from watching it in the app:

- **Nothing overlaps the bubble any more.** The mascot was parked half over the
  card's left edge, which read as the chat bubble being covered, and the card's
  tail was hidden behind his head. He now stands in the page margin, clear of the
  card (1px gap measured live), and the card is back to a normal 18px text inset.
  The starburst moved out to the margin beside him too: above his head it landed
  on the transcript, over the card it landed on the draft.
- **Five action sets instead of one.** Waiting: standing and scratching his head,
  or sitting on the ground — picked on load and rotated every 20s. Working:
  waving both arms, flailing the choppa around, or dakka with a tiny gun — drawn
  fresh per run, so a long session stops replaying one loop. Sets are named by the
  `<html>` data attributes the stylesheet keys on (`data-waaagh-idle`,
  `data-waaagh-set`), so switching one is a DOM write. 8 new frames generated.
- **Slower.** The shout flip went .54s → 1.05s per loop (three frames a second
  became less than one), the chant .46s → .9s, the burst pop .62s → 1.1s.
- `scripts/mascot.py` learned to drop detached specks: the model leaves the odd
  stray blob, and besides looking wrong it inflates the alpha bounding box so the
  character gets scaled down and pushed off centre. Set C's frames now chain off
  their own first frame — referenced to the unarmed base the model kept inventing
  a different weapon (a shield, a big choppa) for every frame.

## 0.5.1 (2026-09-30)

The brief for the mascot was wrong. 0.5.0 generated a berserker — red slit eyes,
clenched tusks, charging — when an Ork WAAAGH is a *silly* yell. Regenerated all
five frames as "cute and daft":

- **Big googly eyes**, one pupil wandered off to the side, never angry red.
- **Chibi proportions**: three heads tall, a big round skull, a pale round belly,
  stubby arms and legs, chunky boots.
- **Goofy details**: tongue out mid-yell, a missing tooth, a plaster on each
  cheek, a wonky hair tuft, a small blunt choppa, one crooked little spike on a
  round pauldron.
- Poses are now cheerful rather than aggressive: waiting he scratches the back of
  his head with a dopey open-mouthed grin (second frame is the blink); working he
  waves both arms and hops, mouth wide, tongue out.
- The prompt sheet in `scripts/mascot.py` carries the whole character description
  so `--raw` builds and future regeneration stay on-model.

## 0.5.0 (2026-09-30)

The mascot is generated art now. Hand-drawn pixel art kept losing the likeness at
mascot size, so the Ork comes from an image model instead — and the character
survives the pose changes.

- **Which service.** No domestic image *skill* on this machine is reachable:
  小云雀 (`xyq-nest-skill`) needs `XYQ_ACCESS_KEY`, SpriteCook needs its own MCP
  server plus credits. The user environment already holds **Volcano Ark**
  credentials (`ARK_API_KEY` + `ARK_BASE_URL` + `VOLC_IMAGE_MODEL`, i.e.
  `doubao-seedream-4-0-250828`), so the plugin talks to that directly through
  `scripts/mascot.py`.
- **Five frames, one character.** The charging scream is generated first; every
  other frame is generated *from it* as a reference image, with the design spelled
  out again in the prompt (green skin, red eyes, spiked pauldron, belt, metal
  boots, thick black outlines). Poses: standing at ease with the choppa planted
  (plus a blink frame) and the three shout frames — arms flung back, fist thrown
  forward, both fists overhead.
- **Background keyed by hue.** Frames are drawn on a flat magenta backdrop; a
  distance key leaves the model's drop shadow as a pink smear, so `mascot.py` keys
  on the magenta hue band, feathers the edge, crops to the character, fits one
  128×160 frame and quantises to 64 colours. 1024×1024 in, 128×160 out — the size
  the plugin actually shows, which also keeps the bundle smaller than before.
- **Repo layout.** `scripts/sprite.mjs` now draws only the 16px icon head; the two
  mascot strips come from `scripts/mascot.py` (`--raw <dir>` rebuilds them from
  saved frames without spending API tokens). `scripts/check-assets.mjs` asserts the
  geometry contract (128×160 per frame) and CI checks drift for `lib/` and the
  drawn head only, since the strips need a key to regenerate.
- Generated 5 images, 4096 output tokens each, on the user's own Ark account.

## 0.4.1 (2026-09-30)

The working state did not go WAAAGH. It was a symmetric standing figure with his
mouth nearly shut, punching the air — technically a "shouting" sprite, but a
WAAAGH is a charge and a scream, and nothing about it was one.

- **The maw is the sprite now.** A huge open mouth across most of the jaw, four
  teef hanging from the top, tusks at both corners, tongue at the bottom.
- **Rage, not goggles.** Two separate brows angled down at the nose over narrow
  red slits; a single full-width band read as goggles.
- **Poses that lunge.** Near boot planted forward and low with the far leg
  trailing, arms flung back / fist thrown forward / both fists overhead with the
  choppa, instead of a symmetric stance.
- **Shout lines** radiate from both sides of the jaw, drawn touching it (floating
  dashes read as litter).
- **The burst is a 12-point starburst** (`clip-path`, generated by `starburst()`)
  rather than a rounded speech bubble, with a harder pop: a rounded bubble says
  indoor voice.

## 0.4.0 (2026-09-30)

The waiting mascot is a head no longer: it is the whole Ork, standing at ease.

- **Waiting:** the full-body Ork beside the composer bubble, choppa resting
  blade-down on the ground, one hand at his side, a bored lid over both red eyes,
  mouth shut with two teef over the lip. He blinks every few seconds.
- **Working:** unchanged — the same Ork shouting, three frames, comic burst. Both
  states now share one box (122x156, the 0.8 aspect of every 128x160 strip frame),
  so the character does not change size or position when a turn starts.
- The blink moved into the waiting strip: two frames and a two-step
  `background-position` walk, replacing the old `::after` overlay. `ork-closed.png`
  is gone; `ork-open.png` stays as the 16px icon art (tool rows, running icon,
  step-process icon).
- **A side view was tried first and abandoned** — four revisions of it — because
  the reference mascot is a whale lying on its side. At 48px wide it never read as
  a greenskin: lounging turned into a green crocodile, the pauldron into a grey
  slab across the chest, the tusks into a duck bill. The front view keeps the
  likeness the shouting Ork already earned, and the "two of us talking" framing
  comes from the mascot standing next to the bubble. If the side view is wanted
  badly enough to spend more rounds on, `scripts/sprite.mjs --dump idle`
  (ASCII pixel map) is the tool that found every bug in this round.
- `scripts/sprite.mjs` now emits two strips (`ork-idle.png` two frames,
  `ork-shout.png` three) plus the icon head.

## 0.3.2 (2026-09-30)

The working-state Ork was a green blob with a tiny head — not recognisably an
Ork, so it is redrawn from scratch on a 64x80 grid (was 44x60, 128x480 strip
after 2x upscale) as an Ork boy rather than a generic mascot:

- **The jaw is wider than the skull**, which is what makes a greenskin head read
  as a greenskin, plus short 2px tusks at the mouth corners, a row of upper teef,
  a dark roaring maw with a tongue, red eyes under angled brows, pointed ears and
  a bristle tuft.
- **Furious:** red eyes, a low heavy brow, spikes on a steel pauldron, a raised
  choppa. **Silly:** chibi proportions — the head is nearly half the sprite.
- Hunched shoulders over a barrel gut, oversized fists, big boots, belt and
  buckle; three poses (fists out / fists overhead / choppa up).
- `scripts/sprite.mjs` gained `--dump body 1`, an ASCII map of any frame. Comparing
  it against the render is how the last two bugs were found: the scanline polygon
  fill grows shapes a pixel per side, so the tusks fused with the teef into one
  wide pale slab across the muzzle, and the pauldron had grown across the chest.
- Bone pauldron spikes were swapped for steel ones (they read as a second pair of
  horns next to the head).

## 0.3.1 (2026-09-30)

Support for the desktop's client build, which is **0.2.0-rc.2** — newer than the
0.1.7-rc.2 the plugin was typed against, and different in ways that mattered:

- **The blue running line was never masked on the desktop.** 0.2.0's `TextShimmer`
  dropped `data-text-shimmer` for `data-shimmer` and moved the text into an inner
  span, so the label finder matched nothing. It now matches the hash-suffixed
  `runningText` class first (stable across 0.1.7 and 0.2.0) and keeps both
  attribute markers as fallbacks.
- **Both icons in the process area are now Ork heads.** The running line's whale
  tail (`[class*=runningIcon]`, nodding while the turn runs) and 0.2.0's
  step-process row — `正在读取文件` / `准备写入文件` … — which exposes the stable
  hook `data-step-process-icon`; 0.1.7 keeps the `turn-process` leading fallback.
- **The step-process label is masked too** (`[data-process-activity] [class*=label]`),
  each row drawing its own random bellow, and 查看详情 gives the real wording back.
- Type contract bumped 0.1.7-rc.2 → 0.2.0-rc.2 for all 25 `@deepseek-ai/*` packages
  (`tsc --noEmit` clean, so slots/props/snapshot fields are unchanged), and the peer
  ranges widened to `<0.3.0` so the desktop's version is inside them.
- Verified by injecting the 0.2.0 markup verbatim (classes and attributes taken from
  the desktop's ui-chat bundle) into a live instance, starting a real turn, and
  asserting: label tagged, text at `0px` with the bellow in `::before`, both icons on
  Ork backgrounds with their glyphs hidden, per-row word set, and 查看详情 restoring
  the real label.

## 0.3.0 (2026-09-30)

Composer as a comic strip, with two mascot states:

- **Waiting:** the armour plate is gone; the plain head floats *outside* the
  composer card's left edge (52px outside, 124px card gutter) instead of sitting
  inside a padded gutter, and breathes/blinks as before.
- **Composer = speech bubble:** chunky ink outline, 20px radius, hard offset
  shadow, and a tail on the left edge below the Ork's chin pointing back at him
  (`conic-gradient` background layer, so the themed fill colour survives).
- **Working:** the head is replaced by a full-body Ork that keeps shouting —
  three frames (arms out / arms up / choppa overhead) shipped as one vertical
  strip and flipped with a three-step `background-position` walk — plus a green
  comic burst carrying a short random bellow drawn fresh per run.
- Sprites: `ork-shout.png` (88x360 strip) added; `scripts/sprite.mjs` now draws
  the body too (pauldron, chest strap, belt, boots, choppa) and emits the strip.
- `prefers-reduced-motion` still switches the whole menagerie off, including the
  flipbook and the burst.

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
