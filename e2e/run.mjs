// Runs every smoke test in this folder against production (or BASE) and
// prints one line per test. Exit code 1 if any test fails. Usage: npm run e2e
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const tests = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'run.mjs' && f !== 'visual-audit.mjs')

let failed = 0
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join(HERE, t)], { encoding: 'utf8' })
  const out = r.stdout + r.stderr
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL') || /Error/.test(l))
  const passes = out.split('\n').filter((l) => l.startsWith('PASS')).length
  const ok = r.status === 0 && fails.length === 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t} (${passes} checks)${fails.length ? '\n     ' + fails.slice(0, 5).join('\n     ') : ''}`)
}
process.exit(failed ? 1 : 0)
