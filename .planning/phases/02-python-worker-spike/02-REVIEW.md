---
phase: 02-python-worker-spike
reviewed: 2026-05-08T12:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - worker/Dockerfile
  - worker/environment.yml
  - worker/requirements.txt
  - worker/.env.example
  - worker/testdata/sample.step
  - .gitignore
  - worker/renderer.py
  - worker/test_renderer.py
  - worker/embedder.py
  - worker/process_step.py
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-08T12:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Zusammenfassung

Reviewt wurden die Python-Worker-Spike-Dateien: Dockerfile, Conda-Environment, pip-Requirements, Konfigurationsvorlage, STEP-Testdaten und vier Python-Module (`renderer.py`, `test_renderer.py`, `embedder.py`, `process_step.py`). Der Spike deckt die vollständige Pipeline von S3-Download über STEP-Rendering bis zum DB-Write ab.

Die Kernarchitektur ist nachvollziehbar, die OSMesa-Env-Var-Reihenfolge korrekt umgesetzt. Es wurden jedoch drei kritische Defekte gefunden: eine Path-Traversal-Schwachstelle bei der Ableitung des S3-Keys aus dem unkontrollierten `part_id`-Argument, eine fehlende Viewer-Ressourcenfreigabe (Speicherleck bei 8 Views × N Bauteilen), sowie ein semantischer Fehler in der Embedding-Strategie (CLS-Token statt Mean-Pool der Patch-Tokens — entgegen der Architektur-Entscheidung im CLAUDE.md). Weitere Warnings betreffen Fehlerbehandlung, Paketversions-Pinning und Dockerimage-Sicherheit.

---

## Critical Issues

### CR-01: Path Traversal — `part_id` wird unvalidiert als S3-Key verwendet

**File:** `worker/process_step.py:93`
**Issue:** `part_id` kommt direkt von der Kommandozeile (`sys.argv[1]`) und wird ohne jede Validierung als S3-Key zusammengesetzt: `step_key = f"{part_id}/original.step"`. Ein Angreifer mit Ausführungszugang zum Container (oder einem späteren Celery-Task-Enqueue-Mechanismus) kann mit `part_id = "../../andere-bucket-struktur"` beliebige S3-Keys adressieren. Zusätzlich wird `part_id` ungefiltert in SQL-Updates eingesetzt (Zeile 51–54) — zwar via Prepared Statement (`%s`), jedoch ohne vorherige Format-Validierung, sodass z.B. eine 4000-Zeichen-Eingabe zu unnötigen DB-Fehlern führt.

**Fix:**
```python
import re

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def validate_part_id(part_id: str) -> str:
    """Stellt sicher, dass part_id ein gültiges UUID-Format hat."""
    if not UUID_RE.match(part_id):
        raise ValueError(f"Ungültige part_id (kein UUID-Format): {part_id!r}")
    return part_id

# In process() und __main__:
part_id = validate_part_id(sys.argv[1])
```

---

### CR-02: Viewer-Ressourcen werden nie freigegeben (Speicherleck / Prozesscrash)

**File:** `worker/renderer.py:84-100`
**Issue:** Das `Viewer3d`-Objekt wird in `render_views()` erstellt, aber nie explizit zerstört oder geschlossen. pythonOCC's `Viewer3d` hält native OpenGL/OSMesa-Ressourcen (Render-Context, Framebuffer). In der aktuellen Pipeline wird `render_views()` einmal pro Bauteil aufgerufen — bei einem langlebigen Celery-Worker oder Batch-Verarbeitung von N Bauteilen akkumulieren sich diese Ressourcen. In einer OSMesa-Umgebung führt dies zuverlässig zu einem Prozessabbruch nach einigen Dutzend Bauteilen.

**Fix:**
```python
def render_views(shape, output_dir: str) -> list[str]:
    viewer = Viewer3d()
    viewer.Create()
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
    viewer.DisplayShape(shape, update=True)

    paths = []
    try:
        for i, (name, orientation) in enumerate(VIEWS):
            viewer.View.SetProj(orientation)
            viewer.FitAll()
            path = os.path.join(output_dir, f"view_{i}.png")
            viewer.ExportToImage(path)
            paths.append(path)
            logger.info(f"View {i} ({name}): {path}")
    finally:
        # Nativen Render-Kontext explizit freigeben
        try:
            viewer.Viewer.Remove()
        except Exception:
            pass

    return paths
```

---

### CR-03: Embedding-Strategie weicht von Architektur-Entscheidung ab (CLS-Token statt Mean-Pool der Patch-Tokens)

