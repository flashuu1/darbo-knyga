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

## Deploy (after M0)

Push to `main`, and GitHub Actions builds the app and publishes it to Pages. On the iPhone, open the URL in Safari, tap Share and add it to the Home Screen, then always open it from that icon.
