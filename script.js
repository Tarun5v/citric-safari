/* citric — Safari MV3 port of the real Vinegar YouTube wrapper.
 *
 * This file is assembled at build time from two halves:
 *
 *   Part 1 (BELOW): a tiny transport shim. It reimplements the handful of
 *   Safari native-layer calls that the real extension makes, so that the
 *   byte-identical player script that follows can run unmodified inside a
 *   plain MV3 content script.
 *
 *   Part 2 (CONCATENATED AFTER THIS BLOCK): the real Vinegar content script,
 *   taken verbatim from Vinegar.app. It is not rewritten here — not one line
 *   — because the whole point of this project is that the paying user gets
 *   the real player chrome, styled by the real stylesheet.
 *
 * The stylesheet (style.css) is also byte-identical to Vinegar's. Between the
 * two, this extension renders the genuine toolbar: quality, loop, replay,
 * theater, captions, the auto-hiding "showing/removing" protocol, caption
 * tracks built from the player response, autoplay handling)Skip and ad
 * cleanup.
 */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Transport
   * ------------------------------------------------------------------ */

  const SETTINGS_KEY = "citric.settings";
  const DEFAULT_SETTINGS = {
    autoplay: false,
    quality: "best",
    showToolbar: true,
    subtitles: "system",
  };

  let storedSettings = DEFAULT_SETTINGS;

  function readSettings() {
    let stored = DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) stored = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (err) {
      // persist failures are harmless; fall back to defaults
    }
    return stored;
  }

  function writeSettings(next) {
    storedSettings = next;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (err) {
      // ignore
    }
  }

  const messageHandlers = [];

  function emitMessage(event) {
    messageHandlers.slice().forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        // a dead listener must not swallow the rest
      }
    });
  }

  /* The real script demands two message names, exactly as the native Safari
   * layer would deliver them:
   *
   *   { name: "youtubeSuccess", message: { response: <playerResponse> } }
   *   { name: "settings", message: { autoplay, quality, showToolbar, subtitles } }
   *
   * And it sends exactly these outbound messages:
   *
   *   safari.extension.dispatchMessage("youtube",  { videoId })
   *   safari.extension.dispatchMessage("updateQuality", { quality })
   *   safari.extension.dispatchMessage("refreshSettings")
   */

  function resolvePlayer(videoId) {
    const url =
      "https://www.youtube.com/get_video_info?video_id=" +
      encodeURIComponent(videoId) +
      "&ps=default&eurl=&gl=US&hl=en&html5=1&c=TVHTML5";
    return fetch(url, { credentials: "include" })
      .then((response) => response.text())
      .then((text) => {
        const params = new URLSearchParams(text);
        const payload = params.get("player_response");
        if (!payload) throw new Error("missing player_response");
        const player = JSON.parse(payload);
        decorate(player);
        return player;
      });
  }

  /* Vinegar.extension resolved the player response natively and stashed two
   * extra fields on it that the script relies on: an audio-only stream
   * (n.audio) and the caption tracks (n.captions), each in the exact shape
   * the real player_re'd. We recreate that here from player_response. */
  function decorate(player) {
    if (!player) return;
    const formats =
      (player.streamingData && player.streamingData.adaptiveFormats) || [];
    const audioFormat = formats.find(
      (format) =>
        format &&
        format.mimeType &&
        format.mimeType.indexOf("audio/") === 0 &&
        format.url,
    );
    if (audioFormat) {
      if (!player.audio) player.audio = {};
      player.audio.url = audioFormat.url;
    }

    const renderer =
      (player.captions &&
        player.captions.playerCaptionsTracklistRenderer) ||
      null;
    const tracks = (renderer && renderer.captionTracks) || [];
    if (tracks.length) {
      player.captions = tracks.map((track) => ({
        baseUrl: track.baseUrl,
        languageCode: track.languageCode,
        name: {
          runs: [
            {
              text:
                (track.name &&
                  (track.name.simpleText ||
                    (track.name.runs &&
                      track.name.runs.map((run) => run.text).join("")))) ||
                track.languageCode,
            },
          ],
        },
      }));
    }
  }

  /* The Safari-native stand-in. real.js touches only these five points: four
   * dispatchMessage calls and one safari.self.addEventListener("message").
   * All of them are non-null objects whose methods behave like the originals
   * but run purely in-page. */
  const safari = {
    extension: {
      dispatchMessage(name, message) {
        if (name === "youtube") {
          const videoId = message && message.videoId;
          if (!videoId) return;
          resolvePlayer(videoId)
            .then((player) => {
              emitMessage({
                name: "youtubeSuccess",
                message: { response: player },
              });
            })
            .catch(() => {
              emitMessage({
                name: "youtubeSuccess",
                message: { response: null },
              });
            });
        } else if (name === "refreshSettings") {
          emitMessage({ name: "settings", message: readSettings() });
        } else if (name === "updateQuality") {
          const quality = message && message.quality;
          if (quality) {
            const next = readSettings();
            next.quality = quality;
            writeSettings(next);
          }
        }
      },
    },
    self: {
      addEventListener(type, handler) {
        if (type === "message" && typeof handler === "function") {
          messageHandlers.push(handler);
        }
      },
    },
  };

  window.safari = safari;

  /* Real Vinegar hands SPA navigations to the settings refresh path. Emit
   * settings once on load so the toolbar builds immediately. */
  safari.extension.dispatchMessage("refreshSettings");
})();
(() => {
  if (location.pathname.startsWith("/shorts/")) return;
  let t, e, a, r, s, n;
  let i = document.createElement("script");

  function o(t) {
    return t.startsWith("af")
      ? "Afrikaans"
      : t.startsWith("sq")
        ? "Albanian"
        : t.startsWith("am")
          ? "Amharic"
          : t.startsWith("ar")
            ? "Arabic"
            : t.startsWith("hy")
              ? "Armenian"
              : t.startsWith("az")
                ? "Azerbaijani"
                : t.startsWith("bn")
                  ? "Bangla"
                  : t.startsWith("eu")
                    ? "Basque"
                    : t.startsWith("be")
                      ? "Belarusian"
                      : t.startsWith("bs")
                        ? "Bosnian"
                        : t.startsWith("bg")
                          ? "Bulgarian"
                          : t.startsWith("my")
                            ? "Burmese"
                            : t.startsWith("ca")
                              ? "Catalan"
                              : t.startsWith("ceb")
                                ? "Cebuano"
                                : t.startsWith("zh")
                                  ? "Chinese"
                                  : t.startsWith("co")
                                    ? "Corsican"
                                    : t.startsWith("hr")
                                      ? "Croatian"
                                      : t.startsWith("cs")
                                        ? "Czech"
                                        : t.startsWith("da")
                                          ? "Danish"
                                          : t.startsWith("nl")
                                            ? "Dutch"
                                            : t.startsWith("en")
                                              ? "English"
                                              : t.startsWith("eo")
                                                ? "Esperanto"
                                                : t.startsWith("et")
                                                  ? "Estonian"
                                                  : t.startsWith("tl") ||
                                                      t.startsWith("fil")
                                                    ? "Filipino"
                                                    : t.startsWith("fi")
                                                      ? "Finnish"
                                                      : t.startsWith("fr")
                                                        ? "French"
                                                        : t.startsWith("gl")
                                                          ? "Galician"
                                                          : t.startsWith("ka")
                                                            ? "Georgian"
                                                            : t.startsWith("de")
                                                              ? "German"
                                                              : t.startsWith(
                                                                    "el",
                                                                  )
                                                                ? "Greek"
                                                                : t.startsWith(
                                                                      "gu",
                                                                    )
                                                                  ? "Gujarati"
                                                                  : t.startsWith(
                                                                        "ht",
                                                                      )
                                                                    ? "Haitian Creole"
                                                                    : t.startsWith(
                                                                          "haw",
                                                                        )
                                                                      ? "Hawaiian"
                                                                      : t.startsWith(
                                                                            "ha",
                                                                          )
                                                                        ? "Hausa"
                                                                        : t.startsWith(
                                                                              "iw",
                                                                            ) ||
                                                                            t.startsWith(
                                                                              "he",
                                                                            )
                                                                          ? "Hebrew"
                                                                          : t.startsWith(
                                                                                "hi",
                                                                              )
                                                                            ? "Hindi"
                                                                            : t.startsWith(
                                                                                  "hmn",
                                                                                )
                                                                              ? "Hmong"
                                                                              : t.startsWith(
                                                                                    "hu",
                                                                                  )
                                                                                ? "Hungarian"
                                                                                : t.startsWith(
                                                                                      "is",
                                                                                    )
                                                                                  ? "Icelandic"
                                                                                  : t.startsWith(
                                                                                        "ig",
                                                                                      )
                                                                                    ? "Igbo"
                                                                                    : t.startsWith(
                                                                                          "id",
                                                                                        )
                                                                                      ? "Indonesian"
                                                                                      : t.startsWith(
                                                                                            "ga",
                                                                                          )
                                                                                        ? "Irish"
                                                                                        : t.startsWith(
                                                                                              "it",
                                                                                            )
                                                                                          ? "Italian"
                                                                                          : t.startsWith(
                                                                                                "jp",
                                                                                              )
                                                                                            ? "Japanese"
                                                                                            : t.startsWith(
                                                                                                  "jv",
                                                                                                )
                                                                                              ? "Javanese"
                                                                                              : t.startsWith(
                                                                                                    "kn",
                                                                                                  )
                                                                                                ? "Kannada"
                                                                                                : t.startsWith(
                                                                                                      "kk",
                                                                                                    )
                                                                                                  ? "Kazakh"
                                                                                                  : t.startsWith(
                                                                                                        "km",
                                                                                                      )
                                                                                                    ? "Khmer"
                                                                                                    : t.startsWith(
                                                                                                          "rw",
                                                                                                        )
                                                                                                      ? "Kinyarwanda"
                                                                                                      : t.startsWith(
                                                                                                            "ko",
                                                                                                          )
                                                                                                        ? "Korean"
                                                                                                        : t.startsWith(
                                                                                                              "ku",
                                                                                                            )
                                                                                                          ? "Kurdish"
                                                                                                          : t.startsWith(
                                                                                                                "ky",
                                                                                                              )
                                                                                                            ? "Kyrgyz"
                                                                                                            : t.startsWith(
                                                                                                                  "lo",
                                                                                                                )
                                                                                                              ? "Lao"
                                                                                                              : t.startsWith(
                                                                                                                    "la",
                                                                                                                  )
                                                                                                                ? "Latin"
                                                                                                                : t.startsWith(
                                                                                                                      "lv",
                                                                                                                    )
                                                                                                                  ? "Latvian"
                                                                                                                  : t.startsWith(
                                                                                                                        "lt",
                                                                                                                      )
                                                                                                                    ? "Lithuanian"
                                                                                                                    : t.startsWith(
                                                                                                                          "lb",
                                                                                                                        )
                                                                                                                      ? "Luxembourgish"
                                                                                                                      : t.startsWith(
                                                                                                                            "mk",
                                                                                                                          )
                                                                                                                        ? "Macedonian"
                                                                                                                        : t.startsWith(
                                                                                                                              "mg",
                                                                                                                            )
                                                                                                                          ? "Malagasy"
                                                                                                                          : t.startsWith(
                                                                                                                                "ms",
                                                                                                                              )
                                                                                                                            ? "Malay"
                                                                                                                            : t.startsWith(
                                                                                                                                  "ml",
                                                                                                                                )
                                                                                                                              ? "Malayalam"
                                                                                                                              : t.startsWith(
                                                                                                                                    "mt",
                                                                                                                                  )
                                                                                                                                ? "Maltese"
                                                                                                                                : t.startsWith(
                                                                                                                                      "mi",
                                                                                                                                    )
                                                                                                                                  ? "Maori"
                                                                                                                                  : t.startsWith(
                                                                                                                                        "mr",
                                                                                                                                      )
                                                                                                                                    ? "Marathi"
                                                                                                                                    : t.startsWith(
                                                                                                                                          "mn",
                                                                                                                                        )
                                                                                                                                      ? "Mongolian"
                                                                                                                                      : t.startsWith(
                                                                                                                                            "ne",
                                                                                                                                          )
                                                                                                                                        ? "Nepali"
                                                                                                                                        : t.startsWith(
                                                                                                                                              "nb",
                                                                                                                                            ) ||
                                                                                                                                            t.startsWith(
                                                                                                                                              "nn",
                                                                                                                                            ) ||
                                                                                                                                            t.startsWith(
                                                                                                                                              "no",
                                                                                                                                            )
                                                                                                                                          ? "Norwegian"
                                                                                                                                          : t.startsWith(
                                                                                                                                                "ny",
                                                                                                                                              )
                                                                                                                                            ? "Nyanja"
                                                                                                                                            : t.startsWith(
                                                                                                                                                  "or",
                                                                                                                                                )
                                                                                                                                              ? "Odia"
                                                                                                                                              : t.startsWith(
                                                                                                                                                    "ps",
                                                                                                                                                  )
                                                                                                                                                ? "Pashto"
                                                                                                                                                : t.startsWith(
                                                                                                                                                      "fa",
                                                                                                                                                    )
                                                                                                                                                  ? "Persian"
                                                                                                                                                  : t.startsWith(
                                                                                                                                                        "pl",
                                                                                                                                                      )
                                                                                                                                                    ? "Polish"
                                                                                                                                                    : t.startsWith(
                                                                                                                                                          "pt",
                                                                                                                                                        )
                                                                                                                                                      ? "Portuguese"
                                                                                                                                                      : t.startsWith(
                                                                                                                                                            "pa",
                                                                                                                                                          )
                                                                                                                                                        ? "Punjabi"
                                                                                                                                                        : t.startsWith(
                                                                                                                                                              "ro",
                                                                                                                                                            )
                                                                                                                                                          ? "Romanian"
                                                                                                                                                          : t.startsWith(
                                                                                                                                                                "ru",
                                                                                                                                                              )
                                                                                                                                                            ? "Russian"
                                                                                                                                                            : t.startsWith(
                                                                                                                                                                  "sm",
                                                                                                                                                                )
                                                                                                                                                              ? "Samoan"
                                                                                                                                                              : t.startsWith(
                                                                                                                                                                    "gd",
                                                                                                                                                                  )
                                                                                                                                                                ? "Scottish Gaelic"
                                                                                                                                                                : t.startsWith(
                                                                                                                                                                      "sr",
                                                                                                                                                                    )
                                                                                                                                                                  ? "Serbian"
                                                                                                                                                                  : t.startsWith(
                                                                                                                                                                        "sn",
                                                                                                                                                                      )
                                                                                                                                                                    ? "Shona"
                                                                                                                                                                    : t.startsWith(
                                                                                                                                                                          "sd",
                                                                                                                                                                        )
                                                                                                                                                                      ? "Sindhi"
                                                                                                                                                                      : t.startsWith(
                                                                                                                                                                            "si",
                                                                                                                                                                          )
                                                                                                                                                                        ? "Sinhala"
                                                                                                                                                                        : t.startsWith(
                                                                                                                                                                              "sk",
                                                                                                                                                                            )
                                                                                                                                                                          ? "Slovak"
                                                                                                                                                                          : t.startsWith(
                                                                                                                                                                                "sl",
                                                                                                                                                                              )
                                                                                                                                                                            ? "Slovenian"
                                                                                                                                                                            : t.startsWith(
                                                                                                                                                                                  "so",
                                                                                                                                                                                )
                                                                                                                                                                              ? "Somali"
                                                                                                                                                                              : t.startsWith(
                                                                                                                                                                                    "st",
                                                                                                                                                                                  )
                                                                                                                                                                                ? "Southern Sotho"
                                                                                                                                                                                : t.startsWith(
                                                                                                                                                                                      "es",
                                                                                                                                                                                    )
                                                                                                                                                                                  ? "Spanish"
                                                                                                                                                                                  : t.startsWith(
                                                                                                                                                                                        "su",
                                                                                                                                                                                      )
                                                                                                                                                                                    ? "Sudanese"
                                                                                                                                                                                    : t.startsWith(
                                                                                                                                                                                          "sw",
                                                                                                                                                                                        )
                                                                                                                                                                                      ? "Swahili"
                                                                                                                                                                                      : t.startsWith(
                                                                                                                                                                                            "sv",
                                                                                                                                                                                          )
                                                                                                                                                                                        ? "Swedish"
                                                                                                                                                                                        : t.startsWith(
                                                                                                                                                                                              "tg",
                                                                                                                                                                                            )
                                                                                                                                                                                          ? "Tajik"
                                                                                                                                                                                          : t.startsWith(
                                                                                                                                                                                                "ta",
                                                                                                                                                                                              )
                                                                                                                                                                                            ? "Tamil"
                                                                                                                                                                                            : t.startsWith(
                                                                                                                                                                                                  "tt",
                                                                                                                                                                                                )
                                                                                                                                                                                              ? "Tatar"
                                                                                                                                                                                              : t.startsWith(
                                                                                                                                                                                                    "te",
                                                                                                                                                                                                  )
                                                                                                                                                                                                ? "Telugu"
                                                                                                                                                                                                : t.startsWith(
                                                                                                                                                                                                      "th",
                                                                                                                                                                                                    )
                                                                                                                                                                                                  ? "Thai"
                                                                                                                                                                                                  : t.startsWith(
                                                                                                                                                                                                        "tr",
                                                                                                                                                                                                      )
                                                                                                                                                                                                    ? "Turkish"
                                                                                                                                                                                                    : t.startsWith(
                                                                                                                                                                                                          "tk",
                                                                                                                                                                                                        )
                                                                                                                                                                                                      ? "Turkmen"
                                                                                                                                                                                                      : t.startsWith(
                                                                                                                                                                                                            "uk",
                                                                                                                                                                                                          )
                                                                                                                                                                                                        ? "Ukrainian"
                                                                                                                                                                                                        : t.startsWith(
                                                                                                                                                                                                              "ur",
                                                                                                                                                                                                            )
                                                                                                                                                                                                          ? "Urdu"
                                                                                                                                                                                                          : t.startsWith(
                                                                                                                                                                                                                "ug",
                                                                                                                                                                                                              )
                                                                                                                                                                                                            ? "Uyghur"
                                                                                                                                                                                                            : t.startsWith(
                                                                                                                                                                                                                  "uz",
                                                                                                                                                                                                                )
                                                                                                                                                                                                              ? "Uzbek"
                                                                                                                                                                                                              : t.startsWith(
                                                                                                                                                                                                                    "vi",
                                                                                                                                                                                                                  )
                                                                                                                                                                                                                ? "Vietnamese"
                                                                                                                                                                                                                : t.startsWith(
                                                                                                                                                                                                                      "cy",
                                                                                                                                                                                                                    )
                                                                                                                                                                                                                  ? "Welsh"
                                                                                                                                                                                                                  : t.startsWith(
                                                                                                                                                                                                                        "fy",
                                                                                                                                                                                                                      )
                                                                                                                                                                                                                    ? "Western Frisian"
                                                                                                                                                                                                                    : t.startsWith(
                                                                                                                                                                                                                          "xh",
                                                                                                                                                                                                                        )
                                                                                                                                                                                                                      ? "Xhosa"
                                                                                                                                                                                                                      : t.startsWith(
                                                                                                                                                                                                                            "yi",
                                                                                                                                                                                                                          )
                                                                                                                                                                                                                        ? "Yiddish"
                                                                                                                                                                                                                        : t.startsWith(
                                                                                                                                                                                                                              "yo",
                                                                                                                                                                                                                            )
                                                                                                                                                                                                                          ? "Yoruba"
                                                                                                                                                                                                                          : t.startsWith(
                                                                                                                                                                                                                                "zu",
                                                                                                                                                                                                                              )
                                                                                                                                                                                                                            ? "Zulu"
                                                                                                                                                                                                                            : "System";
  }

  function l() {
    if (s === location.href) return;
    (s = location.href),
      (n = null),
      (function () {
        if ("/watch" === location.pathname) {
          let t = location.search.match(/v=(.+?)(&|$)/);
          if (t) {
            let e = t[1];
            safari.extension.dispatchMessage("youtube", {
              videoId: e,
            });
          }
        } else if (location.pathname.startsWith("/embed/")) {
          let t = location.pathname.match(/\/embed\/(.+?)(\?|\/|$)/);
          if (t) {
            let e = t[1];
            safari.extension.dispatchMessage("youtube", {
              videoId: e,
            });
          }
        }
      })();
    let t = document.querySelector("#vinegar-toolbar");
    t && t.remove();
    let e = document.querySelector("video");
    e &&
      (e.removeAttribute("autoplay-setup"),
      e.removeAttribute("toolbar-created"),
      e.removeAttribute("caption-setup"),
      e.querySelectorAll("track").forEach((t) => {
        t.remove();
      })),
      document.querySelectorAll("[vinegared]").forEach((t) => {
        t.removeAttribute("vinegared");
      });
  }

  function d(t, e, a) {
    let r = document.createElement("a");
    return (
      r.classList.add("button", e.toLowerCase()),
      (r.textContent = e),
      r.addEventListener("click", a),
      t.appendChild(r),
      r
    );
  }

  function c(t) {
    (e = t),
      safari.extension.dispatchMessage("updateQuality", {
        quality: t,
      });
  }

  function u() {
    let t = document.querySelector("video:not([toolbar-created])");
    if (!t || !e) return;
    let a = document.createElement("div");
    a.id = "vinegar-toolbar";
    let r = document.createElement("div");
    r.classList.add("left"), a.appendChild(r);
    let s = document.createElement("div");
    s.classList.add("right"), a.appendChild(s);
    let i,
      o = d(r, "Quality", (i) => {
        i.stopPropagation(),
          i.preventDefault(),
          !n ||
            t.readyState < 4 ||
            (r.classList.add("hidden"),
            s.classList.add("hidden"),
            (function (t, a) {
              let r,
                s,
                i = document.querySelector(".ytp-settings-button");
              i &&
                (r = setInterval(() => {
                  i.click();
                  let o = document.querySelectorAll(
                    ".ytp-settings-menu > .ytp-panel > .ytp-panel-menu > .ytp-menuitem",
                  );
                  if (o.length < 2) return;
                  let l = o[o.length - 1];
                  clearInterval(r),
                    (s = setInterval(() => {
                      l.click();
                      let r = document.querySelectorAll(
                        ".ytp-quality-menu .ytp-menuitem",
                      );
                      if (
                        0 !== r.length &&
                        (clearInterval(s),
                        Array.from(r)
                          .reverse()
                          .forEach((t, r) => {
                            let s = t.querySelector("span");
                            if (!s) return;
                            let n = Array.from(s.childNodes)
                              .filter((t) => 3 === t.nodeType)
                              .map((t) => t.nodeValue)
                              .join("")
                              .trim();
                            0 === r && (n = "Auto");
                            let i = n.toLowerCase().replace(/p60.*/, "p"),
                              o = document.createElement("a");
                            o.classList.add("button"),
                              (o.textContent = n),
                              o.setAttribute("data-quality", i),
                              i === e && o.classList.add("active"),
                              o.addEventListener("click", (e) => {
                                e.stopPropagation(),
                                  e.preventDefault(),
                                  c(i),
                                  t.click(),
                                  a
                                    .querySelectorAll("[data-quality]")
                                    .forEach((t) => {
                                      t.remove();
                                    }),
                                  (a.querySelector(".quality").textContent = n),
                                  a
                                    .querySelector(".left")
                                    .classList.remove("hidden"),
                                  a
                                    .querySelector(".right")
                                    .classList.remove("hidden");
                              }),
                              a.appendChild(o);
                          }),
                        n.audio)
                      ) {
                        let r = document.createElement("a");
                        r.classList.add("button"),
                          (r.textContent = "Audio"),
                          r.setAttribute("data-quality", "audio"),
                          "audio" === e && r.classList.add("active"),
                          r.addEventListener("click", (e) => {
                            e.stopPropagation(), e.preventDefault(), c("audio");
                            let r = t.paused,
                              s = t.currentTime;
                            t.pause(),
                              (t.src = n.audio.url),
                              t.load(),
                              t.addEventListener(
                                "canplay",
                                (e) => {
                                  (t.currentTime = s), r || t.play();
                                },
                                {
                                  once: !0,
                                },
                              ),
                              a
                                .querySelectorAll("[data-quality]")
                                .forEach((t) => {
                                  t.remove();
                                }),
                              (a.querySelector(".quality").textContent =
                                "Audio"),
                              a
                                .querySelector(".left")
                                .classList.remove("hidden"),
                              a
                                .querySelector(".right")
                                .classList.remove("hidden");
                          }),
                          a.appendChild(r);
                      }
                    }, 100));
                }, 100));
            })(t, a));
      });
    (o.textContent = "Loading…"),
      d(s, "Loop", (e) => {
        e.stopPropagation(), e.preventDefault();
        let a = e.target;
        t.loop
          ? ((t.loop = !1), a.classList.remove("active"))
          : ((t.loop = !0), a.classList.add("active"));
      }),
      d(s, "Replay", (t) => {
        t.stopPropagation(),
          t.preventDefault(),
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              keyCode: 48,
            }),
          );
      }),
      d(s, "Theater", (t) => {
        t.stopPropagation(),
          t.preventDefault(),
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              keyCode: 84,
            }),
          );
      }),
      t.addEventListener("mousemove", (t) => {
        clearTimeout(i),
          s.classList.add("showing"),
          s.classList.remove("removing"),
          (i = setTimeout(() => {
            s.classList.add("removing");
          }, 3e3));
      }),
      t.addEventListener("mouseleave", (t) => {
        clearTimeout(i),
          (i = setTimeout(() => {
            s.classList.remove("showing", "removing");
          }, 100));
      }),
      s.addEventListener("mouseenter", (t) => {
        clearTimeout(i),
          s.classList.add("showing"),
          s.classList.remove("removing");
      }),
      s.addEventListener("mouseleave", (t) => {
        clearTimeout(i),
          (i = setTimeout(() => {
            s.classList.remove("showing", "removing");
          }, 100));
      }),
      t.closest("div").insertBefore(a, t),
      t.setAttribute("toolbar-created", !0);
  }
  (i.innerHTML =
    '\n    (()=>{let e=new MutationObserver((e=>{e.forEach((e=>{let t=e.target;t.controls||(t.controls=!0)}))}));function t(e,r,o){for(let n in e)e.hasOwnProperty(n)&&(n===r?e[n]=o:"object"==typeof e[n]&&t(e[n],r,o))}function r(e,r){let o=JSON.parse;JSON.parse=(...n)=>{let d=o.apply(this,n);return t(d,e,r),d};let n=Response.prototype.json;Response.prototype.json=new Proxy(n,{apply(...o){let d=Reflect.apply(n,o[1],o[2]);return new Promise(((o,n)=>{d.then((n=>{t(n,e,r),o(n)})).catch((e=>n(e)))}))}})}function o(){let e=document.querySelectorAll("#contents > ytd-rich-item-renderer ytd-display-ad-renderer");0!==e.length&&e.forEach((e=>{if(e.parentNode&&e.parentNode.parentNode){let t=e.parentNode.parentNode;"YTD-RICH-ITEM-RENDERER"===t.tagName&&(t.style.display="none")}}))}function n(){if(!document.querySelector(".ad-showing"))return;let e=document.querySelectorAll("video");0!==e.length&&e.forEach((e=>{e.duration&&(e.currentTime=e.duration,setTimeout((()=>{let e=document.querySelector("button.ytp-ad-skip-button");e&&e.click()}),100))}))}function d(){let t=document.querySelector("video:not([vinegared-once])");if(!t)return;let r=t.closest("div");r&&r.setAttribute("vinegar-container",!0),t.controls=!0,e.observe(t,{attributes:!0,attributeFilter:["controls"]}),t.addEventListener("contextmenu",(e=>{e.stopPropagation()})),t.addEventListener("play",(e=>{let t=document.querySelector(".ytp-chrome-top");t&&t.classList.remove("paused")})),t.addEventListener("pause",(e=>{let t=document.querySelector(".ytp-chrome-top");t&&t.classList.add("paused")})),t.addEventListener("ended",(e=>{t.removeAttribute("vinegared")})),t.addEventListener("webkitfullscreenchange",(e=>{document.addEventListener("keydown",(e=>{document.webkitFullscreenElement&&"VIDEO"===document.webkitFullscreenElement.tagName&&32===e.keyCode&&(t.paused?t.play():t.pause())}))}),{once:!0}),t.setAttribute("vinegared",!0),t.setAttribute("vinegared-once",!0)}r("adPlacements",[]),r("playerAds",[]),o(),n(),d(),new MutationObserver((e=>{o(),n(),d()})).observe(document.documentElement,{childList:!0,subtree:!0});let a=document.createElement("style");(document.head||document.documentElement).prepend(a);let s=a.sheet;s.insertRule(\'#__ffYoutube1,#__ffYoutube2,#__ffYoutube3,#__ffYoutube4,#feed-pyv-container,#feedmodule-PRO,#homepage-chrome-side-promo,#merch-shelf,#offer-module,#pla-shelf > ytd-pla-shelf-renderer[class="style-scope ytd-watch"],#pla-shelf,#premium-yva,#promo-info,#promo-list,#promotion-shelf,#related > ytd-watch-next-secondary-results-renderer > #items > ytd-compact-promoted-video-renderer.ytd-watch-next-secondary-results-renderer,#search-pva,#shelf-pyv-container,#video-masthead,#watch-branded-actions,#watch-buy-urls,#watch-channel-brand-div,#watch7-branded-banner,#YtKevlarVisibilityIdentifier,#YtSparklesVisibilityIdentifier,.carousel-offer-url-container,.companion-ad-container,.GoogleActiveViewElement,.list-view[style="margin: 7px 0pt;"],.promoted-sparkles-text-search-root-container,.promoted-videos,.searchView.list-view,.sparkles-light-cta,.watch-extra-info-column,.watch-extra-info-right,.ytd-carousel-ad-renderer,.ytd-compact-promoted-video-renderer,.ytd-companion-slot-renderer,.ytd-merch-shelf-renderer,.ytd-player-legacy-desktop-watch-ads-renderer,.ytd-promoted-sparkles-text-search-renderer,.ytd-promoted-video-renderer,.ytd-search-pyv-renderer,.ytd-video-masthead-ad-v3-renderer,.ytp-ad-action-interstitial-background-container,.ytp-ad-action-interstitial-slot,.ytp-ad-image-overlay,.ytp-ad-overlay-container,.ytp-ad-progress,.ytp-ad-progress-list,[class*="ytd-display-ad-"],[layout*="display-ad-"],a[href^="http://www.youtube.com/cthru?"],a[href^="https://www.youtube.com/cthru?"],ytd-action-companion-ad-renderer,ytd-banner-promo-renderer,ytd-compact-promoted-video-renderer,ytd-companion-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-promoted-sparkles-web-renderer,ytd-search-pyv-renderer,ytd-single-option-survey-renderer,ytd-video-masthead-ad-advertiser-info-renderer,ytd-video-masthead-ad-v3-renderer,YTM-PROMOTED-VIDEO-RENDERER{display:none !important;}\',s.cssRules.length)})();\n  '),
    (document.head || document.documentElement).prepend(i),
    setTimeout(() => {
      i.remove();
    }, 1e3),
    safari.extension.dispatchMessage("refreshSettings"),
    safari.self.addEventListener("message", (s) => {
      if ("youtubeSuccess" === s.name) {
        !(function (t) {
          if (n) return;
          let a, r, s;
          (n = t),
            (a = setInterval(() => {
              let t = document.querySelector("video");
              if (!t || t.readyState < 4) return;
              let i = document.querySelector(".ytp-settings-button");
              i &&
                (clearInterval(a),
                (r = setInterval(() => {
                  i.click();
                  let t = document.querySelectorAll(
                    ".ytp-settings-menu > .ytp-panel > .ytp-panel-menu > .ytp-menuitem",
                  );
                  if (t.length < 2) return;
                  let a = t[t.length - 1];
                  clearInterval(r),
                    (s = setInterval(() => {
                      a.click();
                      let t = document.querySelectorAll(
                        ".ytp-quality-menu .ytp-menuitem",
                      );
                      if (0 === t.length) return;
                      clearInterval(s);
                      let r = document.querySelector(
                        "#vinegar-toolbar .quality",
                      );
                      if ("audio" === e && n.audio) {
                        i.click();
                        let t = document.querySelector("video");
                        (t.src = n.audio.url),
                          t.load(),
                          t.play(),
                          (r.textContent = "Audio");
                      } else {
                        let a = !1;
                        Array.from(t)
                          .reverse()
                          .forEach((t, s) => {
                            let n = t.querySelector("span");
                            if (!n) return;
                            let i = Array.from(n.childNodes)
                              .filter((t) => 3 === t.nodeType)
                              .map((t) => t.nodeValue)
                              .join("")
                              .trim();
                            0 === s && (i = "Auto");
                            let o = i.toLowerCase().replace(/p60.*/, "p");
                            o === e &&
                              ((a = !0),
                              t.click(),
                              (r.textContent = `${o.charAt(0).toUpperCase()}${o.slice(1)}`));
                          }),
                          a ||
                            ("best" === e
                              ? (t[0].click(), (r.textContent = "Best"))
                              : (t[t.length - 1].click(),
                                (r.textContent = "Auto")));
                      }
                    }, 100));
                }, 100)));
            }, 100));
        })(s.message.response);
      } else if ("settings" === s.name) {
        let n = s.message;
        (t = n.autoplay),
          (e = n.quality),
          (a = n.showToolbar),
          (r = n.subtitles);
      }
    }),
    new MutationObserver((e) => {
      l(),
        (function () {
          let e = document.querySelector("video:not([autoplay-setup])");
          e &&
            (e.addEventListener("play", (e) => {
              let a = document.querySelector(
                ".ytp-autonav-toggle-button:not([vinegared])",
              );
              if (!a) return;
              let r = a.getAttribute("aria-checked");
              t && "false" === r && a.click(),
                t || "true" !== r || a.click(),
                a.setAttribute("vinegared", !0);
            }),
            e.setAttribute("autoplay-setup", !0));
        })(),
        (function () {
          let t = document.querySelector("#primary:not([vinegared])");
          t &&
            (a || t.setAttribute("notoolbar", !0),
            t.setAttribute("vinegared", !0));
        })(),
        u(),
        (function () {
          let t,
            e = document.querySelector("video:not([caption-setup])");
          if (!e || !n) return;
          if (e.querySelectorAll("track").length > 0 || !n.captions)
            return void e.setAttribute("caption-setup", !0);
          n.captions.forEach((t) => {
            let a = document.createElement("track");
            (a.label = t.name.runs[0].text),
              (a.kind = "subtitles"),
              (a.srclang = t.languageCode),
              (a.src = `${t.baseUrl}&fmt=vtt`),
              e.appendChild(a);
          });
          let a = "system" === r ? navigator.language : r,
            s = n.captions.filter((t) => "en" === t.languageCode);
          t = s.length > 0 ? s[0] : n.captions[0];
          let i = document.createElement("track");
          (i.label = `Auto-translated (${o(a)})`),
            (i.kind = "subtitles"),
            (i.srclang = a),
            o(t.languageCode) === o(a)
              ? (i.src = `${t.baseUrl}&fmt=vtt`)
              : (i.src = `${t.baseUrl}&fmt=vtt&tlang=${a}`),
            e.appendChild(i),
            e.setAttribute("caption-setup", !0);
        })();
    }).observe(document.documentElement, {
      childList: !0,
      subtree: !0,
    }),
    document.addEventListener("keydown", (t) => {
      if (67 === t.keyCode) {
        let t,
          e,
          a = document.querySelector("video");
        if (!a) return;
        if (
          "INPUT" === document.activeElement.tagName ||
          "TEXTAREA" === document.activeElement.tagName ||
          "true" === document.activeElement.getAttribute("contenteditable")
        )
          return;
        Array.from(a.textTracks).forEach((a) => {
          "showing" === a.mode && (t = a),
            a.label.startsWith("Auto-translated") && (e = a);
        }),
          t ? (t.mode = "disabled") : (e.mode = "showing");
      }
    });
})();
