import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Copy,
  Database,
  Download,
  ExternalLink,
  FolderHeart,
  Heart,
  Package,
  Search,
} from "lucide-react";
import skillIconUrl from "../assets/skill-cloud.svg";
import "./styles.css";

const EMPTY_MANIFEST = {
  generatedAt: "",
  skills: [],
  totalSkills: 0,
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function titleFromName(name = "") {
  return name
    .split("-")
    .filter(Boolean)
    .map((item) => (item.length <= 3 ? item.toUpperCase() : item[0].toUpperCase() + item.slice(1)))
    .join(" ");
}

function absoluteUrl(path) {
  return new URL(path, window.location.href).href;
}

function installCommand(skill) {
  const url = absoluteUrl(skill.package);
  const file = `/tmp/${skill.name}.zip`;
  return `target="\${CODEX_HOME:-$HOME/.codex}/skills" && mkdir -p "$target" && curl -L ${JSON.stringify(url)} -o ${JSON.stringify(file)} && unzip -oq ${JSON.stringify(file)} -d "$target"`;
}

function normalizeFavoriteRepos(raw) {
  const repos = Array.isArray(raw?.repositories) ? raw.repositories : [];
  return repos
    .filter((repo) => repo && typeof repo.url === "string" && repo.url.trim())
    .map((repo, index) => ({
      id: repo.id || repo.url || `repo-${index}`,
      name: repo.name || repo.url.replace(/^https?:\/\/github\.com\//, ""),
      url: repo.url,
      description: repo.description || "",
      note: repo.note || "",
      tags: Array.isArray(repo.tags) ? repo.tags : [],
      skillPaths: Array.isArray(repo.skillPaths) ? repo.skillPaths : [],
      addedAt: repo.addedAt || "",
    }));
}

function resourceChips(skill) {
  const chips = [];
  if (skill.version) chips.push({ key: "version", label: `v${skill.version}` });
  const resources = skill.resources || {};
  for (const key of ["scripts", "references", "assets"]) {
    const count = Array.isArray(resources[key]) ? resources[key].length : 0;
    if (count > 0) chips.push({ key, label: `${key} ${count}` });
  }
  if (skill.hasAgentsMetadata) chips.push({ key: "agents", label: "agents" });
  for (const tag of skill.tags || []) chips.push({ key: "tag", label: `#${tag}` });
  if (chips.length === 0) chips.push({ key: "basic", label: "basic" });
  return chips;
}

function Button({ children, icon: Icon, variant = "plain", className = "", name, ...props }) {
  const styles =
    variant === "primary"
      ? "border-ink bg-pink-300 text-ink shadow-pixel-sm hover:-translate-y-0.5"
      : "border-ink bg-white text-ink hover:bg-yellow-100";
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 border-2 px-3 py-2 font-bold transition active:translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-cyan-200 ${styles} ${className}`}
      name={name || "action-button"}
      type="button"
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} strokeWidth={2.4} /> : null}
      <span>{children}</span>
    </button>
  );
}

function LinkButton({ children, icon: Icon, variant = "plain", className = "", ...props }) {
  const styles =
    variant === "primary"
      ? "border-ink bg-cyan-300 text-ink shadow-pixel-sm hover:-translate-y-0.5"
      : "border-ink bg-white text-ink hover:bg-yellow-100";
  return (
    <a
      className={`inline-flex min-h-10 items-center justify-center gap-2 border-2 px-3 py-2 font-bold no-underline transition active:translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-cyan-200 ${styles} ${className}`}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} strokeWidth={2.4} /> : null}
      <span>{children}</span>
    </a>
  );
}

function TextField({ label, icon: Icon, className = "", ...props }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="flex items-center gap-2 text-sm font-black text-ink">
        {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={2.5} /> : null}
        {label}
      </span>
      <input
        className="min-h-12 border-2 border-ink bg-white px-3 py-2 text-base font-semibold text-ink shadow-pixel-sm outline-none transition placeholder:text-slate-400 focus:bg-yellow-50 focus:ring-4 focus:ring-cyan-200"
        {...props}
      />
    </label>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`border-2 border-ink p-4 shadow-pixel-sm ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-2xl font-black tabular-nums text-ink">{value}</span>
        <Icon aria-hidden="true" size={24} strokeWidth={2.6} />
      </div>
      <p className="mt-2 text-sm font-black text-ink">{label}</p>
    </div>
  );
}

function App() {
  const [manifest, setManifest] = useState(EMPTY_MANIFEST);
  const [favoriteRepos, setFavoriteRepos] = useState([]);
  const [query, setQuery] = useState("");
  const [resource, setResource] = useState("all");
  const [activeTab, setActiveTab] = useState("skills");
  const [sortBy, setSortBy] = useState("name");
  const [status, setStatus] = useState("正在读取静态索引");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("./index.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`index.json HTTP ${response.status}`);
        return response.json();
      }),
      fetch("./favorite-repos.json", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`favorite-repos.json HTTP ${response.status}`);
          return response.json();
        })
        .catch(() => ({ repositories: [] })),
    ])
      .then(([manifestData, repoData]) => {
        const repos = normalizeFavoriteRepos(repoData);
        setManifest(manifestData);
        setFavoriteRepos(repos);
        setStatus(`已加载 ${manifestData.totalSkills || 0} 个 skill，${repos.length} 个收藏仓库`);
      })
      .catch((error) => {
        setStatus("静态索引读取失败");
        setLoadError(String(error.message || error));
      });
  }, []);

  const visibleSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (manifest.skills || [])
      .map((skill) => ({ ...skill, sourceType: "local" }))
      .filter((skill) => {
        if (resource === "agents" && !skill.hasAgentsMetadata) return false;
        if (resource !== "all" && resource !== "agents") {
          const files = skill.resources?.[resource];
          if (!Array.isArray(files) || files.length === 0) return false;
        }
        if (!needle) return true;
        const haystack = [
          skill.name,
          skill.displayName,
          skill.shortDescription,
          skill.description,
          skill.version,
          skill.maintainer,
          (skill.tags || []).join(" "),
          Object.values(skill.resources || {}).flat().join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        if (sortBy === "size") {
          return (a.packageSizeBytes || 0) - (b.packageSizeBytes || 0) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }, [manifest.skills, query, resource, sortBy]);

  const visibleRepos = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return favoriteRepos.filter((repo) => {
      if (!needle) return true;
      return [
        repo.name,
        repo.url,
        repo.description,
        repo.note,
        repo.addedAt,
        repo.tags.join(" "),
        repo.skillPaths.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [favoriteRepos, query]);

  const totalSize = useMemo(
    () => visibleSkills.reduce((sum, skill) => sum + (skill.packageSizeBytes || 0), 0),
    [visibleSkills],
  );

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("已复制");
      window.setTimeout(() => setStatus(`已加载 ${manifest.totalSkills || 0} 个 skill，${favoriteRepos.length} 个收藏仓库`), 1200);
    } catch {
      window.prompt("复制下面的内容", text);
    }
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <div className="fixed inset-0 -z-10 bg-pixel-grid opacity-60" />
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-2 border-ink bg-white p-4 shadow-pixel md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 place-items-center border-2 border-ink bg-pink-200 shadow-pixel-sm">
              <img src={skillIconUrl} alt="" className="h-11 w-11 image-render-pixel" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-black text-ink sm:text-4xl">Panchan Skills</h1>
              <p className="mt-1 text-sm font-bold text-slate-700">{status}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="./index.json" icon={Database}>索引 JSON</LinkButton>
            <LinkButton href="./favorite-repos.json" icon={FolderHeart}>收藏 JSON</LinkButton>
          </div>
        </header>

        <main className="grid gap-5">
          <section className="grid gap-3 border-2 border-ink bg-white p-3 shadow-pixel" aria-label="内容切换">
            <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="目录类型">
              <button
                aria-selected={activeTab === "skills"}
                className={`flex min-h-14 items-center justify-between border-2 border-ink px-4 py-3 text-left font-black transition focus:outline-none focus:ring-4 focus:ring-cyan-200 ${
                  activeTab === "skills" ? "bg-pink-300 shadow-pixel-sm" : "bg-white hover:bg-yellow-100"
                }`}
                name="tab-skills"
                onClick={() => setActiveTab("skills")}
                role="tab"
                type="button"
              >
                <span>本地 skills</span>
                <span className="font-mono">{manifest.totalSkills || 0}</span>
              </button>
              <button
                aria-selected={activeTab === "repos"}
                className={`flex min-h-14 items-center justify-between border-2 border-ink px-4 py-3 text-left font-black transition focus:outline-none focus:ring-4 focus:ring-cyan-200 ${
                  activeTab === "repos" ? "bg-cyan-300 shadow-pixel-sm" : "bg-white hover:bg-yellow-100"
                }`}
                name="tab-repos"
                onClick={() => setActiveTab("repos")}
                role="tab"
                type="button"
              >
                <span>收藏仓库</span>
                <span className="font-mono">{favoriteRepos.length}</span>
              </button>
            </div>
          </section>

          <section className="grid gap-3 border-2 border-ink bg-white p-4 shadow-pixel" aria-label="筛选">
            <div className={`grid gap-3 ${activeTab === "skills" ? "lg:grid-cols-[1fr_160px_160px]" : "lg:grid-cols-1"}`}>
              <TextField
                icon={Search}
                id="catalog-search"
                label="搜索"
                name="catalog-search"
                type="search"
                placeholder={activeTab === "skills" ? "名称、描述、资源" : "仓库、地址、备注、标签"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {activeTab === "skills" ? (
                <>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-ink">资源</span>
                    <select id="resource-filter" name="resource-filter" className="control" value={resource} onChange={(event) => setResource(event.target.value)}>
                      <option value="all">全部</option>
                      <option value="scripts">scripts</option>
                      <option value="references">references</option>
                      <option value="assets">assets</option>
                      <option value="agents">agents</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-ink">排序</span>
                    <select id="sort-by" name="sort-by" className="control" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                      <option value="name">名称</option>
                      <option value="size">包大小</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="统计">
            <Metric icon={Package} label="本地 skills" value={visibleSkills.length} tone="bg-pink-100" />
            <Metric icon={FolderHeart} label="收藏仓库" value={visibleRepos.length} tone="bg-yellow-100" />
            <Metric icon={Download} label="当前下载包" value={activeTab === "skills" ? formatBytes(totalSize) : "-"} tone="bg-cyan-100" />
            <Metric icon={Database} label="生成时间" value={formatTime(manifest.generatedAt)} tone="bg-lime-100" />
          </section>

          {activeTab === "skills" ? (
            <section className="grid gap-4 xl:grid-cols-2" aria-live="polite">
              {visibleSkills.map((skill) => (
                <SkillCard key={`${skill.sourcePath}:${skill.name}`} skill={skill} onCopy={copyText} />
              ))}
            </section>
          ) : (
            <section className="grid gap-4 border-2 border-ink bg-sky-100 p-4 shadow-pixel" aria-label="收藏仓库">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="font-mono text-xs font-black text-pink-700">STATIC FAVORITES</p>
                  <h2 className="font-display text-2xl font-black">收藏的 GitHub 仓库</h2>
                  <p className="mt-1 max-w-3xl text-sm font-bold text-slate-700">
                    这里不调用 GitHub API。编辑 `web/public/favorite-repos.json` 后重新构建，页面就会显示仓库地址、备注和标签。
                  </p>
                </div>
                <span className="inline-flex w-fit border-2 border-ink bg-yellow-200 px-2 py-1 font-mono text-xs font-black">
                  pure static
                </span>
              </div>
              {loadError ? <p className="border-2 border-ink bg-red-100 px-3 py-2 font-bold text-red-800">{loadError}</p> : null}
              {visibleRepos.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {visibleRepos.map((repo) => (
                    <RepoCard key={repo.id} repo={repo} onCopy={copyText} />
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-ink bg-white p-5 text-center font-bold shadow-pixel-sm">
                  暂无匹配的收藏仓库
                </div>
              )}
            </section>
          )}

          {activeTab === "skills" && !visibleSkills.length ? (
            <section className="border-2 border-dashed border-ink bg-white p-8 text-center shadow-pixel">
              <h2 className="font-display text-2xl font-black">没有匹配的 skill</h2>
              <p className="mt-2 font-semibold text-slate-700">换一个关键词或资源筛选条件。</p>
            </section>
          ) : null}

        </main>
      </div>
    </div>
  );
}

function RepoCard({ repo, onCopy }) {
  return (
    <article className="grid gap-3 border-2 border-ink bg-white p-4 shadow-pixel-sm transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black text-pink-700">FAVORITE REPO</p>
          <h3 className="mt-1 break-words font-display text-xl font-black">{repo.name}</h3>
        </div>
        <Heart aria-hidden="true" className="shrink-0 fill-pink-200 text-ink" size={28} strokeWidth={2.5} />
      </div>
      {repo.description ? <p className="text-sm font-semibold leading-6 text-slate-700">{repo.description}</p> : null}
      {repo.note ? <p className="border-l-4 border-pink-300 pl-3 text-sm font-black text-ink">{repo.note}</p> : null}
      <div className="flex flex-wrap gap-2">
        {repo.tags.map((tag) => (
          <span key={tag} className="chip chip-tag">#{tag}</span>
        ))}
        {repo.skillPaths.map((path) => (
          <span key={path} className="chip chip-references">{path}</span>
        ))}
      </div>
      <code className="break-all border-2 border-ink bg-ink p-3 font-mono text-xs font-bold leading-5 text-white">{repo.url}</code>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={repo.url} icon={ExternalLink} rel="noreferrer" target="_blank" variant="primary">打开仓库</LinkButton>
        <Button icon={Copy} onClick={() => onCopy(repo.url)}>复制地址</Button>
      </div>
    </article>
  );
}

function SkillCard({ skill, onCopy }) {
  const command = skill.package ? installCommand(skill) : "";

  return (
    <article className="grid gap-4 border-2 border-ink bg-white p-4 shadow-pixel transition hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black text-pink-700">LOCAL SKILL</p>
          <h2 className="mt-1 break-words font-display text-2xl font-black leading-tight">{skill.displayName || titleFromName(skill.name)}</h2>
          <p className="mt-1 break-words font-mono text-xs font-black text-slate-600">{skill.name}</p>
        </div>
        <span className="shrink-0 border-2 border-ink bg-cyan-200 px-2 py-1 font-mono text-xs font-black">
          {formatBytes(skill.packageSizeBytes || 0)}
        </span>
      </div>

      <p className="min-h-20 break-words text-sm font-semibold leading-6 text-slate-700">{skill.description}</p>

      <div className="flex flex-wrap gap-2">
        {resourceChips(skill).map((chip) => (
          <span key={`${chip.key}:${chip.label}`} className={`chip chip-${chip.key}`}>
            {chip.label}
          </span>
        ))}
      </div>

      {skill.sha256 ? <p className="break-all font-mono text-xs font-bold text-slate-600">sha256 {skill.sha256.slice(0, 20)}...</p> : null}

      <div className="min-h-16 overflow-auto border-2 border-ink bg-ink p-3 text-white">
        <code className="whitespace-pre-wrap break-words font-mono text-xs font-bold leading-5">{command}</code>
      </div>

      <div className="flex flex-wrap gap-2">
        {skill.package ? <LinkButton href={skill.package} icon={Download} variant="primary">下载</LinkButton> : null}
        {command ? <Button icon={Copy} onClick={() => onCopy(command)}>复制安装命令</Button> : null}
        {skill.package ? <Button icon={Copy} onClick={() => onCopy(absoluteUrl(skill.package))}>复制链接</Button> : null}
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
