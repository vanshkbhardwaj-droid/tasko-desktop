# Tasko Desktop

Tasko Desktop is an independent Electron application for macOS and Windows. It is not a browser shortcut, browser extension, or installed web page. The React interface is bundled inside the application; local data is kept in SQLite on the computer.

## Development downloads

- [All releases](https://github.com/vanshkbhardwaj-droid/tasko-desktop/releases)

Every release page is the source of truth for its current installer URLs, exact file sizes, `SHA256SUMS.txt`, and `TASKO_RELEASE_STATUS.json`. Do not copy an old installer URL into product copy.

Current desktop targets are macOS x64 (Intel) and Windows x64. The development prerelease workflow does not publish an ARM64 Windows build. Unsigned development installers may trigger macOS Gatekeeper or Windows SmartScreen; they must never be described as signed.

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
npm run size:check -- --platform=macos
npm run size:check -- --platform=windows
```

The installer guard rejects a missing, tiny stub (under 25 MiB), or an unexpectedly huge artifact (over 2 GiB). Its real size comes from Electron/Chromium, the native SQLite and local-model runtime, bundled fonts, local help/templates, and offline regional data—never padding.

## Production release requirements

- macOS: Apple Developer ID Application certificate, notarization Apple ID, app-specific password, and Team ID.
- Windows: Authenticode certificate and certificate password.
- GitHub Actions: add the signing credentials as repository secrets before making a non-prerelease release. To notify the Tasko website immediately after a release, add `TASKO_RELEASE_REVALIDATE_URL` and `TASKO_RELEASE_REVALIDATE_SECRET` as repository secrets. The URL must target the website's protected revalidation endpoint and the secret is sent only in the `x-tasko-release-revalidate` request header.

The workflow intentionally builds unsigned development artifacts when those credentials are not available. See [signing setup](docs/signing-setup.md), [release process](docs/release-process.md), and [architecture](docs/architecture.md).
