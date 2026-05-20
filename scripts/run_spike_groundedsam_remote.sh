#!/usr/bin/env bash
# scripts/run_spike_groundedsam_remote.sh — Führt den GroundedSAM-Spike auf dem
# Produktionsserver aus (kein Docker lokal nötig). Lädt Script + Referenzfotos
# hoch, startet den Spike im laufenden Worker-Container, holt die PNG-Panels und
# summary.json zurück nach eval/spike_results/.
#
# Voraussetzungen:
#   - SSH-Zugriff auf den Server
#   - Worker-Stack läuft dort (docker compose up -d)
#   - SERVER und REPO_REMOTE als Env-Variablen gesetzt (s.u.)
#
# WARNUNG: Worker-Concurrency = 1 — während der Spike läuft (ca. 30–90 s)
#          ist /embed blockiert. Daher außerhalb der Nutzungszeiten fahren.
#
# Beispielaufruf:
#
#   SERVER=user@objekt.bielingserver.de \
#   REPO_REMOTE=/opt/objekterkennung \
#   scripts/run_spike_groundedsam_remote.sh
#
# Optionale Env-Variablen:
#   REF_LOCAL  Lokaler Foto-Ordner. Default: /Users/mbieling/claude/bbs/Bilder/Reverenz
#   N          Stichprobengröße. Default: 3 (erster Lauf), später z.B. 8 setzen.
#   PROMPT     Grounding-DINO-Prompt. Default: aus dem Spike-Script.

set -euo pipefail

SERVER="${SERVER:-}"
REPO_REMOTE="${REPO_REMOTE:-}"
REF_LOCAL="${REF_LOCAL:-/Users/mbieling/claude/bbs/Bilder/Reverenz}"
N="${N:-3}"
PROMPT="${PROMPT:-}"

if [[ -z "$SERVER" || -z "$REPO_REMOTE" ]]; then
  cat >&2 <<'EOF'
Fehler: SERVER und REPO_REMOTE muessen gesetzt sein.

Beispiel:
  SERVER=user@objekt.bielingserver.de \
  REPO_REMOTE=/opt/objekterkennung \
  scripts/run_spike_groundedsam_remote.sh

Optional:
  REF_LOCAL=/pfad/zu/fotos   (Default: /Users/mbieling/claude/bbs/Bilder/Reverenz)
  N=3                         (Stichprobengroesse, Default 3)
  PROMPT="object . metal part . component ."
EOF
  exit 1
fi

if [[ ! -d "$REF_LOCAL" ]]; then
  echo "Fehler: REF_LOCAL nicht gefunden: $REF_LOCAL" >&2
  exit 2
fi

if [[ ! -f scripts/spike_groundedsam.py ]]; then
  echo "Fehler: scripts/spike_groundedsam.py nicht gefunden — vom Repo-Root ausfuehren." >&2
  exit 3
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="eval/spike_results/groundedsam_${TS}"
mkdir -p "$OUT_DIR"

SPIKE_FLAGS="--n $N"
if [[ -n "$PROMPT" ]]; then
  # Prompt enthaelt Punkte/Spaces — single-quote im Remote-Shell
  SPIKE_FLAGS="$SPIKE_FLAGS --prompt '$PROMPT'"
fi

echo "==> SERVER       : $SERVER"
echo "==> REPO_REMOTE  : $REPO_REMOTE"
echo "==> REF_LOCAL    : $REF_LOCAL"
echo "==> OUT_DIR      : $OUT_DIR"
echo "==> Stichprobe   : N=$N"
[[ -n "$PROMPT" ]] && echo "==> Prompt       : $PROMPT"
echo ""

echo "==> [1/4] Script + Referenzfotos hochladen ..."
scp -q scripts/spike_groundedsam.py "$SERVER:/tmp/spike.py"
ssh "$SERVER" "rm -rf /tmp/refs && mkdir -p /tmp/refs"
rsync -av \
  --include='*/' \
  --include='*.jpg' --include='*.jpeg' --include='*.JPG' --include='*.JPEG' \
  --include='*.png' --include='*.PNG' \
  --exclude='*' \
  "$REF_LOCAL/" "$SERVER:/tmp/refs/"

echo ""
echo "==> [2/4] Spike im Worker-Container ausfuehren ..."
echo "    Achtung: /embed ist waehrend dieser Phase blockiert."
ssh "$SERVER" "cd '$REPO_REMOTE' && \
  docker compose cp /tmp/spike.py worker:/tmp/spike.py && \
  docker compose exec -T worker rm -rf /tmp/refs /tmp/spike_out && \
  docker compose cp /tmp/refs worker:/tmp/refs && \
  docker compose exec -T worker python /tmp/spike.py /tmp/refs /tmp/spike_out $SPIKE_FLAGS"

echo ""
echo "==> [3/4] Output zurueckholen ..."
ssh "$SERVER" "cd '$REPO_REMOTE' && rm -rf /tmp/spike_out_host && docker compose cp worker:/tmp/spike_out /tmp/spike_out_host"
scp -q -r "$SERVER:/tmp/spike_out_host/." "$OUT_DIR/"

echo ""
echo "==> [4/4] Aufraeumen (Server) ..."
ssh "$SERVER" "rm -rf /tmp/refs /tmp/spike.py /tmp/spike_out_host && \
  cd '$REPO_REMOTE' && docker compose exec -T worker rm -rf /tmp/refs /tmp/spike_out /tmp/spike.py"

echo ""
echo "Fertig."
echo "  Vergleichsbilder : $OUT_DIR/compare_*.png"
echo "  Statistiken      : $OUT_DIR/summary.json"
