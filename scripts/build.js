// Scans .github/workflows/*.yml (excluding build-site.yml itself) and
// treats each one as a tool, keyed by filename-without-extension = slug.
// For each tool, looks in workflows/<slug>/ for any image/gif/webp output
// already committed there by that tool's own job, and generates a page.
// No workflows.json — this file is the entire registry, inferred live.
// Run via CI (Node 18+) on push, nightly schedule, or manual dispatch.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOWS_YAML_DIR = path.join(ROOT, ".github", "workflows");
const WORKFLOWS_DIR = path.join(ROOT, "workflows");

const REPO = process.env.GITHUB_REPOSITORY || "owner/repo";

// Workflow files that are part of the site machinery, not a "tool" to show.
const EXCLUDE = new Set(["build-site.yml"]);

const HEAD = (title, depth) => {
  const cssPath = depth === 0 ? "assets/extra.css" : "../../assets/extra.css";
  const sakuraPath = "https://cdn.jsdelivr.net/npm/sakura.css/css/sakura.css";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="${sakuraPath}">
<link rel="stylesheet" href="${cssPath}">
</head>
<body>
`;
};

const FOOT = `</body>
</html>
`;

function badgeUrl(workflowFile) {
  return `https://github.com/${REPO}/actions/workflows/${workflowFile}/badge.svg`;
}

function actionsUrl(workflowFile) {
  return `https://github.com/${REPO}/actions/workflows/${workflowFile}`;
}

function titleCaseFromSlug(slug) {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function discoverTools() {
  if (!fs.existsSync(WORKFLOWS_YAML_DIR)) return [];
  return fs
    .readdirSync(WORKFLOWS_YAML_DIR)
    .filter((f) => /\.ya?ml$/i.test(f) && !EXCLUDE.has(f))
    .map((file) => {
      const slug = file.replace(/\.ya?ml$/i, "");
      return {
        slug,
        name: titleCaseFromSlug(slug),
        workflow_file: file,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractCredits(fileContent) {
  const credits = [];
  const seen = new Set();

  // GitHub Actions: "uses: owner/repo@ref" or "uses: owner/repo/sub@ref"
  const usesPattern = /uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)@([A-Za-z0-9_.\/-]+)/g;
  let m;
  while ((m = usesPattern.exec(fileContent)) !== null) {
    const fullRef = m[1]; // e.g. "PabloLec/website-to-gif" or "actions/checkout"
    const ref = m[2];
    // Skip local site-machinery actions (checkout, setup-node, pages, etc. are still
    // credited since they're real external actions worth crediting too).
    const repoPath = fullRef.split("/").slice(0, 2).join("/"); // owner/repo only
    const key = `action:${repoPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      type: "action",
      label: repoPath,
      url: `https://github.com/${repoPath}`,
      detail: ref,
    });
  }

  // External API hosts referenced via curl/fetch URLs.
  const urlPattern = /https?:\/\/([a-zA-Z0-9.-]+)(?:\/[^\s"'<>]*)?/g;
  const skipHosts = new Set([
    "github.com",
    "raw.githubusercontent.com",
    "cdn.jsdelivr.net",
    "api.github.com",
    "www.w3.org", // SVG XML namespace boilerplate, not a real credit
  ]);
  while ((m = urlPattern.exec(fileContent)) !== null) {
    const host = m[1];
    if (skipHosts.has(host)) continue;
    const key = `api:${host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      type: "api",
      label: host,
      url: `https://${host}`,
      detail: "API",
    });
  }

  return credits;
}

function discoverCredits(tools) {
  const bySlug = {};
  for (const tool of tools) {
    const filePath = path.join(WORKFLOWS_YAML_DIR, tool.workflow_file);
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    bySlug[tool.slug] = extractCredits(content);
  }
  return bySlug;
}


function findOutputFile(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return files.find((f) => /\.(gif|webp|png|jpe?g|svg)$/i.test(f)) || null;
}

function buildWorkflowPage(tool) {
  const dir = path.join(WORKFLOWS_DIR, tool.slug);
  fs.mkdirSync(dir, { recursive: true });

  const outputFile = findOutputFile(dir);
  const badge = badgeUrl(tool.workflow_file);
  const actions = actionsUrl(tool.workflow_file);

  const previewBlock = outputFile
    ? `<p><img class="preview" src="${outputFile}" alt="${tool.name} output"></p>`
    : `<p class="meta">No output generated yet. Run the workflow to populate this page.</p>`;

  const html = `${HEAD(tool.name, 1)}
<a class="back-link" href="../../index.html">&larr; All workflows</a>
<h1>${tool.name}</h1>
<p class="badge"><a href="${actions}"><img src="${badge}" alt="build status"></a></p>
${previewBlock}
<p class="meta">Workflow file: <code>.github/workflows/${tool.workflow_file}</code></p>
${FOOT}`;

  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function buildIndexPage(tools) {
  const items = tools
    .map(
      (t) => `  <li>
    <a href="workflows/${t.slug}/index.html">${t.name}</a>
  </li>`
    )
    .join("\n");

  return `${HEAD("Workflow Showcase", 0)}
<h1>Workflow Showcase</h1>
<p>A running collection of GitHub Actions workflows I've tried, each with its generated output.</p>
<ul class="workflow-list">
${items}
</ul>
<p><a href="credits.html">Credits &rarr;</a></p>
${FOOT}`;
}

function buildCreditsPage(tools, creditsBySlug) {
  const sections = tools
    .map((t) => {
      const credits = creditsBySlug[t.slug] || [];
      if (credits.length === 0) {
        return `  <li>
    <strong>${t.name}</strong>
    <p class="meta">No external action or API detected.</p>
  </li>`;
      }
      const links = credits
        .map((c) => {
          const tag = c.type === "action" ? "GitHub Action" : "API";
          return `<a href="${c.url}">${c.label}</a> <span class="meta">(${tag}${
            c.detail && c.type === "action" ? ` @ ${c.detail}` : ""
          })</span>`;
        })
        .join("<br>");
      return `  <li>
    <strong>${t.name}</strong>
    <p>${links}</p>
  </li>`;
    })
    .join("\n");

  return `${HEAD("Credits", 0)}
<a class="back-link" href="index.html">&larr; All workflows</a>
<h1>Credits</h1>
<p>Every workflow on this site relies on an open-source GitHub Action, a free public API, or both. This page is generated automatically from <code>.github/workflows/</code> — nothing here is hand-typed.</p>
<ul class="workflow-list">
${sections}
</ul>
${FOOT}`;
}
function main() {
  const tools = discoverTools();

  if (tools.length === 0) {
    console.log("No tool workflows found under .github/workflows/.");
  }

  for (const tool of tools) {
    console.log(`Building page: ${tool.name} (${tool.slug})`);
    buildWorkflowPage(tool);
  }

  const creditsBySlug = discoverCredits(tools);
  fs.writeFileSync(path.join(ROOT, "credits.html"), buildCreditsPage(tools, creditsBySlug));
  console.log("Building page: Credits (credits.html)");

  fs.writeFileSync(path.join(ROOT, "index.html"), buildIndexPage(tools));
  console.log("Done.");
}

main();
