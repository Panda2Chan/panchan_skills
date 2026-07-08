#!/usr/bin/env python3
"""Initialize a new skill folder in this repository."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SKILLS_DIR = ROOT / "skills"
ALLOWED_RESOURCES = {"scripts", "references", "assets"}
MAX_SKILL_NAME_LENGTH = 64


def normalize_skill_name(raw: str) -> str:
    name = raw.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    return name


def title_from_name(name: str) -> str:
    acronyms = {"api", "ci", "cli", "mcp", "pdf", "ui", "url", "sql"}
    return " ".join(part.upper() if part in acronyms else part.capitalize() for part in name.split("-"))


def yaml_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def parse_resources(raw: str) -> list[str]:
    if not raw:
        return []
    resources = [item.strip() for item in raw.split(",") if item.strip()]
    invalid = sorted(set(resources) - ALLOWED_RESOURCES)
    if invalid:
        allowed = ", ".join(sorted(ALLOWED_RESOURCES))
        raise ValueError(f"未知资源目录：{', '.join(invalid)}。可选：{allowed}")
    return list(dict.fromkeys(resources))


def default_short_description(display_name: str) -> str:
    value = f"Help with {display_name} workflows"
    if len(value) > 64:
        value = f"{display_name} workflow helper"
    if len(value) > 64:
        value = value[:64].rstrip()
    if len(value) < 25:
        value = f"{value} and tasks"
    return value


def write_skill_md(skill_dir: Path, skill_name: str, title: str) -> None:
    content = f"""---
name: {skill_name}
description: TODO: Replace with a clear explanation of what this skill does and the specific tasks, files, systems, or workflows that should trigger it.
---

# {title}

## Overview

TODO: Describe the concrete work this skill helps Codex perform.

## Workflow

1. TODO: Add the first required step.
2. TODO: Add validation or handoff expectations.

## Resources

- Read `references/` only when the user request needs detailed domain context.
- Run `scripts/` helpers when deterministic execution is safer than rewriting logic.
- Use `assets/` for templates, images, fonts, or starter files that should be copied into outputs.
"""
    (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")


def write_openai_yaml(
    skill_dir: Path,
    skill_name: str,
    display_name: str,
    short_description: str,
    default_prompt: str,
) -> None:
    agents_dir = skill_dir / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    content = "\n".join(
        [
            "interface:",
            f"  display_name: {yaml_quote(display_name)}",
            f"  short_description: {yaml_quote(short_description)}",
            f"  default_prompt: {yaml_quote(default_prompt)}",
            "",
        ]
    )
    (agents_dir / "openai.yaml").write_text(content, encoding="utf-8")


def write_registry_metadata(skill_dir: Path, tags: str, version: str, maintainer: str) -> None:
    tag_values = [item.strip() for item in tags.split(",") if item.strip()]
    metadata = {
        "version": version,
        "maintainer": maintainer,
        "tags": tag_values,
    }
    (skill_dir / "skill.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def init_skill(args: argparse.Namespace) -> Path:
    skill_name = normalize_skill_name(args.skill_name)
    if not skill_name:
        raise ValueError("skill 名称必须至少包含一个字母或数字")
    if len(skill_name) > MAX_SKILL_NAME_LENGTH:
        raise ValueError(f"skill 名称超过 {MAX_SKILL_NAME_LENGTH} 个字符")

    output_dir = Path(args.path).expanduser().resolve()
    skill_dir = output_dir / skill_name
    if skill_dir.exists():
        raise FileExistsError(f"目录已存在：{skill_dir}")

    resources = parse_resources(args.resources)
    display_name = args.display_name or title_from_name(skill_name)
    short_description = args.short_description or default_short_description(display_name)
    default_prompt = args.default_prompt or f"Use ${skill_name} to complete the requested workflow."

    if not (25 <= len(short_description) <= 64):
        raise ValueError("short_description 必须保持在 25-64 个字符")
    if f"${skill_name}" not in default_prompt:
        raise ValueError(f"default_prompt 必须显式包含 ${skill_name}")

    skill_dir.mkdir(parents=True)
    write_skill_md(skill_dir, skill_name, display_name)
    write_openai_yaml(skill_dir, skill_name, display_name, short_description, default_prompt)
    write_registry_metadata(skill_dir, args.tags, args.version, args.maintainer)

    for resource in resources:
        (skill_dir / resource).mkdir()

    return skill_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a new skill in skills/.")
    parser.add_argument("skill_name", help="Skill name; normalized to hyphen-case")
    parser.add_argument("--path", default=str(DEFAULT_SKILLS_DIR), help="Directory that will contain the skill folder")
    parser.add_argument("--resources", default="", help="Comma-separated list: scripts,references,assets")
    parser.add_argument("--display-name", default="", help="User-facing skill name for agents/openai.yaml")
    parser.add_argument("--short-description", default="", help="25-64 character UI description")
    parser.add_argument("--default-prompt", default="", help="Default prompt; must include $skill-name")
    parser.add_argument("--version", default="0.1.0", help="Version stored in skill.json")
    parser.add_argument("--tags", default="", help="Comma-separated tags stored in skill.json")
    parser.add_argument("--maintainer", default="", help="Maintainer stored in skill.json")
    args = parser.parse_args()

    try:
        skill_dir = init_skill(args)
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    print(f"[OK] Created skill: {skill_dir}")
    print("[NEXT] Edit SKILL.md, remove TODO, then run: python3 scripts/validate_skills.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
