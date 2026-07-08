---
name: skill-repo-manager
description: Maintain a centralized Codex skills repository with static Web UI publishing. Use when adding, updating, validating, packaging, indexing, or publishing skills in a repository that stores skill source folders under skills/ and serves downloadable packages through GitHub Pages or another static host.
---

# Skill Repo Manager

## Overview

Maintain a cloud-hosted skills catalog where `skills/` is the source of truth and
`dist/` is generated for Web browsing and package downloads.

## Workflow

1. Inspect the repository shape before editing. Confirm the expected folders:
   `skills/`, `scripts/`, `web/`, and `.github/workflows/`.
2. For a new skill, run the repository initializer instead of hand-writing the
   skeleton:

```bash
python3 scripts/init_skill.py skill-name --resources references,scripts,assets
```

3. Edit only the target skill folder and any directly related registry or Web
   files. Keep the skill folder name equal to `SKILL.md` frontmatter `name`.
4. Keep `SKILL.md` focused on agent instructions. Put detailed domain material
   in `references/`, reusable commands in `scripts/`, and output templates in
   `assets/`.
5. Store Web catalog metadata in `skill.json`: `version`, `maintainer`, and
   `tags`. Do not move Codex trigger text out of `SKILL.md`.
6. Validate and build before finishing:

```bash
python3 scripts/validate_skills.py
python3 scripts/build_site.py
```

7. If UI behavior changed, preview `dist/` through a local HTTP server and check
   that `index.json` loads successfully.

## Publishing

GitHub Pages should publish generated `dist/`, not the raw repository root. The
build must create:

- `dist/index.html`
- `dist/index.json`
- `dist/packages/<skill-name>.zip`

Each zip must contain the top-level skill folder:

```text
skill-name/
├── SKILL.md
├── skill.json
├── agents/openai.yaml
└── ...
```

## References

Read `references/repository-contract.md` when changing the repository layout,
index schema, package format, or install command.