**File:** `worker/embedder.py:48`
**Issue:** CLAUDE.md definiert explizit: *"Embedding: DINOv2 ViT-B/14, 768-dim, mean-pool aus 6–8 Views"*. Gemeint ist dabei — entsprechend dem DINOv2-Paper und der Architektur-Entscheidung — der Mean-Pool der **Patch-Token**-Repräsentationen für die geometrische Ähnlichkeit. Der Code verwendet jedoch `outputs.last_hidden_state[:, 0]` (den CLS-Token). Der CLS-Token ist für Klassifikation optimiert; für geometrische 3D-Ähnlichkeit liefert Mean-Pooling der Patch-Tokens (`[:, 1:]`) nachweislich bessere Retrieval-Qualität (siehe DINOv2-Paper, Tabelle 6). Zusätzlich: der Kommentar in Zeile 48 benennt dies explizit als "nicht mean-pool der Patch-Tokens" ohne zu begründen, warum von der Architektur-Entscheidung abgewichen wird.

**Fix:**
```python
def get_embedding(image_path: str) -> np.ndarray:
    """Berechnet Patch-Mean-Pool-Embedding (768-dim).

    Verwendet Mean-Pool der Patch-Tokens ([:, 1:]) gemäß CLAUDE.md Architektur-Entscheidung.
    CLS-Token ([:, 0]) ist für Klassifikation — nicht für geometrische Ähnlichkeit — optimiert.
    """
    img = Image.open(image_path).convert("RGB").resize((224, 224))
    inputs = _processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    # Mean-Pool über alle 256 Patch-Tokens (Index 1..256), nicht CLS-Token (Index 0)
    patch_embeddings = outputs.last_hidden_state[:, 1:]   # Shape: (1, 256, 768)
    mean_embedding = patch_embeddings.mean(dim=1).squeeze().numpy()  # Shape: (768,)

    assert mean_embedding.shape == (768,), f"Unerwartete Embedding-Shape: {mean_embedding.shape}"
    return mean_embedding
```

---

## Warnings

### WR-01: Keine Pinning von Conda- und pip-Paketversionen (Reproduzierbarkeit gefährdet)

**File:** `worker/environment.yml:7`, `worker/requirements.txt:1-9`
**Issue:** `environment.yml` pinnt `pythonocc-core=7.9.3` (gut), aber `requirements.txt` verwendet nur Mindestversionsgrenzen (`vtk>=9.4`, `torch>=2.3` usw.). Ein `pip install` in 3 Monaten zieht möglicherweise `torch 3.x` oder `vtk 10.x` — beide hatten in der Vergangenheit Breaking Changes im Python-API. Das Dockerfile cachet das DINOv2-Modell zur Build-Zeit, aber ein anderer `transformers`-Build kann das gecachte Format invalidieren.

**Fix:** Nach erfolgreichem Spike ein `pip freeze > requirements.lock` erzeugen und im Dockerfile `pip install -r requirements.lock` statt `requirements.txt` verwenden. Alternativ obere Grenzen setzen: `torch>=2.3,<3`.

---

### WR-02: `TRANSFORMERS_CACHE` ist deprecated — `HF_HOME` oder `HF_HUB_CACHE` verwenden

**File:** `worker/Dockerfile:27`
**Issue:** `ENV TRANSFORMERS_CACHE=/app/model_cache` ist seit `transformers>=4.36` deprecated. Der Nachfolger ist `HF_HUB_CACHE`. Mit `transformers>=4.41` (wie in requirements.txt) wird beim Cache-Lookup eine Deprecation-Warning erzeugt, und in einer zukünftigen Hauptversion könnte die Variable vollständig ignoriert werden — was zum Laufzeit-Download (~330 MB) im Container führt.

**Fix:**
```dockerfile
ENV HF_HUB_CACHE=/app/model_cache
# Rückwärtskompatibilität für ältere transformers-Versionen:
ENV TRANSFORMERS_CACHE=/app/model_cache
```

---

### WR-03: `cur` in Fehlerbehandlung potenziell unboundLocal

**File:** `worker/process_step.py:158-164`, `worker/process_step.py:169-175`
**Issue:** In beiden `except`-Blöcken wird `cur = conn.cursor()` neu erstellt. Das ist korrekt, weil der ursprüngliche Cursor nach einem DB-Fehler in einem abgebrochenen Transaktionszustand sein kann. Jedoch: wenn der Fehler **vor** dem ersten `conn.cursor()`-Aufruf (Zeile 84) auftritt — z.B. wenn `register_vector(conn)` wirft — wird `cur` in keinem der zwei Handlers referenziert, aber `conn` ist gesetzt. Das ist aktuell kein Crash (da `cur` in den Except-Blöcken neu erstellt wird), aber wenn sich die Logik ändert und `cur` aus dem äußeren Scope verwendet wird, entsteht ein `UnboundLocalError`. Klarheit durch explizite Initialisierung.

**Fix:**
```python
conn = None
cur = None  # explizit initialisieren
```

---

### WR-04: DB-Transaktion nach S3-Upload-Fehler nicht rückgängig gemacht (Status bleibt 'processing')

