#!/usr/bin/env python3
"""Validate all skills or selected skill directories."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from build_site import DEFAULT_SKILLS_DIR, discover_skill_dirs, validate_skill_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate skill folders.")
    parser.add_argument("paths", nargs="*", help="Optional skill directories to validate")
    args = parser.parse_args()

    paths = [Path(item).resolve() for item in args.paths]
    if not paths:
        paths = discover_skill_dirs(DEFAULT_SKILLS_DIR)

    if not paths:
        print("[OK] No skills yet. Add one with: python3 scripts/init_skill.py my-skill")
        return 0

    failed = False
    for path in paths:
        result = validate_skill_dir(path)
        if result.errors:
            failed = True
            for error in result.errors:
                print(f"[ERROR] {error}", file=sys.stderr)
        else:
            print(f"[OK] {path.name}")
        for warning in result.warnings:
            print(f"[WARN] {warning}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

