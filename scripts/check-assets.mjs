/**
 * Asserts the shipped sprite geometry.
 *
 * The stylesheet depends on it: both strips are walked with `background-position`
 * over frames of exactly 128x160, and the icon head is drawn once. A truncated or
 * regenerated-at-the-wrong-size asset would otherwise fail silently on screen.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const assets = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'assets')
/** file → [width, height]. Idle strips are three frames (open, half, shut), shout strips five. */
const EXPECTED = [
  ['ork-open.png', 144, 144],
  ['ork-idle-a.png', 128, 160 * 3],
  ['ork-idle-b.png', 128, 160 * 3],
  ['ork-shout-a.png', 128, 160 * 5],
  ['ork-shout-b.png', 128, 160 * 5],
  ['ork-shout-c.png', 128, 160 * 5]
]

let failed = false
for (const [file, width, height] of EXPECTED) {
  const header = readFileSync(join(assets, file)).subarray(0, 24)
  const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const actualWidth = header.readUInt32BE(16)
  const actualHeight = header.readUInt32BE(20)
  const ok = isPng && actualWidth === width && actualHeight === height
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${actualWidth}x${actualHeight} (expected ${width}x${height})`)
}
process.exit(failed ? 1 : 0)
