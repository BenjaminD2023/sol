# Maintained device build

Origin is BenjaminD2023/sol; upstream is ospfranco/sol. The current
`local/benjamin-sol` branch combines the five independent public feature branches
with this device's Student Hub integration. Only the `codex/*` feature branches
are intended for upstream pull requests. Never include the local branch or this
file in an upstream PR.

The pushed public branches are `codex/unit-conversions`,
`codex/offline-dictionary`, `codex/configurable-shortcuts`,
`codex/quit-running-apps`, and `codex/spotlight-file-search`.

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
Type `/` to browse Student Hub's complete shared command catalog. `/todo`,
`/capture`, and `/countdown` open inline drafts with explicit confirmation.
Specialized commands and natural-language actions open Student Hub's native
Quick Command preview with their original text, fields, and confirmation behavior.
Todo and countdown drafts use Student Hub's own natural-language parser; their
confirmed dates and course IDs are preserved when saved. `/capture` adds to
Student Hub's Scratchpad, matching its native command. Archived and past one-off
countdowns are hidden in Sol; their Student Hub records remain intact.

Student Hub exports an owner-only snapshot at
`~/Library/Application Support/StudentHub/Integrations/sol.json`. It performs
all workspace mutations through authenticated local URL requests and acknowledges
saved changes. Sol never rewrites Student Hub's workspace database. Personal
tasks, bridge tokens, countdown imports and workspace backups must never be committed.

Terminal capture: `studenthub 'Math Homework from Class tmr 10AM'` opens Student
Hub's draft. `sol 'Math Homework from Class tmr 10AM'` opens the Sol draft.
The Sol shim also accepts slash commands, such as
`sol '/countdown Exam Friday'` or `sol '/capture Something to remember'`.

Physical conversions and dictionary lookups stay offline. Explicit currency
conversions contact Frankfurter with the currency pair only. Telemetry,
translation, remote favicons, flight lookups, and automatic browser-search
fallback are disabled. Sparkle update checks are the separate maintenance
connection explicitly requested for this fork.

## Verification status (2026-11-11)

Installed signed build 1006. TypeScript, 47 Bun tests, 4 terminal CLI tests,
native dictionary/shortcut/application-quit/file-search harnesses and Release
build/signature checks passed. Student Hub's 49 targeted tests and disposable
live create/cleanup checks passed, preserving previewed dates and courses; all
existing workspace records were unchanged. The 25 imported countdowns include 5 archived
items; five truncated screenshot titles are stored as shown with notes.

Dashboard spacing and the natural-language todo draft were checked on screen.
The live catalog exports 20 canonical commands and 22 names including aliases.
Specialized commands share Student Hub's existing Quick Command UI; their logic
is not duplicated in Sol. The UI automation service still caches the old upstream
bundle ID for `/Applications/Sol.app`; dashboard and draft screenshots were
checked through the identical signed build product. Individual native command
popups were not exhaustively checked on screen.

Signed build 1006 is published at
https://github.com/BenjaminD2023/sol/releases/tag/benjamin-1006 from source
`54c6babf8ef81a539f52bab3a6c2f7f787c826d3`. The public latest feed and downloaded
archive passed Ed25519 signature, byte-count, metadata, SHA256, and extracted
application signature verification. Future updates use the same Keychain key;
run `scripts/local/publish-update.sh --prepare` for a local signing/verification
pass. The private key must remain in Keychain and must never be printed or committed.
