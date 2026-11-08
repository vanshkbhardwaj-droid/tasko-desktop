# Signing setup

For a public macOS release, configure these GitHub Actions secrets: `TASKO_MACOS_CSC_LINK`, `TASKO_MACOS_CSC_KEY_PASSWORD`, `TASKO_APPLE_ID`, `TASKO_APPLE_APP_SPECIFIC_PASSWORD`, and `TASKO_APPLE_TEAM_ID`. They supply the Developer ID Application certificate and optional notarization configuration to Electron Builder. The pipeline labels macOS as `signed` only after `codesign --verify --deep --strict --verbose=2` passes for the packaged app and it reports a `Developer ID Application` authority. This signing-state check does **not** verify or attest to notarization.

For a public Windows release, configure `TASKO_WINDOWS_CSC_LINK` and `TASKO_WINDOWS_CSC_KEY_PASSWORD` with the Authenticode certificate and matching password. This release line builds Windows x64 only; do not claim ARM64 support until a separate ARM64 build and test lane exists. It labels Windows as `signed` only when PowerShell reports a valid Authenticode signature for the actual NSIS installer.

Until those credentials exist, the workflow still produces unsigned development installers. macOS Gatekeeper and Windows SmartScreen warnings are expected for unsigned development artifacts; do not tell users they are signed. Each prerelease publishes `SHA256SUMS.txt` and `TASKO_RELEASE_STATUS.json`, so the website can display the per-installer checksum and verified signing state without guessing.

For immediate website metadata refresh after publishing, create matching `TASKO_RELEASE_REVALIDATE_URL` and `TASKO_RELEASE_REVALIDATE_SECRET` GitHub Actions secrets. The URL must be the Tasko website's protected endpoint; the secret is transmitted in the `x-tasko-release-revalidate` header and must match the Vercel environment variable of the same secret value.
