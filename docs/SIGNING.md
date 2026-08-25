# Signing & notarization — fill in when ready

The build pipeline is **already wired end-to-end**: a `v*` tag builds installers
for macOS / Windows / Linux and publishes them to a GitHub Release. Until secrets
are configured, builds proceed **unsigned** (macOS users: right-click → Open;
Windows: SmartScreen → More info → Run anyway).

When the certs arrive, add these GitHub Actions secrets — no code changes needed.

## macOS (sign + notarize)

| Secret | Value | How to get it |
|---|---|---|
| `CSC_LINK` | Base64 of the **Developer ID Application** `.p12` | App Store Connect → Certificates; export from Keychain Access as `.p12`, then `base64 -i cert.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | The `.p12` export password | Chosen at export |
| `NOTARIZE_APPLE_ID` | Apple ID email | Your developer account login |
| `NOTARIZE_APPLE_PASSWORD` | **App-specific password** | appleid.apple.com → Sign-In & Security → App-Specific Passwords |
| `NOTARIZE_APPLE_TEAM_ID` | 10-char Team ID | App Store Connect → Membership details |

`scripts/notarize.js` (afterSign hook) reads the `NOTARIZE_APPLE_*` trio via
notarytool and staples the ticket — it no-ops without creds.

## Windows (Azure Trusted Signing)

electron-builder here is v25.x, which has no native Azure signing — use a
`win.sign` custom hook calling Microsoft's `trusted-signing-cli` (or bump to
electron-builder ≥ 26 for built-in `azureSignOptions`). Secrets once configured:

- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (App registration
  with Trusted Signing Account Contributor role)
- Account name + certificate profile name (goes in the sign config)
