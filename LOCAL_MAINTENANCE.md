# Maintained device build

Origin is BenjaminD2023/sol; upstream is ospfranco/sol. The current
`local/benjamin-sol` branch combines the five independent public feature branches
with this device's Student Hub integration. Only the `codex/*` feature branches
are intended for upstream pull requests. Never include the local branch or this
file in an upstream PR.

## Build, install, update

Run `scripts/local/build-install.sh --bump` to typecheck, test, build Release,
sign with the existing Apple Development identity, verify and install. It backs
up the installed application and Sol configuration first. Use the same bundle
identifier (`com.benjamind2023.sol`), signing team (`45PVRUCTSQ`), certificate and
Applications path on future builds so macOS can retain permissions. Initial
permission grants still require macOS user consent. Do not run the upstream
`permissions:reset` script.

After committing and verifying the installed app, run
`scripts/local/publish-update.sh` to push this branch to the fork's
`benjamin/local` branch and publish a signed Sparkle update on **BenjaminD2023/sol**.
The updater checks only the fork's latest `benjamin-appcast.xml` release asset.
The Ed25519 private signing key stays in the login Keychain under account
`benjamin-sol`; only its public key is in source. Future updates need an
increasing CFBundleVersion. Do not use the upstream Fastlane release lane.

This certificate is Apple Development, suitable for this Mac. A public,
notarized distribution would require a Developer ID identity and notarization.
Permissions may require a new grant if the signing identity changes or expires.

## Local tasks

Cmd-Space opens the task dashboard. Click a task or Edit to rename it, change
its details or reschedule it using natural dates.
Checkboxes complete/reopen tasks. Delete requires a second click.
Type a task above and select “Create task” to confirm creation, or use
“Review task in Hub” for Student Hub's full draft preview.

Student Hub exports an owner-only snapshot at
`~/Library/Application Support/StudentHub/Integrations/sol.json`. It performs
all workspace mutations through authenticated local URL requests and acknowledges
saved changes. Sol never rewrites Student Hub's workspace database. Personal
tasks, bridge tokens, countdown imports and workspace backups must never be committed.

Terminal capture: `studenthub 'Math Homework from Class tmr 10AM'` opens a draft
for confirmation. `sol 'Math Homework from Class tmr 10AM'` is an equivalent shim.

Physical conversions and dictionary lookups stay offline. Explicit currency
conversions contact Frankfurter with the currency pair only. Telemetry,
translation, remote favicons, flight lookups, and automatic browser-search
fallback are disabled. Sparkle update checks are the separate maintenance
connection explicitly requested for this fork.

## Verification status (2026-11-11)

Installed signed build 1002. TypeScript, 43 Bun tests, 3 terminal CLI tests,
native dictionary/shortcut/application-quit/file-search harnesses and Release
build/signature checks passed. Student Hub's 28 targeted tests and disposable
live create/edit/reschedule/complete/reopen/delete round trip passed; all 140
original tasks were preserved. The 25 imported countdowns include 5 archived
items; five truncated screenshot titles are stored as shown with notes.

On-screen verification is pending because the Mac was locked. The first update
archive is prepared at `~/Library/Caches/Sol-update-staging/1002/Sol-1002.zip`.
Sparkle's signing tool waited for login Keychain access, so no update feed or
GitHub Release has been published yet. After unlocking the Mac, complete the
on-screen checks and run `scripts/local/publish-update.sh`; approve the signing
tool's access to the newly generated `benjamin-sol` Sparkle key if macOS asks.
The private key must remain in Keychain and must never be printed or committed.