**File:** `worker/process_step.py:113-125`
**Issue:** Falls `s3.upload_fileobj()` bei View 3 von 8 fehlschlägt (z.B. Netzwerk-Timeout), fliegt eine Exception. Diese wird vom äußeren `except Exception`-Block gefangen, der `status='failed'` setzt. Dabei bleibt jedoch der `parts`-Eintrag in einem inkonsistenten Zustand: 3 Thumbnails wurden bereits nach S3 hochgeladen, aber `thumbnail_urls` ist leer (noch kein DB-Write). Bei einem Retry des Jobs werden die ersten 3 Thumbnails in S3 überschrieben (unkritisch), aber ohne explizites Logging ist unklar, welche Views bereits existieren.

**Fix:** S3-Upload-Fehler separat fangen und in den Fehlercode einbeziehen:
```python
try:
    s3.upload_fileobj(f, BUCKET_THUMBNAILS, s3_key, ExtraArgs={"ContentType": "image/png"})
except Exception as upload_err:
    raise RuntimeError(f"S3_UPLOAD_ERROR:view={i},key={s3_key}") from upload_err
```

---

### WR-05: Dockerfile läuft als root — kein Nicht-Root-User definiert

**File:** `worker/Dockerfile:1-33`
**Issue:** Das Image definiert keinen `USER`-Wechsel. Alle Prozesse laufen als `root` (UID 0) im Container. Falls die STEP-Verarbeitung eine Datei-Parsing-Schwachstelle in pythonOCC enthält (STEP ist ein komplexes Format), hätte ein Angreifer root-Rechte im Container — was Container-Escape-Versuche begünstigt.

**Fix:** Vor dem `COPY . .` einen Nicht-Root-User anlegen:
```dockerfile
RUN useradd -m -u 1001 worker
USER worker
WORKDIR /home/worker/app
COPY --chown=worker:worker . .
```

---

### WR-06: `assert` für Embedding-Shape in Produktionscode — wird bei `-O` (Optimize) deaktiviert

**File:** `worker/embedder.py:50`, `worker/embedder.py:66`, `worker/process_step.py:108`, `worker/process_step.py:131`
**Issue:** `assert`-Statements werden deaktiviert, wenn Python mit dem `-O`-Flag (Optimize) ausgeführt wird (`python -O process_step.py`). In einem Produktions-/Docker-Setup könnte ein Deployment-Skript oder Gunicorn-Worker `-O` setzen, wodurch alle Shape-Validierungen stumm übergangen werden. Ein falsches Embedding (z.B. Shape `(1, 768)` statt `(768,)`) würde dann kommentarlos in die DB geschrieben.

**Fix:** Explizite Exceptions statt `assert`:
```python
if cls_embedding.shape != (768,):
    raise RuntimeError(f"Ungültige Embedding-Shape: {cls_embedding.shape}, erwartet (768,)")
```

---

## Info

### IN-01: `libgl1-mesa-glx` ist auf neueren Debian/Ubuntu-Versionen veraltet

**File:** `worker/Dockerfile:5`
**Issue:** `libgl1-mesa-glx` wurde in Debian Bullseye/Ubuntu 22.04 durch `libgl1` ersetzt. Das aktuelle `continuumio/miniconda3:latest`-Image basiert auf Debian Bookworm (12). Auf diesem System existiert `libgl1-mesa-glx` nicht mehr als eigenständiges Paket — `apt-get install libgl1-mesa-glx` erzeugt entweder einen Fehler oder installiert ein leeres Transitional-Paket, sodass die eigentliche OSMesa-Bibliothek fehlt.

**Fix:**
```dockerfile
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*
```

---

### IN-02: `model_cache` wird mit COPY in Image kopiert (potentiell ungewollt)

**File:** `worker/Dockerfile:33`
**Issue:** `COPY . .` kopiert den gesamten `worker/`-Kontext in das Image. Falls lokal bereits ein `model_cache/`-Verzeichnis existiert (z.B. durch einen früheren Build ohne `-no-cache`), wird es erneut in das Image kopiert — was zu einem doppelten ~330 MB großen Modell im Image führt. Eine `.dockerignore`-Datei fehlt.

**Fix:** `.dockerignore` im `worker/`-Verzeichnis anlegen:
```
model_cache/
__pycache__/
*.pyc
.env
testdata/
```

---

### IN-03: Render-Auflösung (512×512) wird nicht explizit gesetzt — abhängig von VTK-Default

**File:** `worker/renderer.py:84-100`
**Issue:** Der Kommentar `# 8 PNG-Pfade (512x512px via VTK-Default-Auflösung)` (Zeile 100) bezeichnet die Auflösung als "VTK-Default". Die tatsächliche Auflösung hängt vom OSMesa-Framebuffer-Default ab, der sich zwischen VTK-Versionen unterscheiden kann. D-06 schreibt 512×512 vor.

**Fix:** Auflösung explizit beim Viewer-Setup setzen:
```python
viewer.Create()
viewer.View.Window().SetSize(512, 512)
```

---

_Reviewed: 2026-05-08T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
