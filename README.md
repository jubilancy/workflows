# Workflow Showcase

A single repo that both **runs** a collection of GitHub Actions workflows I'm
trying out and **hosts** a GitHub Pages site showing each one's output. There
is no registry file to maintain — the site discovers everything on its own.

## How it works

- `scripts/build.js` scans `.github/workflows/*.yml` at build time. Every
  workflow file found there (other than `build-site.yml` itself) is treated
  as a "tool" and gets a page.
- The tool's slug is just its filename without `.yml` — e.g.
  `website-to-gif.yml` → slug `website-to-gif` → page at
  `/workflows/website-to-gif/`.
- Each tool's own workflow job writes its output image directly into
  `workflows/<slug>/` (any `.gif`, `.webp`, `.png`, `.jpg`, or `.svg` file is
  picked up automatically — first match wins).
- `build-site.yml` runs `build.js` and deploys to Pages, on push to any
  workflow/asset/script file, nightly, or manual dispatch.

## Adding a new tool

1. Drop a new workflow file into `.github/workflows/`, following the pattern
   in `website-to-gif.yml`:
   - checks out the repo
   - runs the tool
   - writes its output into `workflows/<filename-without-.yml>/`
   - commits and pushes (with `git pull --rebase origin main` before push, to
     avoid races with other jobs writing to the repo)
2. Push. That's it — nothing else to edit.

The tool's own workflow run commits its output; the next `build-site.yml` run
(automatic on push, nightly, or manual) picks it up and builds the page.

## First-time setup

Before the first push:
- Repo Settings → Pages → Source: **GitHub Actions**
