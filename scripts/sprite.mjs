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
  [58, 38, 22, 255], // 17 leather dark
  [198, 44, 40, 255], // 18 angry eye red
  [120, 20, 18, 255] // 19 angry eye dark
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
  leatherDark: COLORS[17],
  eyeRed: COLORS[18],
  eyeDark: COLORS[19]
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

// ── the idle head (icon art: tool rows, running icon, step-process icon) ──────
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

/**
 * Debug aid: `node scripts/sprite.mjs --dump` prints the head as an ASCII map
 * (`.` transparent, otherwise the palette index in base 36).
 */
if (process.argv[2] === '--dump') {
  const canvas = drawHead(false)
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  const rows = []
  for (let y = 0; y < canvas.height; y += 1) {
    let line = String(y).padStart(2, ' ')
    for (let x = 0; x < canvas.width; x += 1) {
      const index = canvas.pixels[y * canvas.width + x]
      line += index === 0 ? '.' : chars[index]
    }
    rows.push(line)
  }
  console.log(rows.join('\n'))
  process.exit(0)
}

// Only the 16px icon art is drawn by hand now. The mascot itself is generated
// art: scripts/mascot.py builds ork-idle.png and ork-shout.png in this same
// directory, with one image-model call per frame and the character kept
// consistent by feeding each new frame the first one as a reference.
const { width, height, out: pixels } = upscale(drawHead(false), 3)
const png = encodePng(width, height, pixels)
writeFileSync(join(assets, 'ork-open.png'), png)
console.log(`ork-open.png: ${width}x${height}, ${png.length} bytes`)
