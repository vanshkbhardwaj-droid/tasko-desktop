# Tasko Desktop

Tasko Desktop is an independent Electron application for macOS and Windows. It is not a browser shortcut, browser extension, or installed web page. The React interface is bundled inside the application; local data is kept in SQLite on the computer.

## Current development downloads

- [Tasko Desktop 0.1.1 macOS x64 DMG](https://github.com/vanshkbhardwaj-droid/tasko-desktop/releases/download/v0.1.1/Tasko-0.1.1-mac-x64.dmg) — 524,765,372 bytes — SHA-256 `c2960eb8d9d3def9e6b74a884fc296da76e80852976975d2ab8cbd32bb402e72`
- [All releases](https://github.com/vanshkbhardwaj-droid/tasko-desktop/releases)

The available DMG is an unsigned development build. macOS will warn until a Developer ID certificate and notarization credentials are configured. Do not describe it as signed.

## Run locally

```bash
npm install
npm run model:download
npm run dev
```

`model:download` fetches and verifies the Qwen 2.5 0.5B GGUF model by byte length and SHA-256. It is excluded from Git because it is 338 MB; it is included in every built installer.

## Verify and package

```bash
npm run verify
npm run make:mac
npm run make:windows
npm run size:check
```

The installer guard accepts only 300–600 MB. The target size comes from Electron/Chromium, the native SQLite and local-model runtime, a useful compact local model, embedded fonts, local help/templates, and offline regional data—never padding.

## Production release requirements

- macOS: Apple Developer ID Application certificate, notarization Apple ID, app-specific password, and Team ID.
- Windows: Authenticode certificate and certificate password.
- GitHub Actions: add the signing credentials as repository secrets before making a non-prerelease release.

The workflow intentionally builds unsigned development artifacts when those credentials are not available. See [signing setup](docs/signing-setup.md), [release process](docs/release-process.md), and [architecture](docs/architecture.md).
