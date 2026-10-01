/**
 * Asserts the shipped sprite geometry and the plugin-manager icon.
 *
 * The stylesheet depends on it: the strips are walked with `background-position`
 * over frames of exactly 128x160, and the tool-row icon is a single 144x144 frame. A
 * truncated or regenerated-at-the-wrong-size asset would otherwise fail silently on
 * screen. The plugin icon is an SVG that embeds that same 144x144 PNG (DSH reads it
 * from the manifest's top-level `icon` field), so it is checked for both its wrapper
 * and the payload it wraps — the two are written by the same generator call and must
 * not drift apart.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'src', 'assets')
/** file → [width, height]. Two states: sitting (3 frames), typing (8). */
const EXPECTED = [
  ['ork-open.png', 144, 144],
  ['ork-idle.png', 128, 160 * 3],
  ['ork-work.png', 128, 160 * 8]
]
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let failed = false
for (const [file, width, height] of EXPECTED) {
  const header = readFileSync(join(assets, file)).subarray(0, 24)
  const isPng = header.subarray(0, 8).equals(PNG_MAGIC)
  const actualWidth = header.readUInt32BE(16)
  const actualHeight = header.readUInt32BE(20)
  const ok = isPng && actualWidth === width && actualHeight === height
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${actualWidth}x${actualHeight} (expected ${width}x${height})`)
}

// The manager icon: {icon: "./assets/icon.svg"} with the 144x144 PNG embedded.
try {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const iconField = manifest.icon
  const declared = typeof iconField === 'string' && iconField.endsWith('assets/icon.svg')
  const shipped = Array.isArray(manifest.files) && manifest.files.includes('assets')
  const svg = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8')
  const match = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(svg)
  const payload = match === null ? null : Buffer.from(match[1], 'base64')
  const embeddedOk =
    payload !== null &&
    payload.subarray(0, 8).equals(PNG_MAGIC) &&
    payload.readUInt32BE(16) === 144 &&
    payload.readUInt32BE(20) === 144
  const ok = declared && shipped && embeddedOk
  if (!ok) failed = true
  const detail = `icon=${iconField ?? 'missing'} files=${shipped ? 'assets ✓' : 'no assets'} payload=${embeddedOk ? '144x144 png' : 'bad'}`
  console.log(`${ok ? 'ok  ' : 'FAIL'} assets/icon.svg (${detail})`)
} catch (error) {
  failed = true
  console.log(`FAIL assets/icon.svg: ${String(error)}`)
}

process.exit(failed ? 1 : 0)
