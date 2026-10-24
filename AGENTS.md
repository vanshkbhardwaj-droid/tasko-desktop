# Tasko Desktop delivery protocol

Tasko Desktop is an independent, local-first Electron application. It must never become a website wrapper.

For every requested change, implement it in this repository, add or update focused tests, run `npm run verify`, bump the semantic version when the change is releasable, update `CHANGELOG.md`, commit, and publish through the release workflow when a GitHub remote and release credentials are available. Never copy website UI, CSS, layouts, or navigation into this project.

- Keep all renderer windows bundled with the app. No remote page may be loaded in a Tasko window.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a restrictive CSP, and a small validated IPC allowlist.
- Store working data in local SQLite. Schema upgrades are append-only, transactional, and must make a backup first.
- Keep customer data local by default. Online services and sign-in open only through the operating system browser after an explicit user action.
- Test security boundaries, data migrations, and user-visible behaviours. Never use junk files merely to change an installer size.
- A production Mac build requires Apple Developer ID and notarization credentials. A production Windows build requires an Authenticode certificate. Missing credentials produce clearly labelled unsigned development installers only.
