# Signing setup

For a public macOS release, provide a Developer ID Application certificate, Apple ID, app-specific password, Apple team ID, and notarization configuration to the GitHub Actions secret store. The release pipeline must sign and notarize the application before publishing.

For a public Windows release, provide an Authenticode certificate and matching password through the GitHub Actions secret store. Build both x64 and arm64 installers.

Until those credentials exist, the workflow still produces unsigned development installers. macOS Gatekeeper and Windows SmartScreen warnings are expected for unsigned development artifacts; do not tell users they are signed.
