# Sol

![Header](Header.jpg)

<br/>
<div align="center">
  <a align="center" href="https://twitter.com/ospfranco">
    <img src="https://img.shields.io/twitter/follow/ospfranco?label=Follow%20%40ospfranco&style=social" />
  </a>
</div>

Sol is an open source app launcher, focused on ease of use and speed. It has minimal configuration and runs natively.

[Visit official site](https://sol.ospfranco.com)

## Download

Install via brew

```
brew install --cask sol
```

Or manually download the latest [release](https://github.com/ospfranco/sol/tree/main/releases).

## Discord

Join the Discord

https://discord.gg/W9XmqCQCKP

## Features

- App search
- Custom shortcuts
- Google translate
- Calendar
- Show upcoming appointement in Menu Bar
- Custom AppleScript commands
- Custom links
- Imports browser bookmarks
- Window Manager
- Emoji picker with emoji through [Emoji 17.0](https://unicode.org/Public/17.0.0/emoji/emoji-test.txt), macOS compatibility filtering, and a preferred skin tone
- Clipboard manager
- Notes Scratchpad
- Retrieve Wi-Fi password
- Show IP address
- Start a google meet
- Switch OS theme
- Process killer
- Generate NanoID
- Generate UUID
- Generate lorem ipsum
- Format and paste JSON
- Forward media keys to Spotify/Apple Music
- Blacken Menu Bar
- Quickly evaluate math operations
- Convert units offline and currencies using dated reference rates
- Define words and phrases using installed macOS dictionaries
- Script Runner
- Symbolic Link Support

## Conversions

Type an amount, a source unit, `to` or `in`, and a target unit in the launcher.
For example: `5 feet to cm`, `2.5 kg in pounds`, `-40 °C to °F`, `1 m² to cm²`,
`36 km/h to m/s`, or `1 MB to b`. Unit conversions work offline. Symbols retain
their capitalization (`b` is bits, `B` is bytes, `mW` and `MW` differ).
Digital prefixes follow convert-units' binary factors (1 KB = 1024 B).
Use a decimal point and optional thousands grouping (`1,000.5`); scientific
notation is supported. Results retain up to 12 significant digits.

Currency examples include `100 USD to CNY`, `25 EUR in GBP`, and `$25 to EUR`.
Use ISO currency codes to avoid ambiguous symbols: `$` defaults to USD, `¥` to
JPY, `£` to GBP, and `yuan`/`RMB` to CNY. Frankfurter supplies reference rates;
the result shows the rate date and is not a live trading quote.
Only a recognized, explicit currency conversion triggers a rate request, after
a short typing delay. Only the currency pair leaves the device; amounts and
full search queries stay local. Rates are cached for six hours during the app
session. An older cached rate remains usable after a network failure and is
marked as cached/offline. Without a cached rate, Sol shows `Rate unavailable`.
Press Return on a conversion result to copy it with its units and rate date.

Rate API documentation: [Frankfurter](https://frankfurter.dev/).
## Dictionary

Type `define hello` or `define déjà vu` in the launcher to read the definition
from your active installed macOS dictionaries. Lookup is offline and uses
Apple's Dictionary Services, including your dictionary language and priority
settings. The first matching definition is shown in a scrollable result;
press Return to copy the complete definition.

If a word is missing, use **Open Dictionary**, then **Dictionary → Settings**
to enable or download the dictionaries you want. Downloads are managed by
macOS; Sol performs no dictionary downloads or web fallback searches.

## Emoji compatibility

Sol keeps its macOS 14.0 minimum and shows only emoji supported by the installed macOS version.
Newer entries carry a minimum macOS version in the bundled catalog:

| Emoji additions | Minimum macOS |
| --- | --- |
| Through Emoji 15.0 | 14.0 (Sol's minimum) |
| Emoji 15.1 | [14.4](https://support.apple.com/en-us/109035) |
| Emoji 16.0 | [15.4](https://support.apple.com/en-us/120283) |
| Emoji 17.0 | [26.4](https://support.apple.com/en-us/122868) |

Version checks compare numeric components and accept later releases automatically; no annual compatibility update is required for existing entries.
Unsupported emoji are excluded from browsing, search, and the seven-entry favorites row, but their saved usage counts are retained.
When those emoji become supported after an OS upgrade, they participate in the normal top-seven favorites ranking.

### Preferred skin tone

Set the preferred skin tone under Settings → General → Emoji Skin Tone.
Choose default yellow or one of five skin tones; the preference is saved as `emojiSkinTone` in `~/.config/sol/config.json`.

Browsing, search, favorites, and insertion use the selected tone wherever Unicode defines a matching variant.
Emoji without tone variants remain unchanged.
Changing the preference preserves favorites and usage counts, which remain associated with the original default emoji.
For multi-person emoji, the global preference applies the same tone to everyone where Unicode defines that variant; mixed tones and one-off overrides are not included.

Tone variants follow their own minimum macOS version, which can be newer than the default emoji.
For example, bunny-ear and wrestling emoji gained tones in Emoji 17.0 and require macOS 26.4 for those variants.
When the preferred variant is unsupported, Sol keeps the supported default emoji available.

## Contributing

You need to set up your machine for macOS development with React Native. Basically you need to install:

- Mise (https://mise.jdx.dev/)
- Xcode
- Cocoapods

Follow any of the online tutorials to set up your machine for iOS/MacOS React Native development.

Once you have everything installed run the following commands

```sh
mise plugin add cocoapods
# To enable hooks
mise settings experimental=true
# Will install all bun, ruby and run the installation of dependencies
mise install

# You can then run the app with
bun macos
```

## License

MIT License

### Keyboard shortcuts

In **Settings → General**, click **Change…** beside Global Shortcut and press a
combination with Command, Option, or Control plus a letter, number, Space,
Return, or arrow key. Escape cancels. Reset restores Option-Space. Existing
Command-Space, Option-Space, and Control-Space preferences remain compatible.

**Settings → Global Shortcuts** also lets you change or clear individual action
shortcuts. Duplicate combinations (including different modifier orders) are
rejected. Shortcut recording works within Sol without Accessibility permission.
If the launcher uses one of the action defaults, change the launcher before
restoring action defaults. Invalid or duplicate imported assignments are cleared.
The system may reserve a combination; disable a conflicting macOS shortcut in
System Settings → Keyboard → Keyboard Shortcuts before assigning it to Sol.
