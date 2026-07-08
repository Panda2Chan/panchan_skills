# Panchan Skills

这是一个云端集中管理的 Codex skills 仓库。

核心链路很简单：

```text
skills/* ── build_site.py ──> dist/index.json
      │                         dist/packages/*.zip
      └──────────────────────> GitHub Pages Web UI
```

其他电脑打开 GitHub Pages 页面后，可以搜索、下载指定 skill，并安装到
`~/.codex/skills/`。


## Skills List

当前仓库已发布 1 个 skill：

- **skill-repo-manager**：维护一个云端集中管理的 Codex skills 仓库，支持新增、更新、校验、打包、索引和发布 skill。


## 快速开始

创建一个新 skill：

```bash
python3 scripts/init_skill.py my-skill \
  --resources references,scripts \
  --version 0.1.0 \
  --tags dev-tool,workflow
```

编辑完成后校验：

```bash
python3 scripts/validate_skills.py
```

生成 Web UI 和下载包：

```bash
npm install
npm run build
```

本地预览：

```bash
npm run preview
```

然后打开：

```text
http://localhost:8000
```


## 发布到 GitHub Pages

1. 把仓库推送到 GitHub。
2. 进入仓库 `Settings -> Pages`。
3. 将 `Build and deployment -> Source` 设置为 `GitHub Actions`。
4. 推送到 `main` 或 `master` 后，`.github/workflows/pages.yml` 会自动构建并发布。

工作流使用 GitHub Pages 官方 Actions：`configure-pages`、
`upload-pages-artifact`、`deploy-pages`，并通过 `checkout` 拉取源码。
前端构建使用 Vite、React、TailwindCSS 和 lucide-react。


## 收藏 GitHub 仓库

页面不会动态调用 GitHub API。要展示收藏仓库，编辑：

```text
web/public/favorite-repos.json
```

格式示例：

```json
{
  "schemaVersion": 1,
  "repositories": [
    {
      "id": "leonxlnx-taste-skill",
      "name": "Leonxlnx/taste-skill",
      "url": "https://github.com/Leonxlnx/taste-skill",
      "description": "Taste-Skill gives AI better frontend taste.",
      "note": "前端审美和重设计参考 skill 集合。",
      "tags": ["frontend", "design"],
      "skillPaths": ["skills/taste-skill"],
      "addedAt": "2026-07-08"
    }
  ]
}
```

修改后运行：

```bash
npm run build
```


## 电脑端安装方式

在 Web UI 中复制安装命令，或手动下载 zip 后执行：

```bash
mkdir -p ~/.codex/skills
unzip -oq my-skill.zip -d ~/.codex/skills
```

zip 内部自带顶层目录：

```text
my-skill/
├── SKILL.md
├── agents/openai.yaml
    └── ...
```

Web UI 中的安装命令默认会把 zip 解压到：

```text
${CODEX_HOME:-$HOME/.codex}/skills
```


## 仓库结构

```text
.
├── .github/workflows/pages.yml
├── scripts/
│   ├── build_site.py
│   ├── init_skill.py
│   └── validate_skills.py
├── web/
│   ├── src/
│   └── index.html
├── skills/
│   └── skill-repo-manager/
│       ├── SKILL.md
│       ├── agents/openai.yaml
│       ├── references/repository-contract.md
│       └── skill.json
└── AGENTS.md
```

单个 skill 的推荐结构：

```text
skills/my-skill/
├── SKILL.md
├── skill.json
├── agents/openai.yaml
├── references/
├── scripts/
└── assets/
```
