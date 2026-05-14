// scripts/eval_baseline.mjs
//
// Bauteil-Suche gegen Production messen.
// Iteriert alle Referenzfotos in /Users/mbieling/claude/bbs/Bilder/Reverenz/,
// jagt sie sequenziell durch POST /api/search?threshold=0&limit=10
// und berechnet Top-1/Top-3/Top-5-Trefferquote gegen den erwarteten Project-Wert
// (Ordnername → DB-Spalte parts.project).
//
// 4973 und 4973-1 sind geometrisch identisch — beide Ordner werden auf Projekt 004973 gemappt.
// Photos im Wurzelverzeichnis (IMG_3474+) haben keine Ground Truth — Open-Set-Queries,
// nur qualitativ ausgegeben.
//
// Run:  node scripts/eval_baseline.mjs
// Output: eval/results/baseline_<timestamp>.json + Konsolen-Report

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

const REF_DIR = process.env.REF_DIR || '/Users/mbieling/claude/bbs/Bilder/Reverenz'
const SEARCH_BASE = process.env.SEARCH_BASE_URL || 'https://objekt.bielingserver.de'
const SEARCH_URL = `${SEARCH_BASE}/api/search?threshold=0&limit=10`
const OUT_DIR = join(PROJECT_ROOT, 'eval', 'results')

// Ordner-Mapping: Ordnername (= Bauteilnummer, wie der User sie kennt) → DB-Spalte parts.project
// Wichtig: parts.project ist 6-stellig mit führenden Nullen, der Ordnername nicht.
const PROJECT_MAP = {
  '4770':   '004770',
  '4910':   '004910',
  '4973':   '004973',
  '4973-1': '004973', // geometrisch identisch zu 4973, Farbe (rosa vs. blau) wird nicht unterschieden
}

async function searchOne(filePath) {
  const buf = await readFile(filePath)
  const blob = new Blob([buf], { type: 'image/jpeg' })
  const fd = new FormData()
  fd.append('image', blob, basename(filePath))

  const t0 = Date.now()
  let res
  try {
    res = await fetch(SEARCH_URL, { method: 'POST', body: fd })
  } catch (err) {
    return { error: `fetch failed: ${String(err)}`, durationMs: Date.now() - t0 }
  }
  const durationMs = Date.now() - t0

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, durationMs }
  }
  const json = await res.json()
  return { results: json.results, durationMs }
}

function fmtPct(n, total) {
  if (total === 0) return '—'
  return `${((100 * n) / total).toFixed(1)}%`
}

