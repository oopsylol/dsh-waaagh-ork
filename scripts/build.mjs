/**
 * Build the two shipped halves from `src/`:
 *
 *   src/host/index.ts   → lib/index.js   (plain ESM, loaded by the Node Loader)
 *   src/client/index.ts → lib/client.js  (lazy-CJS bundle the browser Loader runs)
 *
 * The client half cannot be a normal bundle: dsh-client-modules evaluates every
 * plugin bundle as a classic script that REGISTERS a factory —
 * `window.__ModuleLoader__.load({ id, factory })` — and the factory body is
 * plain CJS receiving the shell's module-table `require`. So the client build
 * wraps esbuild's CJS output in that registration, which is also why `react`
 * stays external: it is a platform seed word, not a bundled dependency.
 *
 * `lib/` is committed (the runtime never builds a plugin on install), so the
 * output must be reproducible: same inputs → byte-identical files
 * (`npm run verify` fails on drift).
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Shared esbuild options: readable output, no minification, UTF-8 kept as-is. */
const shared = {
  bundle: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
  target: 'es2022',
  absWorkingDir: root
}

// ── host half: the no-op Node plugin the Loader entry activates ─────────────
await build({
  ...shared,
  entryPoints: [join(root, 'src/host/index.ts')],
  outfile: join(root, 'lib/index.js'),
  platform: 'node',
  format: 'esm'
})

// ── client half: the factory registration the browser Loader executes ───────
await build({
  ...shared,
  entryPoints: [join(root, 'src/client/index.ts')],
  outfile: join(root, 'lib/client.js'),
  platform: 'browser',
  format: 'cjs',
  // Platform seed words only: everything else must be bundled.
  external: ['react'],
  // Sprites travel inside the bundle as data URLs, exactly like before.
  loader: { '.png': 'dataurl' },
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      `\tid: ${JSON.stringify(pkg.name)},`,
      '\tfactory: (require) => {',
      '\t\tvar module = { exports: {} };',
      '\t\tvar exports = module.exports;'
    ].join('\n')
  },
  footer: {
    // `module.exports`, not `exports`: the CJS transform reassigns it.
    js: '\t\treturn module.exports;\n\t}\n});'
  }
})

console.log(`built lib/index.js + lib/client.js for ${pkg.name}@${pkg.version}`)
