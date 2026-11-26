"""Evaluate cross-platform dedup + ghost detector against ground-truth labels of the demo dataset.

Usage (inside the api container):  python -m scripts.eval_dedup
Pairwise precision/recall: a pair of postings is "predicted same" if they landed in one canonical vacancy.
Ground truth "same" = cross-platform duplicate groups + eternal repost groups (both must collapse to one card).
"""

from __future__ import annotations

import asyncio
import itertools
import json
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Vacancy, VacancySource

LABELS = Path(__file__).resolve().parents[1] / "app/collectors/fixtures/dedup_labels.json"


def pairs(groups: list[list[str]]) -> set[frozenset]:
    out = set()
    for g in groups:
        for a, b in itertools.combinations(sorted(set(g)), 2):
            out.add(frozenset((a, b)))
    return out


async def main() -> dict:
    labels = json.loads(LABELS.read_text(encoding="utf-8"))
    truth_groups = labels["duplicate_groups"] + [g["ids"] for g in labels["eternal_groups"]]
    truth = pairs(truth_groups)
    async with SessionLocal() as s:
        rows = (await s.execute(select(VacancySource.vacancy_id, VacancySource.source, VacancySource.external_id))).all()
        ghosts = set((await s.execute(select(Vacancy.id).where(Vacancy.is_ghost.is_(True)))).scalars().all())
    by_vac: dict[int, list[str]] = {}
    id2vac: dict[str, int] = {}
    for vid, src, ext in rows:
        key = f"{src}:{ext}"
        by_vac.setdefault(vid, []).append(key)
        id2vac[key] = vid
    universe = {i for g in truth_groups for i in g} | set(id2vac)
    pred = pairs([[k for k in g if k in universe] for g in by_vac.values()])
    tp = len(pred & truth)
    precision = tp / len(pred) if pred else 1.0
    recall = tp / len(truth) if truth else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    eternal = labels["eternal_groups"]
    detected = sum(1 for g in eternal if any(id2vac.get(i) in ghosts for i in g["ids"]))
    eternal_vacs = {id2vac.get(i) for g in eternal for i in g["ids"]}
    false_ghosts = len(ghosts - eternal_vacs)
    res = {
        "dedup": {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3),
                  "true_pairs": len(truth), "predicted_pairs": len(pred)},
        "ghost_detector": {"eternal_groups": len(eternal), "detected": detected, "false_positives": false_ghosts},
        "postings": len(id2vac), "canonical_vacancies": len(by_vac),
    }
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return res


if __name__ == "__main__":
    import argparse
    import sys

    ap = argparse.ArgumentParser()
    ap.add_argument("--min-f1", type=float, default=0.0, help="fail (exit 1) below this dedup F1")
    args = ap.parse_args()
    r = asyncio.run(main())
    g = r["ghost_detector"]
    if r["dedup"]["f1"] < args.min_f1 or g["detected"] < g["eternal_groups"]:
        print(f"QUALITY GATE FAILED: f1={r['dedup']['f1']} < {args.min_f1} or ghosts {g['detected']}/{g['eternal_groups']}")
        sys.exit(1)
