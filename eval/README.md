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
| `baseline_2026-05-14T05-57-29-317.json` | DINOv2-large + 16 Fibonacci | DINOv2-large (1024-dim) | 16 Fibonacci | 93,1% | 100% | 100% |
| `baseline_2026-05-14T06-51-11-170.json` | DINOv3 ViT-L/16 + 16 Fibonacci | DINOv3 ViT-L/16 (1024-dim) | 16 Fibonacci | 100% | 100% | 100% |
| `baseline_2026-05-14T08-38-43-485.json` | Korpus auf 28 Teile, self-hosted PostgreSQL | DINOv3 ViT-L/16 | 16 Fibonacci | 100% | 100% | 100% |
| `baseline_2026-05-17T06-42-02-057.json` | Hebel 1+2+3 NOCH NICHT aktiv — reine DINOv3-MAX-per-Part (Vor-Hebel-Stand) | DINOv3 ViT-L/16 | 16 Fibonacci | 96,6% | 100% | 100% |
| `baseline_2026-05-17T12-26-37-662.json` | Hebel 1+2+3 aktiviert (GEO_MIN_FACTOR=0.70, COMBINED_W_HITS=0.40); Hebel 4 deaktiviert | DINOv3 ViT-L/16 + Re-Ranker | 16 Fibonacci | 82,8% | 89,7% | 93,1% |
| `baseline_2026-05-20T19-08-45-622.json` | A/B-Test 1: GEO_MIN_FACTOR=1.0 (Geo-Re-Rank effektiv aus) | DINOv3 ViT-L/16 + Konsens-Re-Ranker | 16 Fibonacci | 93,1% | 96,6% | 100% |
| `baseline_2026-05-20T19-17-27-841.json` | A/B-Test 2: + COMBINED_W_HITS=0.15 (Konsens als milder Tiebreaker) | DINOv3 ViT-L/16 + abgeschwaechter Konsens | 16 Fibonacci | 93,1% | 96,6% | 100% |
| `baseline_2026-05-20T19-24-22-512.json` | **Aktueller Stand:** GEO_MIN_FACTOR=1.0, COMBINED_W_HITS=0 (Hebel 2+3a faktisch aus); Hebel 4 deaktiviert | **DINOv3 ViT-L/16, reines MAX-per-Part** | 16 Fibonacci | **96,6%** | **100%** | **100%** |

### Beobachtungen zur Diagnose-Reihe vom 20.05.

Die Annahme der ursprünglichen 17.05.-Notiz, der Top-1-Rückgang von 96,6 % auf 82,8 % komme vom Container-Rebuild (transformers 5.x + numpy 2.4), hat sich als **falsch** herausgestellt. Die Cosine-Similarities zwischen den beiden 17.05.-Läufen sind bit-identisch — die Embeddings waren nicht gewandert. Der echte Verursacher waren die in `f83970a` neu eingeführten Re-Ranker:

- **Hebel 3a (Geo-Re-Rank)** wertete Kandidaten mit "unpassendem" 3D-Bbox-Aspect-Ratio um bis zu 30 % ab (`GEO_MIN_FACTOR = 0.70`). Bei den 4910-Fotos mit niedriger DINOv3-Sim (<0.70) reichte diese Asymmetrie aus, um geometrisch "kompaktere" 4973-Distraktoren mit niedrigerer Sim auf Rang 1 zu drücken. → Mit `GEO_MIN_FACTOR = 1.0` springt 4910 auf 8/8 Top-1 zurück.
- **Hebel 2 (Multi-View-Konsens)** hob über `combined = 0.6·topSim + 0.4·hitsNorm` Kandidaten an, die in vielen Views matchten. Bei IMG_3463 (4770) hatte das richtige Teil P11544 zwar die höchste Sim (0.7510), wurde aber von drei 4973-Distraktoren überholt, die in mehr Views matchten. → Mit `COMBINED_W_HITS = 0` kommt P11544 zurück auf Rang 1. Eine abgeschwächte Variante (`0.15`) reichte nicht: bei großer view_hits-Differenz kippt schon das.
- **Versprochener Nutzen** von Multi-View-Konsens (4973-Cluster gegen 4910-Verwechslungen schützen) ist im aktuellen 28-Teile-Korpus **nicht messbar** — DINOv3 + reines MAX-per-Part bringt diese Cluster schon auf 100 % Top-1 (vgl. `baseline_2026-05-14T08-38-43-485.json`). Konsens kann zurückkommen, sobald ein gewachsener Korpus echte Konflikte zeigt.
- **Verbleibender Miss IMG_3464 (4770)** ist reines DINOv3-Limit: der Distraktor P13395 hat tatsächlich eine höhere Foto-Sim (0.7241) als das richtige Teil P11544 (0.7125). Kein Re-Ranking-Hebel im aktuellen Set kann das beheben — Job einer besseren Embedding-Lösung oder einer zusätzlichen Render-View.
- **Hebel 4 (Shape Foundation Model)** bleibt über `SHAPE_DISABLE=1` deaktiviert: CPU-Inferenz hängt bei verschiedenen STEP-Files unzuverlässig (trimesh-Tessellation in C-Code, kein sauberer Timeout). Code und DB-Spalte bleiben für Reaktivierung mit GPU.
- **Hebel 5 (GroundedSAM-Segmentierung)** ist als optionales Backend in `worker/preprocess.py` implementiert, default off (`SEGMENTATION_BACKEND=rembg`). Spike-Vergleich (`scripts/spike_groundedsam.py`) zeigte: bei klaren Werkstattfotos kein Mehrwert, bei länglichen Teilen mit komplexem Hintergrund deutlich bessere Maske. Latenz auf CPU ~9 s/Foto — produktiv sinnvoll erst nach GPU-Migration.
- **UI-Konfidenz-Banner** (Hebel 1, rein UI) bleibt aktiv: "Mehrere ähnliche Kandidaten — bitte manuell prüfen" wird angezeigt, wenn die Top-1/Top-2-Margin unter Schwelle ist. Ranking-Effekt: null.

## Wichtige Einschränkungen

1. **Aktuell nur 5 Teile in der DB.** Bei N=5 und Top-5 ist 100% trivial. Die Eval hat erst echte Aussagekraft, wenn der Katalog auf 50–100+ Teile wächst.
2. **Folder-Mapping geht von der Annahme aus**, dass alle Fotos in einem Folder zu Teilen mit derselben `parts.project`-Nummer gehören. Wenn das in Zukunft nicht mehr stimmt (z.B. mehrere Teile im selben Ordner aus unterschiedlichen Projekten), muss `PROJECT_MAP` granularer werden.
3. **4973 vs. 4973-1**: aktuell als ein Match-Set behandelt (geometrisch identisch, nur Farbe unterscheidet sich). Wenn das Projekt später echte Farb-Diskriminierung braucht, muss das Mapping aufgesplittet werden.
4. **Network-Eval, keine isolierten Embeddings.** Wenn die API mal nicht antwortet, fließen `errors` ins Ergebnis ein — das ist kein Modell-Problem, sondern Infrastruktur.

## Wann wieder laufen lassen

- Nach jeder Renderer-, Preprocess- oder Embedder-Änderung — Vorher/Nachher dokumentieren
- Nach jedem größeren DB-Wachstum (alle 50–100 neue Teile)
- Vor und nach pgvector-Schema-Migrationen (z.B. Wechsel auf DINOv2-large mit `vector(1024)`)
