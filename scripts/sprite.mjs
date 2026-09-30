/**
 * Generates the mascot sprites (`src/assets/ork-open.png` + `ork-closed.png`).
 *
 * The Ork is drawn on a small pixel grid with hard edges — real pixel art, with
 * the shading and ink outline derived from the silhouette rather than placed by
 * hand — then nearest-upscaled to the shipped size. Keeping the mascot as a
 * generator (instead of a hand-edited PNG) means it is reproducible: tweak a
 * number, run `npm run sprite`, get a new pair of frames.
 *
 * Pixel order matters: silhouette → shading rings → ink outline → features. An
 * earlier revision shaded after drawing the features and erased the tusks.
 *
 * The PNGs are written as 8-bit palette images with stored (uncompressed)
 * DEFLATE blocks and hand-rolled CRC/Adler, so the bytes are identical on every
 * platform and the drift check that guards `lib/` can guard these too.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ── pixel grid ────────────────────────────────────────────────────────────────
/** Art grid resolution; the shipped sprite is GRID x SCALE. */
const GRID = 48
const SCALE = 3
/**
 * Fixed palette, index 0 = transparent. The order is the index order in the
 * PNG, so changing it changes the bytes — append rather than reorder.
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
  [166, 60, 80, 255] // 13 tongue shade
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
  tongueShade: COLORS[13]
}
const INDEX = new Map(COLORS.map((color, index) => [color.join(','), index]))

/** Index framebuffer on the art grid. */
class Canvas {
  constructor () {
    this.pixels = new Uint8Array(GRID * GRID)
  }

  indexOf (color) {
    const index = INDEX.get(color.join(','))
    if (index === undefined) throw new Error(`colour outside the palette: ${color.join(',')}`)
    return index
  }

  set (x, y, color) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return
    this.pixels[iy * GRID + ix] = this.indexOf(color)
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
}

/**
 * Draw one frame.
 * @param closed - true for the blink frame (eyes shut, everything else identical).
 * @returns the finished art-grid canvas.
 */
