# worker/__init__.py
# Pinning der Inferenz-Thread-Anzahl: PyTorch wählt per Default
# `physical_cpu_count // 2` (Hyperthreading-Heuristik) und ignoriert dabei
# OMP_NUM_THREADS. Damit wir die explizit gesetzten Env-Vars (in docker-compose.yml
# auf 8 gepinnt) auch wirklich nutzen, setzen wir torch + intra-op-parallelism
# beim ersten Import explizit.
#
# Wirkt sowohl im FastAPI-Worker als auch im standalone Reindex-Skript, weil
# jedes worker-Submodul über `from worker.X import Y` läuft.

import os

_THREADS = int(os.environ.get("OMP_NUM_THREADS", "0") or 0)
if _THREADS > 0:
    try:
        import torch
        torch.set_num_threads(_THREADS)
        torch.set_num_interop_threads(max(1, _THREADS // 2))
    except Exception:
        pass
