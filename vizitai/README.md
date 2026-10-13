# Vizitai

An iPhone appointment book for a hairdresser, in Lithuanian. It runs as a Home Screen web app served from GitHub Pages, and all data stays on the phone.

Status: planning. There is no application code yet.

## Contents

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Full spec: constraints, architecture, data model, screens, flows, iOS rules, Lithuanian strings, suggestions, open decisions, acceptance tests |
| `AGENTS.md` | Rules and build order for coding agents |
| `CLAUDE.md` | Loads `AGENTS.md` and the spec for Claude Code |

## Before the build starts

Settle the items under "Open decisions" in `docs/architecture.md`, especially the service list and the final Pages origin. The origin can't change after go-live without moving her data.

## Deploy

The repo must be named `<account>.github.io` (Settings → Pages → Source: GitHub Actions). A push to `main` builds the app and deploys it to Pages. On the iPhone, open the URL in Safari, tap Share → Add to Home Screen, then always open the app from that icon.
