# Panchan Skills 仓库协作规范

## 目录边界

- `skills/<skill-name>/` 存放真实 Codex skill，目录名必须与 `SKILL.md`
  frontmatter 的 `name` 一致。
- `skills/<skill-name>/skill.json` 存放 Web registry 使用的版本、标签、
  维护者等展示元数据。
- `web/` 存放 Vite/React/Tailwind Web UI 源码。
- `web/public/favorite-repos.json` 存放静态收藏 GitHub 仓库列表。
- `web-dist/` 是前端构建产物，不要手动编辑，也不要提交。
- `scripts/` 存放仓库管理脚本。
- `dist/` 是构建产物，不要手动编辑，也不要提交。

## 新增 Skill

优先使用仓库脚本创建骨架：

```bash
python3 scripts/init_skill.py my-skill --resources scripts,references,assets
```

完成后必须运行：

```bash
python3 scripts/validate_skills.py
npm run build
```

## Skill 质量约束

- `SKILL.md` 必须包含 YAML frontmatter：`name`、`description`。
- `description` 必须写清触发场景，不能保留 TODO。
- `skill.json` 只放机器可读的发布元数据，避免变成说明文档。
- 不要在单个 skill 内放 `README.md`、安装指南、变更日志等杂文档。
- 长参考资料放到 `references/`，稳定自动化逻辑放到 `scripts/`，
  模板或图片等产物资源放到 `assets/`。

## Web 发布约束

- Web UI 必须保持静态站点能力，不能引入后端依赖。
- 下载链接来自 `dist/index.json` 中的 `package` 字段。
- GitHub Pages 工作流会执行 `scripts/build_site.py` 并发布 `dist/`。
- 收藏仓库只从 `favorite-repos.json` 静态读取；不要在页面里调用 GitHub API，
  也不要使用 localStorage 作为仓库数据源。
