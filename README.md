# Citric

A small, self-hosted Safari extension that swaps YouTube's heavy stock player
for a lean native HTML5 `<video>` element. No accounts, no tracking, no
clutter — just the video, playing directly in the browser.

Citric is a free, open-source alternative to paid YouTube clean-up tools. It
does **not** block ads, alter recommendations, or touch your viewing history.
It simply replaces the player chrome so the video renders natively.

---

## Why Citric?

- **Lighter playback** — the stock YouTube player ships with a lot of logic,
  telemetry hooks and UI chrome around the actual video. Citric strips it away
  and plays the same stream in a plain `<video>` tag.
- **Native controls** — playback sits on Safari's own media engine, so AirPlay,
  Picture-in-Picture, keyboard controls and the system volume OSD just work.
- **Privately hosted** — install it straight from this repository. There is no
  App Store fee, no review process, and no code executed server-side.
- **SPA-friendly** — clicking through recommended videos never leaves a black
  frame; the player resets cleanly on every client-side navigation.

## How it works

At `document_start`, Citric waits for YouTube's `#movie_player` container, then:

1. Pauses the underlying player and strips its DOM so it stops decoding and
   reporting playback telemetry.
2. Reads the current stream URL from `window.ytInitialPlayerResponse` (or the
   rendered player's live response during later navigations).
3. Injects a native `<video>` element with Safari-friendly attributes
   (`playsinline`, `webkit-playsinline`, `x-webkit-airplay="allow"`).
4. Listens for YouTube's `yt-navigate-finish` events and a
   `MutationObserver` backstop, so the native player is re-created cleanly
   whenever you click to another video without a full page reload.

The chosen stream is always a single progressive (muxed audio + video) format.
Adaptive-only streams are left untouched — if YouTube only offers a
separated-audio setup, Citric steps aside and the stock player takes over, so
playback never breaks.

## Getting the code

```sh
git clone https://github.com/<your-user>/citric-safari.git
cd citric-safari
```

No build step is required. The extension is plain JavaScript + a manifest.

## Installing in Safari

These steps enable the Safari *Develop* menu and load the unpacked extension.
They only need to be repeated when you pull updated code.

### 1. Enable the Develop menu

1. Open Safari.
2. Choose **Safari → Settings** (or press <kbd>⌘</kbd><kbd>,</kbd>).
3. Open the **Advanced** tab.
4. Tick **"Show features for web developers"** at the bottom of the window.

You should now see a **Develop** menu in the menu bar.

> Some macOS releases call this option "Show Develop menu in menu bar". It is
> the same checkbox.

### 2. Load Citric as a temporary extension

1. In Safari, choose **Develop → Show Extension Builder**.
2. In the **Extension Builder** window, click the **+** button (bottom left)
   and choose **Add Extension**.
3. Select the `manifest.json` file inside the cloned `citric-safari` folder.
4. Safari loads it under the name **Citric** (the vector icon shows a lemon
   slice).
5. Click **Install …** and confirm with **Install**.

Citric is now active. Open any YouTube watch page and the player will render
natively.

> Temporary extensions stay installed until Safari quits. To keep Citric
> installed across restarts, choose **File → Save** from the Extension Builder
> menu bar once it is loaded — that pins it to your profile.

### 3. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Extension grayed out in Extension Builder | Internet Accounts / profiles conflict | Switch to the profile that owns Safari's settings, or toggle **Allow websites to check if Apple Pay, Extensions and AppleScript are available** in Develop settings |
| Player unchanged on YouTube | YouTube served an adaptive-only stream | Nothing to do — Citric steps aside by design. Playback keeps working normally |
| Native player appears but the page shows a black bar | The container height was read before layout | Refresh the page once; rate-limited route changes settle the layout |
| No captions listed in the CC menu | Timedtext requires the `fmt=vtt` hint | Tracks are built lazily; re-open the CC picker after the video starts |

## Permissions & privacy

Citric requests a minimal permission set:

- `activeTab` — used to attach to the active YouTube tab.
- `scripting` — reserved for programmatic reloads of the content script.

There is no network permission, no remote code, no analytics. The extension
behaves entirely inside the tab that loads `content.js`.

## Repository layout

```
citric-safari/
├── manifest.json      # Manifest V3 configuration
├── content.js         # Player replacement + SPA navigation handling
├── icons/             # Lemon-slice icons at 16/32/128/256 px
├── LICENSE            # MIT
└── README.md
```

## Development

- The content script is a single file with no dependencies. Edit
  `content.js`, then reload the extension in **Extension Builder** and check
  the changes on a YouTube watch page.
- Useful debugging tools:
  - **Develop → Show Page Source** — confirm `content.js` loaded.
  - **Develop → Start Debugging JavaScript** — follow `[citric]` console
    messages as the player swaps.

### Running a quick check

```sh
node --check content.js   # syntax sanity check
```

### Contribution guidelines

1. Fork the repository and work on a feature branch.
2. Keep changes focused on playback reliability and Safari compatibility.
3. Verify against a real YouTube watch page before opening a pull request.
4. Mention whether your change touches the SPA navigation path — that's the
   most sensitive area.

## License

[MIT](./LICENSE) — do what you like, keep the copyright notice.