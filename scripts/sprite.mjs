/**
 * Generates the mascot sprites in `src/assets/`:
 *
 *   ork-open.png / ork-closed.png    the idle head (blink pair)
 *   ork-shout-1..3.png               the full-body Ork, shouting loop
 *
 * Everything is drawn on a small pixel grid with hard edges — real pixel art,
 * with shading and the ink outline derived from the silhouette rather than
 * placed by hand — then nearest-upscaled. Keeping the mascot as a generator
 * means it is reproducible: tweak a number, run `npm run sprite`.
 *
 * Pixel order matters: silhouette → shading rings → ink outline → clothing and
 * features. An earlier revision shaded after drawing the features and erased the
 * tusks.
 *
 * The PNGs are written as 8-bit palette images with stored (uncompressed)
 * DEFLATE blocks and hand-rolled CRC/Adler, so the bytes are identical on every
 * platform and the drift check that guards `lib/` can guard these too.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * Fixed palette, index 0 = transparent. The order is the index order in the
 * PNG, so append rather than reorder.
 */
const COLORS = [
  [0, 0, 0, 0], // 0 transparent
  [16, 40, 12, 255], // 1 ink outline
  [138, 226, 86, 255], // 2 highlight
  [75, 191, 42, 255], // 3 skin (the plugin's CSS green)
  [56, 154, 30, 255], // 4 mid green
  [39, 112, 21, 255], // 5 shade
  [22, 66, 13, 255], // 6 deep green
  [244, 238, 222, 255], // 7 tusk
  [198, 189, 162, 255], // 8 tusk shade
  [250, 250, 246, 255], // 9 eye white
  [14, 20, 10, 255], // 10 pupil
  [255, 255, 255, 255], // 11 glint
  [214, 90, 110, 255], // 12 tongue
  [166, 60, 80, 255], // 13 tongue shade
  [104, 114, 98, 255], // 14 metal
  [58, 66, 54, 255], // 15 metal dark
  [96, 66, 40, 255], // 16 leather
  [58, 38, 22, 255] // 17 leather dark
]
const C = {
  empty: COLORS[0],
  outline: COLORS[1],
  highlight: COLORS[2],
  skin: COLORS[3],
  mid: COLORS[4],
  shade: COLORS[5],
  deep: COLORS[6],
  tusk: COLORS[7],
  tuskShade: COLORS[8],
  eye: COLORS[9],
  pupil: COLORS[10],
  glint: COLORS[11],
  tongue: COLORS[12],
  tongueShade: COLORS[13],
  metal: COLORS[14],
  metalDark: COLORS[15],
  leather: COLORS[16],
  leatherDark: COLORS[17]
}
const INDEX = new Map(COLORS.map((color, index) => [color.join(','), index]))
/** Indexes that count as bare skin (used when ringing parts with an ink halo). */
const SKIN_FAMILY = new Set([2, 3, 4, 5, 6])

/** Index framebuffer of arbitrary size. */
class Canvas {
  constructor (width, height) {
    this.width = width
    this.height = height
    this.pixels = new Uint8Array(width * height)
  }

  indexOf (color) {
    const index = INDEX.get(color.join(','))
    if (index === undefined) throw new Error(`colour outside the palette: ${color.join(',')}`)
    return index
  }

