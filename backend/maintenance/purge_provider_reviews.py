"""Audit and purge persisted Google/Yelp review text.

Dry-run is the default. Execution requires both --execute and --audit-file.
The audit contains counts and identifiers only, never review text.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import SessionLocal

PURGE_SOURCES = ("google", "yelp")


def audit_rows(db: Session) -> list[dict]:
    rows = db.query(
        models.Review.source,
        models.Review.place_id,
        func.count(models.Review.id),
    ).filter(
        models.Review.source.in_(PURGE_SOURCES)
    ).group_by(
        models.Review.source, models.Review.place_id
    ).order_by(
        models.Review.source, models.Review.place_id
    ).all()
    return [
        {"source": source, "place_id": place_id, "row_count": count}
        for source, place_id, count in rows
    ]


def purge_reviews(
    db: Session,
    *,
    execute: bool = False,
    audit_file: Path | None = None,
    now: datetime | None = None,
) -> dict:
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    rows = audit_rows(db)
    report = {
        "sources": list(PURGE_SOURCES),
        "deletion_timestamp": timestamp if execute else None,
        "dry_run": not execute,
        "total_rows": sum(row["row_count"] for row in rows),
        "rows": rows,
    }
    if not execute:
        if audit_file is not None:
            audit_file.parent.mkdir(parents=True, exist_ok=True)
            audit_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return report
    if audit_file is None:
        raise ValueError("An audit file is required when executing the purge.")
    if not audit_file.exists():
        raise ValueError("Run a dry-run audit export before executing the purge.")
    prior_audit = json.loads(audit_file.read_text(encoding="utf-8"))
    if (
        prior_audit.get("dry_run") is not True
        or prior_audit.get("sources") != list(PURGE_SOURCES)
        or prior_audit.get("total_rows") != report["total_rows"]
        or prior_audit.get("rows") != report["rows"]
    ):
        raise ValueError("The database no longer matches the confirmed dry-run audit.")
    report["status"] = "deleting"
    audit_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    try:
        deleted = db.query(models.Review).filter(
            models.Review.source.in_(PURGE_SOURCES)
        ).delete(synchronize_session=False)
        remaining = db.query(models.Review).filter(
            models.Review.source.in_(PURGE_SOURCES)
        ).count()
        if deleted != report["total_rows"] or remaining:
            raise RuntimeError("Provider review purge verification failed.")
        db.commit()
    except Exception:
        db.rollback()
        report["status"] = "rolled_back"
        audit_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        raise
    report["deleted_rows"] = deleted
    report["remaining_rows"] = remaining
    report["verified_remaining_rows"] = db.query(models.Review).filter(
        models.Review.source.in_(PURGE_SOURCES)
    ).count()
    report["status"] = "completed"
    audit_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="perform the deletion")
    parser.add_argument("--audit-file", type=Path, help="JSON audit export path")
    args = parser.parse_args(argv)
    if args.execute and not args.audit_file:
        parser.error("--audit-file is required with --execute")
    with SessionLocal() as db:
        report = purge_reviews(db, execute=args.execute, audit_file=args.audit_file)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
