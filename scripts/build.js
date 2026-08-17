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

  fs.writeFileSync(path.join(ROOT, "index.html"), buildIndexPage(tools));
  console.log("Done.");
}

main();