  set (x, y, color) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return
    this.pixels[iy * this.width + ix] = this.indexOf(color)
  }

  /** Ellipse fill; hard edges are the point, so nothing is anti-aliased. */
  ellipse (cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, color)
      }
    }
  }

  /** Convex polygon fill (scanline). */
  polygon (points, color) {
    const ys = points.map(([, y]) => y)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      const crossings = []
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[(i + 1) % points.length]
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.floor(crossings[i]); x <= Math.ceil(crossings[i + 1]); x += 1) this.set(x, y, color)
      }
    }
  }

  rect (x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) this.set(x, y, color)
  }

  /** Paint a silhouette (drawn into `scratch`) plus two shading rings into `this`. */
  shadeFrom (mask, options = {}) {
    const lightBias = options.lightBias ?? mask.length / 2
    const erode = (source) => {
      const out = source.slice()
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const at = y * this.width + x
          if (source[at] === 0) continue
          const edge =
            x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1 ||
            source[at - this.width] === 0 || source[at + this.width] === 0 ||
            source[at - 1] === 0 || source[at + 1] === 0
          if (edge) out[at] = 0
        }
      }
      return out
    }
    const inner1 = erode(mask)
    const inner2 = erode(inner1)
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const at = y * this.width + x
        if (mask[at] === 0) continue
        const lit = x + y < lightBias
        if (inner1[at] === 0) this.set(x, y, lit ? C.mid : C.shade)
        else if (inner2[at] === 0) this.set(x, y, lit ? C.skin : C.shade)
        else this.set(x, y, lit ? C.skin : C.mid)
      }
    }
  }

  /** Ink outline: every silhouette pixel touching transparency. */
  outlineFrom (mask) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const at = y * this.width + x
        if (mask[at] === 0) continue
        const open =
          x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1 ||
          mask[at - this.width] === 0 || mask[at + this.width] === 0 ||
          mask[at - 1] === 0 || mask[at + 1] === 0
        if (open) this.set(x, y, C.outline)
      }
    }
  }

  /** Ring the given palette indexes with ink, where they sit on bare skin. */
  halo (members) {
    const snapshot = this.pixels.slice()
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const at = y * this.width + x
        if (!SKIN_FAMILY.has(snapshot[at])) continue
        const near =
          (x > 0 && members.has(snapshot[at - 1])) ||
          (x < this.width - 1 && members.has(snapshot[at + 1])) ||
          (y > 0 && members.has(snapshot[at - this.width])) ||
          (y < this.height - 1 && members.has(snapshot[at + this.width]))
        if (near) this.pixels[at] = 1
      }
    }
  }
}

/** Run `paint(canvas)` while filling a silhouette mask of the same size. */
function silhouette (width, height, paint) {
  const canvas = new Canvas(width, height)
  const mask = new Uint8Array(width * height)
  const inner = new Canvas(width, height)
  inner.set = (x, y, color) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return
    inner.pixels[iy * width + ix] = inner.indexOf(color)
    mask[iy * width + ix] = 1
  }
  paint(inner)
  canvas.pixels.set(inner.pixels)
  return { canvas, mask }
}

// ── the idle head ─────────────────────────────────────────────────────────────
const HEAD = 48

/**
 * Draw the head only.
 * @param closed - true for the blink frame (eyes shut, everything else identical).
 */
function drawHead (closed) {
  const { canvas, mask } = silhouette(HEAD, HEAD, (shapes) => {
    // Cute = round: one tall head, fat cheeks, small swept ears, bristle tuft.
    shapes.ellipse(24, 23, 17, 19, C.skin)
    shapes.ellipse(24, 33, 15, 9, C.skin)
    shapes.polygon([[8, 17], [2, 12], [3, 23], [9, 23]], C.skin)
    shapes.polygon([[40, 17], [46, 12], [45, 23], [39, 23]], C.skin)
    shapes.polygon([[20, 6], [22, 1], [25, 1], [26, 6]], C.skin)
    shapes.polygon([[25, 6], [28, 1], [31, 2], [29, 7]], C.skin)
  })

  canvas.shadeFrom(mask, { lightBias: 44 })
  canvas.outlineFrom(mask)

  canvas.polygon([[7, 18], [4, 14], [5, 22], [9, 21]], C.shade) // ear hollows
  canvas.polygon([[41, 18], [44, 14], [43, 22], [39, 21]], C.shade)
  canvas.rect(11, 14, 33, 15, C.mid) // flat brow: "no thoughts, only dakka"
  canvas.rect(12, 16, 30, 16, C.mid)

  if (closed) {
    canvas.ellipse(16, 20, 5.5, 5, C.skin)
    canvas.ellipse(32, 20, 6, 5.5, C.skin)
    for (const [cx, rx] of [[16, 4], [32, 4.5]]) {
      for (let x = -Math.round(rx); x <= Math.round(rx); x += 1) {
        const t = x / rx
        const y = 20 - Math.round((1 - t * t) * 2)
        canvas.set(cx + x, y, C.outline)
        canvas.set(cx + x, y + 1, C.shade)
      }
    }
  } else {
    // Googly eyes: one slightly bigger, pupils pointing different ways ("derp").
    canvas.ellipse(16, 20, 5.5, 5, C.eye)
    canvas.ellipse(32, 20, 6, 5.5, C.eye)
    canvas.ellipse(15.5, 21, 2.6, 2.6, C.pupil)
    canvas.ellipse(32.5, 19.5, 2.8, 2.8, C.pupil)
    canvas.set(14, 19, C.glint)
    canvas.set(31, 18, C.glint)
  }

  canvas.ellipse(24, 26, 5.5, 2, C.mid) // wide flat nose
  canvas.set(21, 26, C.deep)
  canvas.set(27, 26, C.deep)

  // Wide lopsided grin: dark maw, upper teef, tongue, stubby corner tusks.
  canvas.polygon([[13, 28], [35, 28], [32, 38], [16, 38]], C.deep)
  for (const x of [17, 22, 27]) canvas.rect(x, 28, x + 1, 30, C.tusk)
  canvas.ellipse(24, 36, 4.5, 2, C.tongue)
  canvas.ellipse(24, 37.5, 3, 1, C.tongueShade)
  canvas.polygon([[13, 38], [11, 26], [14, 26], [16, 38]], C.tusk)
  canvas.polygon([[35, 38], [37, 28], [34, 28], [32, 38]], C.tusk)
  canvas.polygon([[11, 26], [12, 30], [14, 26]], C.tuskShade)
  canvas.polygon([[37, 28], [36, 32], [34, 28]], C.tuskShade)

  if (!closed) canvas.halo(new Set([9, 10, 11]))
  canvas.halo(new Set([7]))
  canvas.ellipse(15, 10, 4.5, 2.5, C.highlight)
  return canvas
}