function drawOrk (closed) {
  const canvas = new Canvas()
  const body = new Uint8Array(GRID * GRID)
  const mark = (x, y) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix >= 0 && iy >= 0 && ix < GRID && iy < GRID) body[iy * GRID + ix] = 1
  }
  // Silhouette shapes are drawn through a masking wrapper so `body` is filled too.
  const shapes = new Canvas()
  const maskSet = shapes.set.bind(shapes)
  shapes.set = (x, y, color) => {
    maskSet(x, y, color)
    mark(x, y)
  }

  // Ork anatomy: one tall round head (cute = round), fat cheeks, small swept
  // ears, and a tuft of bristles on the crown. The muzzle lives low so there is
  // room for a wide grin.
  shapes.ellipse(24, 23, 17, 19, C.skin) // head
  shapes.ellipse(24, 33, 15, 9, C.skin) // underbite / cheeks
  shapes.polygon([[8, 17], [2, 12], [3, 23], [9, 23]], C.skin) // left ear
  shapes.polygon([[40, 17], [46, 12], [45, 23], [39, 23]], C.skin) // right ear
  shapes.polygon([[20, 6], [22, 1], [25, 1], [26, 6]], C.skin) // bristle
  shapes.polygon([[25, 6], [28, 1], [31, 2], [29, 7]], C.skin) // bristle
  canvas.pixels.set(shapes.pixels)

  // Shading: two eroded rings of the silhouette, light from the upper left.
  const erode = (mask) => {
    const out = mask.slice()
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        if (mask[y * GRID + x] === 0) continue
        const edge =
          x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1 ||
          mask[(y - 1) * GRID + x] === 0 || mask[(y + 1) * GRID + x] === 0 ||
          mask[y * GRID + x - 1] === 0 || mask[y * GRID + x + 1] === 0
        if (edge) out[y * GRID + x] = 0
      }
    }
    return out
  }
  const inner1 = erode(body)
  const inner2 = erode(inner1)
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (body[y * GRID + x] === 0) continue
      const lit = x + y < 44
      if (inner1[y * GRID + x] === 0) canvas.set(x, y, lit ? C.mid : C.shade)
      else if (inner2[y * GRID + x] === 0) canvas.set(x, y, lit ? C.skin : C.shade)
      else canvas.set(x, y, lit ? C.skin : C.mid)
    }
  }

  // Ink outline: every silhouette pixel touching transparency.
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (body[y * GRID + x] === 0) continue
      const open =
        x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1 ||
        body[(y - 1) * GRID + x] === 0 || body[(y + 1) * GRID + x] === 0 ||
        body[y * GRID + x - 1] === 0 || body[y * GRID + x + 1] === 0
      if (open) canvas.set(x, y, C.outline)
    }
  }

  // ── features: drawn last, so shading can never eat them ────────────────────
  canvas.polygon([[7, 18], [4, 14], [5, 22], [9, 21]], C.shade) // left ear hollow
  canvas.polygon([[41, 18], [44, 14], [43, 22], [39, 21]], C.shade) // right ear hollow

  // Brow: thin, low and flat. "No thoughts, only dakka."
  canvas.rect(11, 14, 33, 15, C.mid)
  canvas.rect(12, 16, 30, 16, C.mid)

  if (closed) {
    // Blink: skin over the socket, then a thin calm arc (peak in the middle).
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

  // Flat wide nose: two nostrils on a soft muzzle band.
  canvas.ellipse(24, 26, 5.5, 2, C.mid)
  canvas.set(21, 26, C.deep)
  canvas.set(27, 26, C.deep)

  // Wide lopsided grin: dark maw high on the muzzle, upper teef, tongue, and
  // stubby tusks at the corners (long cheek-covering tusks read as white
  // patches — this is the shape that finally reads as an Ork).
  canvas.polygon([[13, 28], [35, 28], [32, 38], [16, 38]], C.deep)
  for (const x of [17, 22, 27]) canvas.rect(x, 28, x + 1, 30, C.tusk)
  canvas.ellipse(24, 36, 4.5, 2, C.tongue)
  canvas.ellipse(24, 37.5, 3, 1, C.tongueShade)
  canvas.polygon([[13, 38], [11, 26], [14, 26], [16, 38]], C.tusk) // left tusk
  canvas.polygon([[35, 38], [37, 28], [34, 28], [32, 38]], C.tusk) // right tusk
  canvas.polygon([[11, 26], [12, 30], [14, 26]], C.tuskShade)
  canvas.polygon([[37, 28], [36, 32], [34, 28]], C.tuskShade)

  // Ink halo around the eyes and tusks, so they read as separate parts.
  const halo = (members) => {
    const snapshot = canvas.pixels.slice()
    const skinFamily = new Set([2, 3, 4, 5, 6])
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const at = y * GRID + x
        if (!skinFamily.has(snapshot[at])) continue
        const near =
          (x > 0 && members.has(snapshot[at - 1])) ||
          (x < GRID - 1 && members.has(snapshot[at + 1])) ||
          (y > 0 && members.has(snapshot[at - GRID])) ||
          (y < GRID - 1 && members.has(snapshot[at + GRID]))
        if (near) canvas.pixels[at] = 1
      }
    }
  }
  // Ink halo around the eyes and tusks, so they read as separate parts. The
  // blink frame draws its own ink arc, and haloing a shading index there once
  // outlined the whole head.
  if (!closed) halo(new Set([9, 10, 11]))
  halo(new Set([7]))

  // Cheek highlight: upper-left light, so the head does not read as flat.
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

/**
 * Encode an 8-bit palette PNG (colour type 3) with a transparent index 0.
 * @param size - square edge length.
 * @param indexes - one palette index per pixel, row major.
 * @returns the PNG bytes.
 */
function encodePng (size, indexes) {
  const raw = Buffer.alloc((size + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size + 1)] = 0 // filter: none
    Buffer.from(indexes.buffer, indexes.byteOffset + y * size, size).copy(raw, y * (size + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // palette
  const plte = Buffer.from(COLORS.flatMap(([r, g, b]) => [r, g, b]))
  const trns = Buffer.from([0]) // index 0 is the only transparent entry
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', deflateStored(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Nearest-neighbour upscale, so pixels stay square blocks. */
function upscale (canvas, scale) {
  const size = GRID * scale
  const out = new Uint8Array(size * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      out[y * size + x] = canvas.pixels[Math.floor(y / scale) * GRID + Math.floor(x / scale)]
    }
  }
  return { size, out }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'src', 'assets')
mkdirSync(assets, { recursive: true })

for (const [closed, file] of [[false, 'ork-open.png'], [true, 'ork-closed.png']]) {
  const { size, out } = upscale(drawOrk(closed), SCALE)
  const png = encodePng(size, out)
  writeFileSync(join(assets, file), png)
  console.log(`${file}: ${size}x${size}, ${png.length} bytes`)
}
