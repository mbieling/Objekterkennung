#!/usr/bin/env python3
"""scripts/shape_calibration.py — Misst die Cosine-Verteilung der Shape-Embeddings
im aktuellen Korpus, damit wir SHAPE_FAIL_SIM / SHAPE_PERFECT_SIM datengetrieben
kalibrieren können (statt der ungeprüften Paper-Annahme "cosine ≈ 0 für random pairs").

Ausführen im Worker-Container (hat psycopg2 + Korpus-Zugriff):

    docker compose cp scripts/shape_calibration.py worker:/tmp/cal.py
    docker compose exec worker python /tmp/cal.py

Output:
  1. Verteilungs-Statistiken der paarweisen Cosines (n, mean, p10, p50, p90)
  2. Pro Teil: 3 nächste + 3 fernste Nachbarn — zeigt, ob das Modell echt diskriminiert
  3. Konkrete Empfehlung für SHAPE_FAIL_SIM (≈ p25 der inter-cluster-Verteilung) und
     SHAPE_PERFECT_SIM (≈ p75 der intra-cluster-Verteilung, wenn wir Cluster ableiten können)

Wir nutzen die Projektnummer (im part_number Suffix) als Proxy für Form-Familie —
imperfekt aber für eine erste Kalibrierung ausreichend.
"""

import os
import re
import numpy as np
import psycopg2


def parse_vector(s: str | None) -> np.ndarray | None:
    if not s:
        return None
    s = s.strip()
    if not (s.startswith("[") and s.endswith("]")):
        return None
    try:
        return np.array([float(x) for x in s[1:-1].split(",")], dtype=np.float32)
    except Exception:
        return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


def percentile(values: list[float], p: float) -> float:
    return float(np.percentile(values, p)) if values else 0.0


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""
        SELECT id, part_number, project, shape_embedding::text
        FROM parts
        WHERE status = 'ready' AND shape_embedding IS NOT NULL
        ORDER BY part_number
    """)
    rows = cur.fetchall()
    conn.close()

    parts = []
    for pid, part_number, project, emb_str in rows:
        emb = parse_vector(emb_str)
        if emb is None:
            continue
        parts.append({
            "id": pid,
            "part_number": part_number or pid[:8],
            "project": project or "?",
            "emb": emb,
        })

    n = len(parts)
    print(f"Korpus: {n} Teile mit Shape-Embedding\n")
    if n < 2:
        print("Zu wenige Teile für Statistik.")
        return

    # Alle paarweisen Cosines (n*(n-1)/2 Paare)
    pairs = []        # (i, j, cosine, same_project)
    for i in range(n):
        for j in range(i + 1, n):
            c = cosine(parts[i]["emb"], parts[j]["emb"])
            same_proj = parts[i]["project"] == parts[j]["project"]
            pairs.append((i, j, c, same_proj))

    all_cos = [p[2] for p in pairs]
    intra = [p[2] for p in pairs if p[3]]   # gleiche Projekt-Familie
    inter = [p[2] for p in pairs if not p[3]]  # verschiedene Familien

    print("=== Verteilung paarweiser Shape-Cosines ===")
    print(f"  Alle Paare   (n={len(all_cos):4d}):  "
          f"min={min(all_cos):.3f}  p10={percentile(all_cos,10):.3f}  "
          f"p50={percentile(all_cos,50):.3f}  p90={percentile(all_cos,90):.3f}  max={max(all_cos):.3f}")
    if intra:
        print(f"  Gleiche Familie (n={len(intra):4d}):  "
              f"min={min(intra):.3f}  p10={percentile(intra,10):.3f}  "
              f"p50={percentile(intra,50):.3f}  p90={percentile(intra,90):.3f}  max={max(intra):.3f}")
    if inter:
        print(f"  Andere Familie  (n={len(inter):4d}):  "
              f"min={min(inter):.3f}  p10={percentile(inter,10):.3f}  "
              f"p50={percentile(inter,50):.3f}  p90={percentile(inter,90):.3f}  max={max(inter):.3f}")

    # Pro Teil: 3 nächste + 3 fernste Shape-Nachbarn — zeigt Diskriminationsfähigkeit
    print("\n=== Pro Teil: 3 nächste / 3 fernste Shape-Nachbarn ===")
    for i, p in enumerate(parts):
        sims = []
        for j in range(n):
            if i == j:
                continue
            sims.append((parts[j]["part_number"], parts[j]["project"], cosine(p["emb"], parts[j]["emb"])))
        sims.sort(key=lambda x: -x[2])
        nearest = sims[:3]
        farthest = sims[-3:]
        print(f"\n  {p['part_number']:14s} (Projekt {p['project']})")
        print(f"    NÄCHSTE:  " + "  ".join(f"{pn}({pr})={c:.3f}" for pn, pr, c in nearest))
        print(f"    FERNSTE:  " + "  ".join(f"{pn}({pr})={c:.3f}" for pn, pr, c in farthest))

    # Empfehlung
    print("\n=== Empfehlung für Re-Ranker-Schwellen ===")
    if inter and intra:
        # SHAPE_FAIL_SIM: ab hier definitiv andere Familie. Nehmen wir p75 von inter
        # (75% der inter-Paare sind ≤ diesem Wert).
        fail_sim = percentile(inter, 75)
        # SHAPE_PERFECT_SIM: ab hier definitiv gleiche Familie. Nehmen wir p25 von intra.
        perf_sim = percentile(intra, 25)
        if fail_sim >= perf_sim:
            # Distributionen überlappen zu stark — Modell diskriminiert in unserer Domäne nicht
            print(f"  WARNUNG: Inter-Familie p75 ({fail_sim:.3f}) >= Intra-Familie p25 ({perf_sim:.3f})")
            print(f"  Das Shape-Modell trennt Familien in unserer Domäne nur schwach.")
            print(f"  Vorschlag: Re-Ranker sehr konservativ halten (SHAPE_MIN_FACTOR ≥ 0.95) oder abschalten.")
        else:
            print(f"  Empfohlen: SHAPE_FAIL_SIM = {fail_sim:.3f}, SHAPE_PERFECT_SIM = {perf_sim:.3f}")
            print(f"  (basierend auf inter-p75 / intra-p25; Lücke = {perf_sim-fail_sim:.3f})")
    else:
        print("  Keine Projekt-Cluster vorhanden — Schwellen-Empfehlung nicht möglich.")


if __name__ == "__main__":
    main()
