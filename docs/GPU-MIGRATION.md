# GPU-Migration: vom CPU-Worker zum GPU-Worker

Anleitung für den Umstieg auf einen Server mit NVIDIA-GPU. Aktivieren wird damit:
- **Hebel 4** (Shape Foundation Model) — auf CPU strukturell unzuverlässig (hängt), auf GPU zuverlässig
- **DINOv3-Beschleunigung** — Such-Latenz fällt von ~20 Sek auf <1 Sek pro Anfrage

Der CPU-Code-Stand bleibt erhalten. GPU ist eine additive Variante über separate Dockerfile + compose-override — kein Code muss verändert werden.

---

## 1) Hardware-Anforderungen

| Komponente | Minimal | Empfohlen |
|------------|---------|-----------|
| GPU | RTX 3060 / 4060 (8 GB VRAM) | RTX 4000 Ada SFF (20 GB) |
| CUDA-Driver | ≥ 545 (CUDA 12.4-kompatibel) | aktueller stable |
| RAM | 16 GB | 32 GB |
| Storage | 50 GB (Models + Container) | 100 GB |

**Konkrete Hetzner-Optionen (Stand Anfang 2026, Preise prüfen):**
- **GEX44** — RTX 4000 SFF Ada (20 GB VRAM), ~180 €/Monat. Sweet-Spot für unseren Use-Case.
- **Server Auctions** — sporadisch GPU-Server unter 100 €/Monat. Verfügbarkeit nicht garantiert.

**Cloud-on-demand-Alternative** (wenn Uploads selten):
- **Runpod.io** — RTX 4090, ~$0,35/Stunde, nur bei Reindex-Bedarf hochfahren

---

## 2) Host-Setup (einmalig)

Auf dem GPU-Server vor dem ersten Build:

```bash
# NVIDIA-Container-Toolkit installieren (Ubuntu/Debian)
distribution=$(. /etc/os-release && echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# Docker-Runtime konfigurieren
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verifizieren — sollte deine GPU + Driver listen
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

---

## 3) Code-Migration

Im Repo gibt es bereits vorbereitet:
- `worker/Dockerfile.gpu` — CUDA-Base-Image, torch+CUDA-Wheels, Shape-Stack standardmäßig **aktiv**
- `docker-compose.gpu.yml` — Override-File mit nvidia runtime + GPU-Device-Request + `SHAPE_DISABLE=0`

**Build + Deploy:**

```bash
cd /opt/containers/objekterkennung
git pull origin main

# Image bauen — HF_TOKEN wird für DINOv3 pre-download durchgereicht
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build \
    --build-arg HF_TOKEN="$(grep '^HF_TOKEN=' worker/.env | cut -d= -f2)" \
    worker

# Container ersetzen (mit GPU-Runtime)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d worker

# Verifizieren
docker compose exec worker python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
```

Erwartet: `CUDA: True NVIDIA RTX 4000 Ada Generation` (oder analog).

---

## 4) Reindex mit Shape-Embeddings

```bash
# Alle Teile zurücksetzen
docker exec db-postgresql psql -U postgres -d bauteil_finder \
    -c "UPDATE parts SET status='ready', shape_embedding=NULL WHERE status IN ('ready','processing','failed')"

# Reindex — diesmal mit aktivem Shape-Modell, schnell und ohne Hänger
docker compose exec worker python -m worker.reindex 2>&1 | tee /tmp/reindex_gpu.log

# Bilanz
grep -c "Shape-Embedding berechnet" /tmp/reindex_gpu.log
docker exec db-postgresql psql -U postgres -d bauteil_finder \
    -c "SELECT count(*) FILTER (WHERE shape_embedding IS NOT NULL) AS with_shape, count(*) FROM parts WHERE status='ready'"
```

Erwartet: alle 28 Teile mit Shape-Embedding, Reindex-Dauer ~3-5 Min total.

---

## 5) Re-Ranker tunen + Eval

Beim ersten Live-Test wird sich zeigen, ob die Shape-Cosines diskriminieren. Falls ja:
- Default-Schwellen in `src/app/api/search/route.ts` (`SHAPE_PERFECT_SIM=0.50`, `SHAPE_FAIL_SIM=0.10`) eventuell anpassen
- Kalibrierungsskript laufen lassen: `docker compose exec worker python /tmp/cal.py` (Skript aus `scripts/shape_calibration.py`)

**Eval-Run:**
```bash
node scripts/eval_baseline.mjs
```

Erwartung: Top-1 sollte mindestens auf CPU-Niveau bleiben (82,8%), idealerweise mit Hebel 4 darüber hinaus (96%+ realistisch wenn Shape-Cosines gut diskriminieren).

---

## 6) Rollback (zurück zur CPU-Variante)

Falls etwas schiefgeht oder die GPU mal nicht verfügbar ist:

```bash
# Container ohne GPU-Override starten — fällt zurück auf CPU-Dockerfile
docker compose up -d worker

# In worker/.env: SHAPE_DISABLE=1 setzen (deaktiviert Hebel 4 für CPU-Lauf)
echo "SHAPE_DISABLE=1" >> worker/.env
docker compose restart worker
```

Der Code ist so geschrieben, dass DB-Spalte `shape_embedding` einfach NULL bleibt — Re-Ranker macht dann keinen Beitrag, restliche Hebel laufen wie vor der GPU-Migration weiter.

---

## 7) Bekannte Stolperfallen

- **torch-Version-Pin**: `Dockerfile.gpu` pinnt torch auf 2.9.1+cu124, weil PyG nur Wheels bis 2.9.1 anbietet. Falls neuere torch nötig: PyG-Wheel-Verfügbarkeit prüfen unter https://data.pyg.org/whl/
- **HF_TOKEN beim Build**: muss vorhanden sein, sonst DINOv3-Download im Build silent fehlschlagen. Bei missing token: zweimal `docker compose ... up` (zweiter Start lädt zur Laufzeit nach).
- **OCC-Tessellation + GPU**: trimesh STEP-Loading läuft trotzdem auf CPU (kein GPU-Code-Path). Vorteil GPU: das nachfolgende Shape-Modell-Inference ist sehr schnell. Der `SHAPE_MAX_FACES=1000`-Filter in `process_step.py` kann auf GPU auf ein viel höheres Limit gesetzt werden (z.B. 10000) oder ganz raus.