// ── the full-body Ork (shouting loop) ─────────────────────────────────────────
const BODY_W = 44
const BODY_H = 60

/**
 * Draw one shout frame.
 * @param frame - 0: arms out and roaring, 1: both arms up, 2: choppa overhead.
 */
function drawBody (frame) {
  const { canvas, mask } = silhouette(BODY_W, BODY_H, (shapes) => {
    // Big head (it is the mascot), a short neck, a barrel torso and stubby legs.
    shapes.ellipse(22, 12, 11.5, 10, C.skin) // head
    shapes.polygon([[12, 9], [9, 6], [10, 14], [13, 14]], C.skin) // left ear
    shapes.polygon([[32, 9], [35, 6], [34, 14], [31, 14]], C.skin) // right ear
    shapes.polygon([[19, 3], [21, 0], [24, 0], [26, 3]], C.skin) // bristle
    shapes.polygon([[24, 3], [27, 0], [30, 1], [28, 4]], C.skin) // bristle
    shapes.rect(19, 20, 25, 24, C.skin) // neck
    shapes.polygon([[14, 23], [30, 23], [33, 38], [11, 38]], C.skin) // torso
    shapes.rect(13, 38, 20, 49, C.skin) // left leg
    shapes.rect(24, 38, 31, 49, C.skin) // right leg
    // Arms: every pose keeps a visible armpit gap and puts the fists clear of the
    // body, so the limbs stay readable at this size.
    if (frame === 0) {
      shapes.polygon([[13, 25], [4, 28], [4, 32], [13, 33]], C.skin)
      shapes.polygon([[31, 25], [40, 28], [40, 32], [31, 33]], C.skin)
      shapes.ellipse(5, 30, 4, 4, C.skin)
      shapes.ellipse(39, 30, 4, 4, C.skin)
    } else if (frame === 1) {
      shapes.polygon([[14, 26], [6, 19], [10, 15], [18, 23]], C.skin)
      shapes.polygon([[30, 26], [38, 19], [34, 15], [26, 23]], C.skin)
      shapes.ellipse(8, 16, 4, 4, C.skin)
      shapes.ellipse(36, 16, 4, 4, C.skin)
    } else {
      shapes.polygon([[30, 26], [39, 18], [35, 14], [26, 23]], C.skin)
      shapes.ellipse(37, 15, 4, 4, C.skin)
      shapes.polygon([[14, 26], [7, 33], [11, 37], [17, 30]], C.skin)
      shapes.ellipse(9, 35, 4, 4, C.skin)
    }
  })

  canvas.shadeFrom(mask, { lightBias: 58 })
  canvas.outlineFrom(mask)

  // Neck shadow keeps the head from melting into the torso.
  canvas.rect(19, 21, 25, 22, C.deep)

  // Clothing and props sit on top of the shaded skin.
  canvas.rect(13, 38, 20, 49, C.leather) // trousers
  canvas.rect(24, 38, 31, 49, C.leather)
  canvas.rect(11, 49, 21, 54, C.metalDark) // boots
  canvas.rect(23, 49, 33, 54, C.metalDark)
  canvas.rect(11, 54, 21, 55, C.metal) // soles
  canvas.rect(23, 54, 33, 55, C.metal)
  canvas.polygon([[14, 23], [18, 23], [30, 36], [26, 36]], C.leatherDark) // chest strap
  canvas.rect(10, 36, 34, 39, C.leatherDark) // belt
  canvas.rect(20, 37, 24, 40, C.metal) // buckle
  canvas.polygon([[7, 26], [16, 24], [18, 30], [9, 33]], C.metal) // pauldron
  canvas.polygon([[8, 29], [17, 27], [17, 30], [9, 32]], C.metalDark)
  canvas.set(10, 26, C.skin) // pad rivets
  canvas.set(15, 25, C.skin)

  if (frame === 2) {
    canvas.polygon([[36, 14], [42, 3], [43, 12]], C.metal) // choppa blade
    canvas.rect(37, 13, 39, 18, C.leatherDark) // haft
  }

  // Shouting head: angry brows, wide open maw, tusks up.
  canvas.rect(14, 9, 30, 10, C.deep)
  canvas.polygon([[14, 10], [19, 12], [14, 13]], C.deep)
  canvas.polygon([[30, 10], [25, 12], [30, 13]], C.deep)
  canvas.ellipse(17, 14, 2.5, 2, C.eye)
  canvas.ellipse(27, 14, 2.5, 2, C.eye)
  canvas.ellipse(17, 14, 1.3, 1.3, C.pupil)
  canvas.ellipse(27, 14, 1.3, 1.3, C.pupil)
  const maw = frame === 0 ? [22, 19, 4.5, 3] : frame === 1 ? [22, 19, 5.5, 3.5] : [22, 19, 5, 3.5]
  canvas.ellipse(maw[0], maw[1], maw[2], maw[3], C.deep)
  canvas.ellipse(22, maw[1] + 1.5, maw[2] - 1.5, maw[3] - 1.5, C.tongue)
  canvas.polygon([[16, 22], [14, 15], [17, 15], [19, 22]], C.tusk)
  canvas.polygon([[28, 22], [30, 15], [27, 15], [25, 22]], C.tusk)
  canvas.halo(new Set([9, 10, 7]))
  canvas.halo(new Set([14, 15, 16, 17]))
  return canvas
}

