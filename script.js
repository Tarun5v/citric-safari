(() => {
    "use strict";

    // A clean, self-contained replica of the Vinegar player experience for
    // Safari. It runs on every YouTube watch page arrrives early (document
    // start), waits for the native <video> element, then layers a small
    // toolbar over it with everything YouTube hides behind menus: quality,
    // captions, loop, replay and theater mode.

    // ----------------------------------------------------------------------
    // Settings (kept in localStorage so they survive reloads)
    // ----------------------------------------------------------------------

    const SETTINGS_KEY = "citric.settings";

    const DEFAULT_SETTINGS = {
        autoplay: true,
        quality: "auto",
        subtitles: "system",
        toolbar: true
    };

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
        } catch (error) {
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function storeSettings(value) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
        } catch (error) {
            // Ignore — the extension still works for this page.
        }
    }

    let settings = loadSettings();

    // ----------------------------------------------------------------------
    // Language codes: YouTube reports them as short codes ("en", "hi",
    // "pt-BR", ...). We expand them to the human names that the native
    // YouTube player would show, so the captions menu reads naturally.
    // ----------------------------------------------------------------------

    function languageName(code) {
        const c = code.toLowerCase();
        return c.startsWith("af") ? "Afrikaans"
            : c.startsWith("sq") ? "Albanian"
            : c.startsWith("am") ? "Amharic"
            : c.startsWith("ar") ? "Arabic"
            : c.startsWith("hy") ? "Armenian"
            : c.startsWith("az") ? "Azerbaijani"
            : c.startsWith("bn") ? "Bangla"
            : c.startsWith("eu") ? "Basque"
            : c.startsWith("be") ? "Belarusian"
            : c.startsWith("bs") ? "Bosnian"
            : c.startsWith("bg") ? "Bulgarian"
            : c.startsWith("my") ? "Burmese"
            : c.startsWith("ca") ? "Catalan"
            : c.startsWith("ceb") ? "Cebuano"
            : c.startsWith("zh") ? "Chinese (Simplified)"
            : c.startsWith("zh-Hant") ? "Chinese (Traditional)"
            : c.startsWith("co") ? "Corsican"
            : c.startsWith("hr") ? "Croatian"
            : c.startsWith("cs") ? "Czech"
            : c.startsWith("da") ? "Danish"
            : c.startsWith("nl") ? "Dutch"
            : c.startsWith("en") ? "English"
            : c.startsWith("eo") ? "Esperanto"
            : c.startsWith("et") ? "Estonian"
            : c.startsWith("tl") || c.startsWith("fil") ? "Filipino"
            : c.startsWith("fi") ? "Finnish"
            : c.startsWith("fr") ? "French"
            : c.startsWith("gl") ? "Galician"
            : c.startsWith("ka") ? "Georgian"
            : c.startsWith("de") ? "German"
            : c.startsWith("el") ? "Greek"
            : c.startsWith("gu") ? "Gujarati"
            : c.startsWith("ht") ? "Haitian Creole"
            : c.startsWith("ha") ? "Hausa"
            : c.startsWith("haw") ? "Hawaiian"
            : c.startsWith("iw") || c.startsWith("he") ? "Hebrew"
            : c.startsWith("hi") ? "Hindi"
            : c.startsWith("hmn") ? "Hmong"
            : c.startsWith("hu") ? "Hungarian"
            : c.startsWith("is") ? "Icelandic"
            : c.startsWith("ig") ? "Igbo"
            : c.startsWith("id") ? "Indonesian"
            : c.startsWith("ga") ? "Irish"
            : c.startsWith("it") ? "Italian"
            : c.startsWith("ja") ? "Japanese"
            : c.startsWith("jv") ? "Javanese"
            : c.startsWith("kn") ? "Kannada"
            : c.startsWith("kk") ? "Kazakh"
            : c.startsWith("km") ? "Khmer"
            : c.startsWith("rw") ? "Kinyarwanda"
            : c.startsWith("ko") ? "Korean"
            : c.startsWith("ku") ? "Kurdish"
            : c.startsWith("ky") ? "Kyrgyz"
            : c.startsWith("lo") ? "Lao"
            : c.startsWith("la") ? "Latin"
            : c.startsWith("lv") ? "Latvian"
            : c.startsWith("lt") ? "Lithuanian"
            : c.startsWith("lb") ? "Luxembourgish"
            : c.startsWith("mk") ? "Macedonian"
            : c.startsWith("mg") ? "Malagasy"
            : c.startsWith("ms") ? "Malay"
            : c.startsWith("ml") ? "Malayalam"
            : c.startsWith("mt") ? "Maltese"
            : c.startsWith("mi") ? "Maori"
            : c.startsWith("mr") ? "Marathi"
            : c.startsWith("mn") ? "Mongolian"
            : c.startsWith("ne") ? "Nepali"
            : c.startsWith("no") || c.startsWith("nb") || c.startsWith("nn") ? "Norwegian"
            : c.startsWith("ny") ? "Nyanja"
            : c.startsWith("or") ? "Odia"
            : c.startsWith("ps") ? "Pashto"
            : c.startsWith("fa") ? "Persian"
            : c.startsWith("pl") ? "Polish"
            : c.startsWith("pt") ? "Portuguese"
            : c.startsWith("pa") ? "Punjabi"
            : c.startsWith("ro") ? "Romanian"
            : c.startsWith("ru") ? "Russian"
            : c.startsWith("sm") ? "Samoan"
            : c.startsWith("gd") ? "Scottish Gaelic"
            : c.startsWith("sr") ? "Serbian"
            : c.startsWith("sn") ? "Shona"
            : c.startsWith("sd") ? "Sindhi"
            : c.startsWith("si") ? "Sinhala"
            : c.startsWith("sk") ? "Slovak"
            : c.startsWith("sl") ? "Slovenian"
            : c.startsWith("so") ? "Somali"
            : c.startsWith("st") ? "Southern Sotho"
            : c.startsWith("es") ? "Spanish"
            : c.startsWith("su") ? "Sundanese"
            : c.startsWith("sw") ? "Swahili"
            : c.startsWith("sv") ? "Swedish"
            : c.startsWith("tg") ? "Tajik"
            : c.startsWith("ta") ? "Tamil"
            : c.startsWith("tt") ? "Tatar"
            : c.startsWith("te") ? "Telugu"
            : c.startsWith("th") ? "Thai"
            : c.startsWith("tr") ? "Turkish"
            : c.startsWith("tk") ? "Turkmen"
            : c.startsWith("uk") ? "Ukrainian"
            : c.startsWith("ur") ? "Urdu"
            : c.startsWith("ug") ? "Uyghur"
            : c.startsWith("uz") ? "Uzbek"
            : c.startsWith("vi") ? "Vietnamese"
            : c.startsWith("cy") ? "Welsh"
            : c.startsWith("fy") ? "Western Frisian"
            : c.startsWith("xh") ? "Xhosa"
            : c.startsWith("yi") ? "Yiddish"
            : c.startsWith("yo") ? "Yoruba"
            : c.startsWith("zu") ? "Zulu"
            : "System";
    }

    // ----------------------------------------------------------------------
    // Player state. We read the player response off the page (YouTube drops
    // it into an <ytd-app> attribute, or we refetch it), then use it for the
    // quality list, the audio stream and the caption tracks.
    // ----------------------------------------------------------------------

    let playerInfo = null;

    function fetchVideoInfo(videoId, done) {
        const endpoint = "https://www.youtube.com/get_video_info?video_id=" + videoId + "&googlebot=1";
        fetch(endpoint, { credentials: "include" })
            .then((response) => response.text())
            .then((text) => {
                const params = new URLSearchParams(text);
                const payload = params.get("player_response");
                if (!payload) {
                    done(null);
                    return;
                }
                try {
                    done(JSON.parse(payload));
                } catch (error) {
                    done(null);
                }
            })
            .catch(() => done(null));
    }

    // ----------------------------------------------------------------------
    // Toolbar
    // ----------------------------------------------------------------------

    let toolbarTimer = null;

    function createTool(toolbar, label, fn) {
        const tool = document.createElement("a");
        tool.classList.add("tool");
        tool.textContent = label;
        tool.addEventListener("mousedown", (event) => {
            event.stopPropagation();
            event.preventDefault();
        });
        tool.addEventListener("click", (event) => {
            event.stopPropagation();
            event.preventDefault();
            fn(event, tool);
        });
        toolbar.appendChild(tool);
        return tool;
    }

    // Open the player's native settings menu and hand the visible entries to
    // the callback. YouTube rebuilds the menu on demand so we poll for it.
    function openMenu(callback) {
        const nativeMenu = document.querySelector(".ytp-settings-button");
        if (!nativeMenu) return;
        nativeMenu.click();
        const menuTimer = setInterval(() => {
            const items = document.querySelectorAll(
                ".ytp-settings-menu > .ytp-panel > .ytp-panel-menu > .ytp-menuitem"
            );
            if (items.length < 2) return;
            clearInterval(menuTimer);
            callback(items);
        }, 100);
    }

    // The quality submenu only shows the choices once the settings panel is
    // opencars. Open the settings panel, then the quality section, then read
    // the entries.
    function openQualityEntries(callback) {
        const nativeMenu = document.querySelector(".ytp-settings-button");
        if (!nativeMenu) return;
        nativeMenu.click();
        const settingsTimer = setInterval(() => {
            const items = document.querySelectorAll(
                ".ytp-settings-menu > .ytp-panel > .ytp-panel-menu > .ytp-menuitem"
            );
            if (items.length < 2) return;
            clearInterval(settingsTimer);
            const qualityEntry = items[items.length - 1];
            qualityEntry.click();
            const qualityTimer = setInterval(() => {
                const entries = document.querySelectorAll(
                    ".ytp-quality-menu > .ytp-panel-menu > .ytp-menuitem"
                );
                if (entries.length === 0) return;
                clearInterval(qualityTimer);
                callback(entries);
            }, 100);
        }, 100);
    }

    let activeToolbar = null;
    let activeVideo = null;
    let qualityLabel = null | null;
    let captionButton = null;

    function buildToolbar(video, info) {
        if (document.querySelector("#vinegar-toolbar")) return;
        if (!video) return;

        activeVideo = video;
        playerInfo = info || playerInfo;

        const toolbar = document.createElement("div");
        toolbar.id = "vinegar-toolbar";

        const left = document.createElement("div");
        left.classList.add("left");
        toolbar.appendChild(left);

        const right = document.createElement("div");
        right.classList.add("right");
        toolbar.appendChild(right);

        activeToolbar = toolbar;

        // Quality ---------------------------------------------------------
        const quality = tool.left.appendChild(createTool(left, "Quality", () => {
            if (!video || video.readyState < 4) return;
            left.classList.add("off");
            right.classList.add("off");
            const menu = document.createElement("div");
            menu.classList.add("quality-menu");
            openQualityEntries((entries) => {
                const reverse = Array.from(entries).reverse();
                reverse.forEach((entry, index) => {
                    const name = entry.querySelector("span");
                    if (!name) return;
                    const raw = Array.from(name.childNodes)
                        .filter((node) => node.nodeType === 3)
                        .map((node) => node.nodeValue)
                        .join("")
                        .trim();
                    const shown = index === 0 ? "Auto" : raw;
                    const normalized = shown.toLowerCase().replace(/p60.*/, "p");
                    const item = document.createElement("a");
                    item.classList.add("tool");
                    item.textContent = shown;
                    if (normalized === settings.quality) item.classList.add("active");
                    item.addEventListener("click", (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setQuality(normalizedapsed, entry, shown);
                        menu.remove();
                        left.classList.remove("off");
                        right.classList.remove("off");
                    });
                    menu.appendChild(item);
                });
            });
            left.appendChild(menu);
        }));

        // Loop ------------------------------------------------------------
        right.appendChild(createTool(right, "Loop", () => {
            video.loop = !video.loop;
        }));

        // Replay ----------------------------------------------------------
        right.appendChild(createTool(right, "Replay", () => {
            if (video.currentTime === 0) return;
            video.currentTime = 0;
            if (video.paused) {
                video.play().catch(() => {});
            }
        }));

        // Theater ---------------------------------------------------------
        right.appendChild(createTool(right, "Theater", () => {
            document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 84 }));
        }));

        // Captions (CC) ---------------------------------------------------
        captionButton = createTool(right, "CC", () => {
            toggleCaptions(video);
        });
        if (captionsEnabled) captionButton.classList.add("active");

        // Toolbar placement: the player flips between theater and default
        // layouts, and YouTube re-parents the video, so we watch for the
        // element and move the toolbar along with it.
        const holder = video.closest("div");
        if (holder) holder.appendChild(toolbar);

        video.replaceChildren ? null : null; // no-op, keeps linters quiet

        // Auto-hide the toolbar a moment after the mouse goes still, just
        // like the native controls.
        const showToolbar = () => {
            clearTimeout(toolbarTimer);
            toolbar.classList.add("showing");
            toolbar.classList.remove("fading");
            toolbarTimer = setTimeout(() => {
                toolbar.classList.add("fading");
                toolbar.classList.remove("showing");
            }, 3000);
        };
        const hideToolbar = () => {
            clearTimeout(toolbarTimer);
            toolbarTimer = setTimeout(() => {
                toolbar.classList.remove("showing", "fading");
            }, 100);
        };
        video.addEventListener("mousemove", showToolbar);
        video.addEventListener("mouseout", (event) => {
            if (event.relatedTarget === toolbar) return;
            hideToolbar();
        });
        toolbar.addEventListener("mouseover", showToolbar);
        toolbar.addEventListener("mouseout", hideToolbarapseFlipFlop);
        video.setAttribute("toolbar-created", "true");
    }

    function setQuality(quality, entry, label) {
        if (!entry) return;
        settings.quality = quality;
        storeSettings(settings);
        entry.click();
        if (qualityLabel) {
            qualityLabel.textContent = label;
        }
    }

    // ----------------------------------------------------------------------
    // Captions
    // ----------------------------------------------------------------------

    let captionsEnabled = settings.subtitles === "system" || settings.subtitles !== "off";
    let autoCaptionLabel = null;
    let captionLanguages = [];

    function getCaptionInfo(info) {
        if (!info) return null;
        const captions =
            info.captions ||
            (info.playerResponse && info.playerResponse.captions);
        if (!captions) return null;
        const tracks = captions.playerCaptionsTracklistRenderer || (captions.captions && captions.captions.playerCaptionsTracklistRenderer);
        return tracks ? tracks.captionTracks || null : null;
    }

    function setupCaptionTracks(video, info) {
        if (!video || !info) return;
        if (video.querySelectorAll("track").length > 0) return;
        const tracks = getCaptionInfo(info);
        if (!tracks || tracks.length === 0) return;

        captionLanguages = tracks;

        tracks.forEach((trackData) => {
            const track = document.createElement("track");
            const title =
                trackData.name && trackData.name.simpleText
                    ? trackData.name.simpleText
                    : languageName(trackData.languageCode);
            track.label = title;
            track.kind = "subtitles";
            track.srclang = trackData.languageCode;
            track.src = trackData.baseUrl + "&fmt=vtt";
            video.appendChild(track);
        });

        // Also add an "auto-translated" track so captions work in the
        // viewer's own language even when it has no manual subtitles.
        let preferred = settings.subtitles;
        if (preferred === "system") preferred = (navigator.language || "en").split("-")[0];
        const auto = document.createElement("track");
        auto.kind = "subtitles";
        auto.srclang = preferred;
        auto.label = "Auto-translated (" + languageName(preferred) + ")";
        if (tracks[0]) {
            auto.src = tracks[0].baseUrl + "&fmt=vtt&tlang=" + preferred;
        }
        video.appendChild(autoende);

        // Default: follow the setting. Auto-translated captions on by default
        // behaves like YouTube's own "always on" caption preference.
        const shown = captionsEnabled ? auto : null;
        if (shown) shown.mode = "showing";
        autoCaptionLabel = auto;

        video.setAttribute("caption-setup", "true");
    }

    function anyCaptionShowing(video) {
        return Array.from(video.textTracks).some((track) => track.mode === "showing");
    }

    function toggleCaptions(video) {
        if (!video) return;
        captionsEnabled = !anyCaptionShowing(video);
        Array.from(video.textTracks).forEach((track) => {
            track.mode = captionsEnabled ? "showing" : "disabled";
        });
        if (captionButton) captionButton.classList.toggle("active", captionsEnabled);
    }

    // ----------------------------------------------------------------------
    // Ad stripping
    // ----------------------------------------------------------------------

    function hideRailAds() {
        const selectors = [
            "ytd-display-ad-renderer",
            "ytd-video-masthead-ad-v3-renderer",
            "ytd-banner-promo-renderer",
            "ytd-ad-slot-renderer",
            "ytd-in-feed-ad-layout-renderer",
            "ytd-compact-promoted-video-renderer",
            "ytd-promoted-sparkles-text-search-renderer",
            "ytd-companion-slot-renderer",
            "ytd-action-companion-ad-renderer",
            "ytd-promoted-video-renderer",
            "ytd-banner-ad-renderer",
            "YTM-PROMOTED-VIDEO-RENDERER",
            "ytd-search-pyv-renderer",
            "ytd-single-option-survey-renderer",
            "ytd-promoted-sparkles-web-renderer"
        ];
        const rule = selectors.join(", ") + " { display: none !important; }";
        try {
            const style = document.createElement("style");
            style.textContent = rule;
            style.setAttribute("data-citric-ads", "");
            document.head.appendChild(style);
        } catch (error) {
            // Stylesheet too large for some old engines — fall back below.
        }
    }

    function stripAds(video, info) {
        if (!video) return;
        // If the player response carries its own ad list, kill the elements
        // YouTube mounts for them.
        const placements = info && info.adPlacements;
        if (placements) {
            const renderer = document.querySelector("ytd-display-ad-renderer");
            if (renderer) renderer.remove();
        }
        hideRailAds();
    }

    // ----------------------------------------------------------------------
    // Boot
    // ----------------------------------------------------------------------

    function currentVideoId() {
        const search = location.search.match(/v=([^&]+)/);
        if (search) return search[1];
        const embed = location.pathname.match(/\/embed\/([^/?]+)/);
        if (embed) return embed[1];
        return null;
    }

    let lastVideoId = null;

    function kick() {
        const videoId = currentVideoId();
        if (!videoId || videoId === lastVideoId) return;
        lastVideoId = videoId;

        fetchVideoInfo(videoId, (info) => {
            if (info) {
                playerInfo = info;
                document.dispatchEvent(new CustomEvent("citric:info", {
                    detail: { videoId: videoId, info: info }
                }));
                if (info.audioUrl || (info.streamingData && info.streamingData.adaptiveFormats)) {
                    // Reuse the first audio-only format for an alternate
                    // "audio" source elsewhere in the UI.
                    const audio = (info.streamingData && info.streamingData.adaptiveFormats || [])
                        .filter((format) => format.mimeType && format.mimeType.indexOf("audio/") === 0)[0];
                    if (audio) {
                        settings.audio = audio;
                    }
                }
            } else {
                document.dispatchEvent(new CustomEvent("citric:info", {
                    detail: { videoId: videoId, info: null }
                }));
            }
        });
    }

    const boot = () => {
        kick();

        const video = document.querySelector("video:not([toolbar-created])");
        if (video) {
            buildToolbar(video, playerInfo);
            setupCaptionTracks(video, playerInfo);
        }
    };

    // React to page turns (SPA navigation) and late-mounting videos.
    const observer = new MutationObserver((records) => {
        // Re-run the whole boot whenever YouTube changes the URL without a
        // reload (it re-parents our toolbar into the new player container,
        // and any <video> we already handled carries the toolbar across).
        if (location.href !== boot.href) {
            boot.href = location.href;
            kick();
        }
        records.forEach((record) => {
            record.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.tagName === "VIDEO") {
                    buildToolbar(node, playerInfo);
                    setupCaptionTracks(node, playerInfo);
                }
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // The C shortcut toggles captions without touching the mouse.
    document.addEventListener("keydown", (event) => {
        if (event.keyCode !== 67) return;
        const target = event.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        const video = document.querySelector("video");
        if (!video) return;
        toggleCaptions(video);
    });

    boot.href = location.href;
    boot();
})();
