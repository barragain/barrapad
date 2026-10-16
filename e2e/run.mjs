// Runs every smoke test in this folder against production (or BASE) and
// prints one line per test. Exit code 1 if any test fails. Usage: npm run e2e
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const tests = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')

// E2E_CRDT=1: run every test with the Yjs switch on, through copies of the
// signed-in states that carry localStorage.bpad_crdt = '1'.
const env = { ...process.env }
if (process.env.E2E_CRDT === '1') {
  const src = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
  const dst = mkdtempSync(path.join(tmpdir(), 'bpad-crdt-'))
  const origin = new URL(process.env.BASE ?? 'https://www.bpad.cc').origin
  for (const f of readdirSync(src).filter((f) => f.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(path.join(src, f), 'utf8'))
    s.origins = s.origins ?? []
    let o = s.origins.find((x) => x.origin === origin)
    if (!o) s.origins.push(o = { origin, localStorage: [] })
    o.localStorage = [...o.localStorage.filter((e) => e.name !== 'bpad_crdt'), { name: 'bpad_crdt', value: '1' }]
    writeFileSync(path.join(dst, f), JSON.stringify(s))
  }
  env.E2E_AUTH = dst
  console.log('CRDT switch on for every signed-in test')
}

let failed = 0
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join(HERE, t)], { encoding: 'utf8', env })
  const out = r.stdout + r.stderr
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL') || /Error/.test(l))
  const passes = out.split('\n').filter((l) => l.startsWith('PASS')).length
  const ok = r.status === 0 && fails.length === 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t} (${passes} checks)${fails.length ? '\n     ' + fails.slice(0, 5).join('\n     ') : ''}`)
}
process.exit(failed ? 1 : 0)
