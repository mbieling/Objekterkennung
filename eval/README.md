# Such-Evaluation

Wiederholbares Mess-Tool für die Bauteil-Foto-Suche. Jagt einen festen Satz Referenzfotos durch `POST /api/search` und berechnet Top-1/Top-3/Top-5-Trefferquote gegen die erwartete `project`-Nummer.

## Wozu

Modell- oder Render-Änderungen sollen messbar besser sein, nicht nur „fühlt sich besser an". Das Skript liefert konkrete Prozentzahlen, gegen die jeder Optimierungsschritt verteidigen muss.

## Aufrufen

```bash
node scripts/eval_baseline.mjs
```

Ausgabe: Konsolen-Report + JSON-Snapshot unter `eval/results/baseline_<timestamp>.json`.

### Konfiguration via Env-Vars

| Variable | Default | Bedeutung |
|---|---|---|
| `REF_DIR` | `/Users/mbieling/claude/bbs/Bilder/Reverenz` | Wurzel des Referenzfoto-Ordners (siehe Struktur unten) |
| `SEARCH_BASE_URL` | `https://objekt.bielingserver.de` | Basis-URL der zu testenden Such-API (lokal z.B. `http://localhost:3000`) |

Beispiel — lokaler Dev-Server, alternativer Foto-Ordner:

```bash
SEARCH_BASE_URL=http://localhost:3000 \
REF_DIR=/pfad/zu/anderen/fotos \
node scripts/eval_baseline.mjs
```

## Referenzfoto-Struktur

Die Fotos selbst sind **bewusst nicht im Repo** (Eigentum des Kunden, viele MB pro Bild). `REF_DIR` muss lokal so aussehen:

```
REF_DIR/
├── 4770/              # Ordnername = parts.project ohne führende Nullen
│   ├── IMG_XXXX.jpg   # Fotos, die das Teil aus Projekt 4770 zeigen
│   └── …
├── 4910/
│   └── …
├── 4973/
│   └── …
├── 4973-1/            # geometrisch identisch zu 4973, abweichende Farbe → gleicher Match-Set
│   └── …
└── IMG_YYYY.jpg       # Lose Fotos im Wurzelverzeichnis = Open-Set-Queries
                       # (keine Ground Truth, nur qualitativ ausgewertet)
```

Ordner-zu-Projekt-Mapping wird im Skript in `PROJECT_MAP` gepflegt. Bei neuen Projekten dort eintragen — der DB-Wert in `parts.project` hat **führende Nullen** (`004770`), der Ordnername **nicht** (`4770`). Das Mapping kümmert sich darum.

## Output-JSON

```jsonc
{
  "timestamp": "...",
  "searchUrl": "https://.../api/search?threshold=0&limit=10",
  "summary": {
    "total": 29, "errors": 0,
    "top1": 26, "top3": 26, "top5": 29,
    "top1Pct": 89.7, "top3Pct": 89.7, "top5Pct": 100.0
  },
  "perFolder": {
    "4770":   { "total": 9, "top1": 9, "top3": 9, "top5": 9 },
    "4910":   { … },
    "4973":   { … },
    "4973-1": { … }
  },
  "labeledResults":   [ /* pro Foto: rank, top5Results, durationMs */ ],
  "unlabeledResults": [ /* Open-Set-Queries */ ]
}
```

## Bisherige Messpunkte

| Datei | Stand | Modell | Views | Top-1 | Top-3 | Top-5 |
|---|---|---|---|---|---|---|
| `baseline_2026-05-14T04-33-54-595.json` | Ausgangslage, Farb-Embedding | DINOv2-base (768-dim) | 6 Ortho + 2 Iso | 82,8% | 96,6% | 100% |
| `baseline_2026-05-14T04-53-54-038.json` | Graustufen-Experiment (verworfen) | DINOv2-base | 6 Ortho + 2 Iso | 72,4% | 100% | 100% |
| `baseline_2026-05-14T05-28-59-657.json` | 16 Fibonacci-Sphere-Views | DINOv2-base | 16 Fibonacci | 89,7% | 89,7% | 100% |
| `baseline_2026-05-14T05-57-29-317.json` | **Aktueller Stand:** DINOv2-large + 16 Fibonacci | **DINOv2-large (1024-dim)** | 16 Fibonacci | **93,1%** | **100%** | **100%** |

## Wichtige Einschränkungen

1. **Aktuell nur 5 Teile in der DB.** Bei N=5 und Top-5 ist 100% trivial. Die Eval hat erst echte Aussagekraft, wenn der Katalog auf 50–100+ Teile wächst.
2. **Folder-Mapping geht von der Annahme aus**, dass alle Fotos in einem Folder zu Teilen mit derselben `parts.project`-Nummer gehören. Wenn das in Zukunft nicht mehr stimmt (z.B. mehrere Teile im selben Ordner aus unterschiedlichen Projekten), muss `PROJECT_MAP` granularer werden.
3. **4973 vs. 4973-1**: aktuell als ein Match-Set behandelt (geometrisch identisch, nur Farbe unterscheidet sich). Wenn das Projekt später echte Farb-Diskriminierung braucht, muss das Mapping aufgesplittet werden.
4. **Network-Eval, keine isolierten Embeddings.** Wenn die API mal nicht antwortet, fließen `errors` ins Ergebnis ein — das ist kein Modell-Problem, sondern Infrastruktur.

## Wann wieder laufen lassen

- Nach jeder Renderer-, Preprocess- oder Embedder-Änderung — Vorher/Nachher dokumentieren
- Nach jedem größeren DB-Wachstum (alle 50–100 neue Teile)
- Vor und nach pgvector-Schema-Migrationen (z.B. Wechsel auf DINOv2-large mit `vector(1024)`)
