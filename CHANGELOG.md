# Changelog

## 0.1.6 — 2026-10-31

- Redesign the desktop splash and first-run setup with a calmer, product-led layout, clearer local-first choices, and reduced-motion support.
- Strengthen dark-theme contrast for text, inputs, navigation, and workspace surfaces.

## 0.1.5 — 2026-10-31

- Replace the Team placeholder with a local roster, availability controls, and weekly-capacity planning.
- Add an append-only SQLite migration and validated IPC endpoints for local team members.

## 0.1.4 — 2026-10-31

- Replace the Inbox placeholder with a local email-draft workspace that opens drafts in the system email app only after an explicit action.
- Add an append-only SQLite migration and validated IPC endpoints for local inbox messages.

## 0.1.3 — 2026-10-31

- Add a local Calendar appointment composer with time validation, travel buffers, and the existing per-person conflict prevention.
- Show the application version supplied by the installed desktop runtime instead of a stale hard-coded value.

## 0.1.2 — 2026-10-24

- Make CI build unsigned installers without implicit publishing, so release artifacts do not require a personal GitHub token in the workflow.

## 0.1.1 — 2026-10-24

- Snapshot the runtime before an updater install and restore the previous local runtime after two consecutive update-launch crashes.
- Add an end-to-end local restart and PDF-generation test using Arabic text and the bundled document font.

## 0.1.0 — 2026-10-24

- Initial standalone Tasko Mission Control foundation.
- Bundled Electron renderer, local SQLite data store, local PDF generation, offline data packs, and a hardened preload bridge.
