#!/usr/bin/env python3
"""Build the static skills catalog and zip packages."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SKILLS_DIR = ROOT / "skills"
DEFAULT_WEB_DIR = ROOT / "web-dist"
DEFAULT_DIST_DIR = ROOT / "dist"

MAX_SKILL_NAME_LENGTH = 64
NAME_RE = re.compile(r"^[a-z0-9-]+$")
IGNORED_DIRS = {".git", "__MACOSX", "__pycache__"}
IGNORED_FILES = {".DS_Store", "Thumbs.db"}
FIXED_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


@dataclass
class SkillBuildResult:
    metadata: dict[str, Any]
    errors: list[str]
    warnings: list[str]


def parse_scalar(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return value.strip()


def load_yaml_like(text: str) -> dict[str, Any]:
    """Parse simple YAML; use PyYAML when available, otherwise support key values."""
    try:
        import yaml  # type: ignore

        loaded = yaml.safe_load(text) or {}
        return loaded if isinstance(loaded, dict) else {}
    except Exception:
        data: dict[str, Any] = {}
        current_section: str | None = None

        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            if not line.startswith((" ", "\t")) and ":" in line:
                key, raw_value = line.split(":", 1)
                key = key.strip()
                value = parse_scalar(raw_value)
                if value:
                    data[key] = value
                    current_section = None
                else:
                    data[key] = {}
                    current_section = key
                continue

            if current_section and line.startswith("  ") and ":" in stripped:
                key, raw_value = stripped.split(":", 1)
                section = data.setdefault(current_section, {})
                if isinstance(section, dict):
                    section[key.strip()] = parse_scalar(raw_value)

        return data


def read_frontmatter(skill_md: Path) -> tuple[dict[str, Any], str]:
    content = skill_md.read_text(encoding="utf-8")
    match = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?", content, re.DOTALL)
    if not match:
        return {}, content
    frontmatter = load_yaml_like(match.group(1))
    body = content[match.end() :]
    return frontmatter, body


def read_openai_metadata(skill_dir: Path) -> dict[str, Any]:
    openai_yaml = skill_dir / "agents" / "openai.yaml"
    if not openai_yaml.exists():
        return {}
    data = load_yaml_like(openai_yaml.read_text(encoding="utf-8"))
    interface = data.get("interface", {})
    return interface if isinstance(interface, dict) else {}


def title_from_name(name: str) -> str:
    acronyms = {"api", "ci", "cli", "mcp", "pdf", "ui", "url", "sql"}
    return " ".join(part.upper() if part in acronyms else part.capitalize() for part in name.split("-"))


def discover_skill_dirs(skills_dir: Path) -> list[Path]:
    if not skills_dir.exists():
        return []
    return sorted(path for path in skills_dir.iterdir() if path.is_dir() and not path.name.startswith("."))


def list_resource_files(skill_dir: Path, resource: str) -> list[str]:
    resource_dir = skill_dir / resource
    if not resource_dir.is_dir():
        return []

    files: list[str] = []
    for path in sorted(resource_dir.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(resource_dir)
        if any(part in IGNORED_DIRS for part in rel.parts):
            continue
        if path.name in IGNORED_FILES or path.suffix == ".pyc":
            continue
        files.append(rel.as_posix())
    return files


def iter_package_files(skill_dir: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(skill_dir.rglob("*")):
        if path.is_dir():
            continue
        if path.is_symlink():
            continue
        rel = path.relative_to(skill_dir)
        if any(part in IGNORED_DIRS for part in rel.parts):
            continue
        if path.name in IGNORED_FILES or path.suffix == ".pyc":
            continue
        files.append(path)
    return files


def read_registry_metadata(skill_dir: Path) -> dict[str, Any]:
    metadata_file = skill_dir / "skill.json"
    if not metadata_file.exists():
        return {}
    try:
        data = json.loads(metadata_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"_error": f"{skill_dir.name}: skill.json 不是合法 JSON：{exc}"}
    return data if isinstance(data, dict) else {"_error": f"{skill_dir.name}: skill.json 必须是对象"}


def validate_skill_dir(skill_dir: Path) -> SkillBuildResult:
    errors: list[str] = []
    warnings: list[str] = []
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.exists():
        return SkillBuildResult({}, [f"{skill_dir.name}: 缺少 SKILL.md"], warnings)

    frontmatter, body = read_frontmatter(skill_md)
    name = str(frontmatter.get("name", "")).strip()
    description = str(frontmatter.get("description", "")).strip()

    if not name:
        errors.append(f"{skill_dir.name}: SKILL.md 缺少 name")
    elif not NAME_RE.match(name):
        errors.append(f"{skill_dir.name}: name 只能包含小写字母、数字和连字符")
    elif name.startswith("-") or name.endswith("-") or "--" in name:
        errors.append(f"{skill_dir.name}: name 不能以连字符开头/结尾或包含连续连字符")
    elif len(name) > MAX_SKILL_NAME_LENGTH:
        errors.append(f"{skill_dir.name}: name 超过 {MAX_SKILL_NAME_LENGTH} 个字符")

    if name and name != skill_dir.name:
        errors.append(f"{skill_dir.name}: 目录名必须与 name 一致，当前 name={name}")

    if not description:
        errors.append(f"{skill_dir.name}: SKILL.md 缺少 description")
    elif "<" in description or ">" in description:
        errors.append(f"{skill_dir.name}: description 不能包含尖括号")
    elif len(description) > 1024:
        errors.append(f"{skill_dir.name}: description 超过 1024 个字符")

    if "TODO" in description.upper() or "[TODO" in body.upper():
        errors.append(f"{skill_dir.name}: 仍包含 TODO，请完成 skill 内容后再发布")

    if len(body.strip()) < 80:
        warnings.append(f"{skill_dir.name}: SKILL.md 正文偏短，请确认指令足够明确")

    interface = read_openai_metadata(skill_dir)
    registry_metadata = read_registry_metadata(skill_dir)
    if registry_metadata.get("_error"):
        errors.append(str(registry_metadata["_error"]))

    display_name = str(interface.get("display_name") or title_from_name(name or skill_dir.name))
    short_description = str(interface.get("short_description") or "")
    default_prompt = str(interface.get("default_prompt") or "")
    tags = registry_metadata.get("tags", [])
    if tags and not (isinstance(tags, list) and all(isinstance(tag, str) for tag in tags)):
        errors.append(f"{skill_dir.name}: skill.json 的 tags 必须是字符串数组")

    if not (skill_dir / "agents" / "openai.yaml").exists():
        warnings.append(f"{skill_dir.name}: 建议补充 agents/openai.yaml")

    if short_description and not (25 <= len(short_description) <= 64):
        warnings.append(f"{skill_dir.name}: short_description 建议保持 25-64 字符")

    if default_prompt and f"${name}" not in default_prompt:
        warnings.append(f"{skill_dir.name}: default_prompt 建议显式包含 ${name}")

    resources = {
        "scripts": list_resource_files(skill_dir, "scripts"),
        "references": list_resource_files(skill_dir, "references"),
        "assets": list_resource_files(skill_dir, "assets"),
    }

    metadata = {
        "name": name or skill_dir.name,
        "displayName": display_name,
        "shortDescription": short_description,
        "description": description,
        "defaultPrompt": default_prompt,
        "version": str(registry_metadata.get("version") or ""),
        "tags": tags if isinstance(tags, list) else [],
        "maintainer": str(registry_metadata.get("maintainer") or ""),
        "sourcePath": skill_dir.relative_to(ROOT).as_posix(),
        "entrypoint": f"{skill_dir.name}/SKILL.md",
        "codexHomeTarget": f"~/.codex/skills/{skill_dir.name}",
        "files": [path.relative_to(skill_dir).as_posix() for path in iter_package_files(skill_dir)],
        "hasAgentsMetadata": bool(interface),
        "resources": resources,
    }
    return SkillBuildResult(metadata, errors, warnings)


def package_skill(skill_dir: Path, package_dir: Path) -> dict[str, Any]:
    package_dir.mkdir(parents=True, exist_ok=True)
    archive_path = package_dir / f"{skill_dir.name}.zip"

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in iter_package_files(skill_dir):
            rel = path.relative_to(skill_dir)
            info = zipfile.ZipInfo(Path(skill_dir.name, rel).as_posix(), FIXED_ZIP_TIMESTAMP)
            is_executable = os.access(path, os.X_OK)
            permissions = 0o755 if is_executable else 0o644
            info.external_attr = permissions << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, path.read_bytes())

    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    return {
        "package": f"packages/{archive_path.name}",
        "packageSizeBytes": archive_path.stat().st_size,
        "sha256": digest,
    }


def copy_web(web_dir: Path, dist_dir: Path) -> None:
    if not web_dir.exists():
        raise FileNotFoundError(f"Web source not found: {web_dir}")

    dist_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(web_dir.rglob("*")):
        rel = path.relative_to(web_dir)
        target = dist_dir / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)

    (dist_dir / ".nojekyll").write_text("", encoding="utf-8")


def build_site(skills_dir: Path, web_dir: Path, dist_dir: Path) -> int:
    skill_dirs = discover_skill_dirs(skills_dir)
    package_dir = dist_dir / "packages"
    manifest_skills: list[dict[str, Any]] = []
    all_errors: list[str] = []
    all_warnings: list[str] = []

    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    copy_web(web_dir, dist_dir)

    for skill_dir in skill_dirs:
        result = validate_skill_dir(skill_dir)
        all_errors.extend(result.errors)
        all_warnings.extend(result.warnings)
        if result.errors:
            continue
        package_info = package_skill(skill_dir, package_dir)
        manifest_skills.append({**result.metadata, **package_info})

    if all_errors:
        for error in all_errors:
            print(f"[ERROR] {error}", file=sys.stderr)
        return 1

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "repository": os.environ.get("GITHUB_REPOSITORY", ""),
        "sourceCommit": os.environ.get("GITHUB_SHA", ""),
        "totalSkills": len(manifest_skills),
        "skills": manifest_skills,
        "warnings": all_warnings,
    }

    for name in ("index.json", "skills.json"):
        (dist_dir / name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"[OK] Built {len(manifest_skills)} skill package(s) into {dist_dir}")
    for warning in all_warnings:
        print(f"[WARN] {warning}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the static skills catalog.")
    parser.add_argument("--skills-dir", default=str(DEFAULT_SKILLS_DIR), help="Directory containing skill folders")
    parser.add_argument("--web-dir", default=str(DEFAULT_WEB_DIR), help="Directory containing web UI source files")
    parser.add_argument("--dist-dir", default=str(DEFAULT_DIST_DIR), help="Output directory for static site")
    args = parser.parse_args()

    return build_site(Path(args.skills_dir).resolve(), Path(args.web_dir).resolve(), Path(args.dist_dir).resolve())


if __name__ == "__main__":
    raise SystemExit(main())