// ── PNG writer (deterministic: stored DEFLATE blocks, no compressor) ──────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32 (buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32 (buf) {
  let a = 1
  let b = 0
  for (const byte of buf) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function chunk (type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([head, body, crc])
}

function deflateStored (raw) {
  const blocks = [Buffer.from([0x78, 0x01])]
  for (let offset = 0; offset < raw.length; offset += 65535) {
    const slice = raw.subarray(offset, Math.min(offset + 65535, raw.length))
    const header = Buffer.alloc(5)
    header[0] = offset + 65535 >= raw.length ? 1 : 0
    header.writeUInt16LE(slice.length, 1)
    header.writeUInt16LE(~slice.length & 0xffff, 3)
    blocks.push(header, slice)
  }
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(adler32(raw), 0)
  blocks.push(sum)
  return Buffer.concat(blocks)
}

/** Encode an 8-bit palette PNG (colour type 3) whose index 0 is transparent. */
function encodePng (width, height, indexes) {
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0 // filter: none
    Buffer.from(indexes.buffer, indexes.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // palette
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(COLORS.flatMap(([r, g, b]) => [r, g, b]))),
    chunk('tRNS', Buffer.from([0])),
    chunk('IDAT', deflateStored(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Nearest-neighbour upscale, so pixels stay square blocks. */
function upscale (canvas, scale) {
  const width = canvas.width * scale
  const height = canvas.height * scale
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] = canvas.pixels[Math.floor(y / scale) * canvas.width + Math.floor(x / scale)]
    }
  }
  return { width, height, out }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'src', 'assets')
mkdirSync(assets, { recursive: true })

// The shout loop ships as one vertical strip: a single URL in the stylesheet and
// a three-step `background-position` animation, instead of three separate
// background-image swaps.
const SHOUT_FRAMES = 3
const strip = new Canvas(BODY_W, BODY_H * SHOUT_FRAMES)
for (let frame = 0; frame < SHOUT_FRAMES; frame += 1) {
  strip.pixels.set(drawBody(frame).pixels, frame * BODY_W * BODY_H)
}

const outputs = [
  [drawHead(false), 3, 'ork-open.png'],
  [drawHead(true), 3, 'ork-closed.png'],
  [strip, 2, 'ork-shout.png']
]

for (const [canvas, scale, file] of outputs) {
  const { width, height, out } = upscale(canvas, scale)
  const png = encodePng(width, height, out)
  writeFileSync(join(assets, file), png)
  console.log(`${file}: ${width}x${height}, ${png.length} bytes`)
}
