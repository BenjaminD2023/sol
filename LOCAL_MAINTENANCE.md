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

Keep `/Applications/Sol.app` as the sole installed and running copy. Build
products and backups stay outside Applications. Stop any copy launched from
the build cache after UI testing, then leave the Applications copy running.

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
Opening Sol reads the existing local snapshot without launching or sending
refresh URLs to Student Hub. Student Hub continuously updates that snapshot.
Student Hub's main macOS scene also reuses its existing window for explicit
URL actions via `handlesExternalEvents` on `AppShellView`.
Checkboxes complete/reopen tasks. Delete requires a second click.
Type `/` to browse Student Hub's complete shared command catalog. `/todo`,
`/capture`, and `/countdown` open inline drafts with explicit confirmation.
Enter on a partial command fills its name into Sol. Argument-taking commands
stay in the search field until their text is supplied; suggestions never launch
Student Hub by themselves.
Specialized commands and natural-language actions open Student Hub's native
Quick Command preview with their original text, fields, and confirmation behavior.
Todo and countdown drafts use Student Hub's own natural-language parser; their
confirmed dates and course IDs are preserved when saved. `/capture` adds to
Student Hub's Scratchpad, matching its native command. Archived and past one-off
countdowns are hidden in Sol; their Student Hub records remain intact.

Countdown drafts in both apps detect categories from Student Hub's current
category list, including custom names and English/Chinese event keywords.
Use `#School`, `category:School`, or `分类:School` to name a category explicitly;
quote names containing spaces. Auto follows detection; a manual category or
No category overrides it and stays selected while editing. Removed categories
block confirmation until a valid choice is made. Sol saves the previewed
category UUID, and older snapshots without category support remain compatible.

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

Installed signed build 1008. TypeScript, 50 Bun tests, 4 terminal CLI tests,
native dictionary/shortcut/application-quit/file-search harnesses and Release
build/signature checks passed. Student Hub's 55 targeted tests and disposable
live create/cleanup checks passed, preserving previewed dates and courses; all
existing workspace records were unchanged. The 25 imported countdowns include 5 archived
items; five truncated screenshot titles are stored as shown with notes.

The window fix replayed 20 actual launcher-open callbacks with no Student Hub
launch requests. Both installed application signatures passed strict checks.

Dashboard spacing and the natural-language todo draft were checked on screen.
Enter completion and repeated Enter on an empty countdown command were checked
in the installed Applications copy.
Countdown category detection and selection were checked on screen in both
installed apps, including Sol's Auto, manual category, and No category states.
Student Hub's category build preserved both current Release workspace JSON files
byte-for-byte. UI checks used canceled drafts and did not create records.
The live catalog exports 20 canonical commands and 22 names including aliases.
Specialized commands share Student Hub's existing Quick Command UI; their logic
is not duplicated in Sol. The current UI checks resolved `/Applications/Sol.app`
directly; no build-cache copy was launched. Individual specialized command popups
were not exhaustively checked on screen.

Signed fork updates are published at
https://github.com/BenjaminD2023/sol/releases/latest. The public latest feed and downloaded
archive passed Ed25519 signature, byte-count, metadata, SHA256, and extracted
application signature verification. Future updates use the same Keychain key;
run `scripts/local/publish-update.sh --prepare` for a local signing/verification
pass. The private key must remain in Keychain and must never be printed or committed.
