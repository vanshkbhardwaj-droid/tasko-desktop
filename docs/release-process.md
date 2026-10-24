# Release process

1. Make the change, add focused tests, and run `npm run verify`.
2. Update `CHANGELOG.md` and bump the version in `package.json`.
3. Build unsigned installers locally with `npm run make:mac` and `npm run make:windows` where supported; run `npm run size:check` against release artifacts.
4. Tag the release as `v<version>` and push it to the Tasko Desktop GitHub repository. The workflow builds macOS and Windows installers, tests the security boundary, and enforces a 300–600 MB installer policy.
5. Only turn on public publishing after Apple Developer ID/notarization and Windows Authenticode secrets are configured. Unsigned builds are development artifacts and should be labelled as such.

Updates use GitHub Releases through electron-updater. The app checks at launch and every four hours, downloads in the background, and presents an install-on-quit banner. Every database migration makes a backup first.