async function main() {
  console.log(`Eval gegen: ${SEARCH_URL}`)
  console.log(`Referenzordner: ${REF_DIR}\n`)

  // Dateien einsammeln
  const entries = await readdir(REF_DIR, { withFileTypes: true })
  const labeled = []
  const unlabeled = []

  for (const e of entries) {
    if (e.isDirectory()) {
      if (!PROJECT_MAP[e.name]) continue
      const files = await readdir(join(REF_DIR, e.name))
      for (const f of files.sort()) {
        if (!/\.jpe?g$/i.test(f)) continue
        labeled.push({
          folder: e.name,
          file: f,
          path: join(REF_DIR, e.name, f),
          expectedProject: PROJECT_MAP[e.name],
        })
      }
    } else if (e.isFile() && /\.jpe?g$/i.test(e.name)) {
      unlabeled.push({ file: e.name, path: join(REF_DIR, e.name) })
    }
  }

  console.log(`Gelabelte Fotos: ${labeled.length}`)
  console.log(`Open-Set-Queries (keine GT): ${unlabeled.length}\n`)

  // --- Gelabelte Fotos durchlaufen ---
  console.log('=== Gelabelte Fotos ===')
  console.log('(Rang = Position der erwarteten Projekt-Nummer in den Suchergebnissen)\n')

  const labeledResults = []
  const counts = { top1: 0, top3: 0, top5: 0, errors: 0 }
  // Aufschlüsselung pro Folder
  const perFolder = {}

  for (const item of labeled) {
    process.stdout.write(`  ${item.folder.padEnd(7)} ${item.file} ... `)
    const r = await searchOne(item.path)

    if (r.error) {
      console.log(`ERROR ${r.error}`)
      counts.errors++
      labeledResults.push({ ...item, error: r.error, durationMs: r.durationMs })
      continue
    }

    const top5 = r.results.slice(0, 5)
    const rank = r.results.findIndex((x) => x.project === item.expectedProject) + 1 // 0 falls nicht gefunden, sonst 1-basiert
    const matchProject = rank > 0
    const isTop1 = rank === 1
    const isTop3 = rank > 0 && rank <= 3
    const isTop5 = rank > 0 && rank <= 5
    if (isTop1) counts.top1++
    if (isTop3) counts.top3++
    if (isTop5) counts.top5++

    perFolder[item.folder] ??= { total: 0, top1: 0, top3: 0, top5: 0 }
    perFolder[item.folder].total++
    if (isTop1) perFolder[item.folder].top1++
    if (isTop3) perFolder[item.folder].top3++
    if (isTop5) perFolder[item.folder].top5++

    const topStr = top5
      .map((x, i) => `${i + 1}.${x.project}/${x.name}(${x.similarity.toFixed(3)})`)
      .join('  ')
    const rankStr = matchProject ? `Rang ${rank}` : 'NICHT GEFUNDEN'
    console.log(`${rankStr.padEnd(15)} ${r.durationMs}ms`)
    console.log(`            ${topStr}`)

    labeledResults.push({
      folder: item.folder,
      file: item.file,
      expectedProject: item.expectedProject,
      rank: rank || null,
      top1: isTop1,
      top3: isTop3,
      top5: isTop5,
      top5Results: top5,
      durationMs: r.durationMs,
    })
  }

  const n = labeled.length - counts.errors
  console.log('\n=== Aggregat ===')
  console.log(`Top-1: ${counts.top1}/${n}  (${fmtPct(counts.top1, n)})`)
  console.log(`Top-3: ${counts.top3}/${n}  (${fmtPct(counts.top3, n)})`)
  console.log(`Top-5: ${counts.top5}/${n}  (${fmtPct(counts.top5, n)})`)
  console.log(`Fehler: ${counts.errors}`)

  console.log('\n=== Pro Ordner ===')
  for (const [folder, c] of Object.entries(perFolder)) {
    console.log(
      `  ${folder.padEnd(8)} Top-1 ${c.top1}/${c.total} (${fmtPct(c.top1, c.total)})  ` +
        `Top-3 ${c.top3}/${c.total} (${fmtPct(c.top3, c.total)})  ` +
        `Top-5 ${c.top5}/${c.total} (${fmtPct(c.top5, c.total)})`,
    )
  }

  // --- Open-Set (qualitativ) ---
  console.log('\n=== Open-Set-Queries (keine Ground Truth) ===')
  const unlabeledResults = []
  for (const item of unlabeled.sort((a, b) => a.file.localeCompare(b.file))) {
    process.stdout.write(`  ${item.file} ... `)
    const r = await searchOne(item.path)
    if (r.error) {
      console.log(`ERROR ${r.error}`)
      unlabeledResults.push({ ...item, error: r.error, durationMs: r.durationMs })
      continue
    }
    const top3 = r.results.slice(0, 3)
    const top3Str = top3.map((x) => `${x.project}/${x.name}(${x.similarity.toFixed(3)})`).join(', ')
    console.log(`${r.durationMs}ms`)
    console.log(`            ${top3Str}`)
    unlabeledResults.push({
      file: item.file,
      top5Results: r.results.slice(0, 5),
      durationMs: r.durationMs,
    })
  }

  // --- JSON-Output ---
  await mkdir(OUT_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const outPath = join(OUT_DIR, `baseline_${ts}.json`)
  await writeFile(
    outPath,
    JSON.stringify(
      {
        timestamp: ts,
        searchUrl: SEARCH_URL,
        summary: {
          total: n,
          errors: counts.errors,
          top1: counts.top1,
          top3: counts.top3,
          top5: counts.top5,
          top1Pct: n ? +((100 * counts.top1) / n).toFixed(1) : null,
          top3Pct: n ? +((100 * counts.top3) / n).toFixed(1) : null,
          top5Pct: n ? +((100 * counts.top5) / n).toFixed(1) : null,
        },
        perFolder,
        labeledResults,
        unlabeledResults,
      },
      null,
      2,
    ),
  )
  console.log(`\nGespeichert: ${outPath}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
