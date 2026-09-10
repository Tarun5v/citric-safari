/*!
 * Citric — a lean native HTML5 player for YouTube.
 *
 * Two ways to play, so the screen is never left black:
 *
 *  1. Extraction path. When YouTube's response exposes a single muxed
 *     (audio + video) progressive stream, we play it in our own native <video>
 *     and pause the stock player — the fully lean mode Citric is about.
 *
 *  2. Adopt path. When only adaptive/ciphered streams exist (or ours 403s),
 *     we steal the <video> element YouTube's own engine is already rendering
 *     into and move it into our overlay, letting YouTube keep driving playback.
 *     No stream is re-requested, so this cannot fail or go black.
 *
 * Either way the heavy player chrome sits underneath an opaque #citric-player
 * overlay, next-sibling of #movie_player, so YouTube's UI can never cover us.
 */

("use strict");

(() => {
  const PLAYER_SELECTOR = "#movie_player";
  const OVERLAY_SELECTOR = "#citric-player";
  const NAVIGATE_EVENT = "yt-navigate-finish";

  // How long we are willing to wait for the underlying player to report a fresh
  // response after a route change before relying on the adopted video.
  const RESPONSE_TIMEOUT_MS = 5000;

  // How long each candidate stream gets before we move on to the next one.
  const CANDIDATE_TIMEOUT_MS = 6000;

  const state = {
    videoId: null,
    // Bumped on every mount so orphaned stream timers can't act late.
    gen: 0,
    // Playback position carried across navigations within the same video.
    resume: { videoId: null, time: 0, rate: 1 },
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  const log = (...args) => console.info("[citric]", ...args);
  const warn = (...args) => console.warn("[citric]", ...args);

  const debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  };

  /* ------------------------------------------------------------------ *
   * Player response parsing
   *
   * On the first page load YouTube exposes the full innertube response on
   * window.ytInitialPlayerResponse. During SPA navigation that object goes
   * stale, so the rendered player (via getPlayerResponse) is treated as the
   * authoritative source once it reports the video the URL currently points to.
   * ------------------------------------------------------------------ */

  function currentVideoId() {
    const watch = /[?&]v=([\w-]{11})/.exec(location.href);
    if (watch) return watch[1];
    const embed = /^\/embed\/([\w-]{11})/.exec(location.pathname);
    if (embed) return embed[1];
    return null;
  }

  function livePlayerResponse(player) {
    try {
      const response = player.getPlayerResponse();
      if (response && response.videoDetails && response.videoDetails.videoId) {
        return response;
      }
    } catch (_) {
      /* player not ready */
    }
    return null;
  }

  function initialPlayerResponse() {
    const response = window.ytInitialPlayerResponse;
    if (response && response.videoDetails && response.videoDetails.videoId) {
      return response;
    }
    return null;
  }

  // Only return a response if it describes the video the URL currently names.
  // Stale responses must never be trusted — that is how players go black on
  // SPA navigation.
  function resolveResponse(player) {
    const videoId = currentVideoId();
    if (!videoId) return null;

    const live = livePlayerResponse(player);
    if (live && live.videoDetails.videoId === videoId) return live;

    const initial = initialPlayerResponse();
    if (initial && initial.videoDetails.videoId === videoId) return initial;

    return null;
  }

  // Every muxed (audio + video) progressive stream we could hand straight to a
  // <video> element, best quality first. Adaptive formats need an external
  // audio + video pairing layer (typically MSE), which is where we switch to
  // the adopt path instead.
  function pickStreams(response) {
    if (!response.streamingData) return [];

    const seen = new Set();
    return (response.streamingData.formats || [])
      .filter((format) => {
        const mime = format.mimeType || "";
        return format.url && format.contentLength && !mime.includes("text/");
      })
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      .filter((format) => {
        if (seen.has(format.itag)) return false;
        seen.add(format.itag);
        return true;
      });
  }

  /* ------------------------------------------------------------------ *
   * The overlay
   *
   * Opaque, full-bleed, and always the next sibling of #movie_player with a
   * near-max z-index, so nothing YouTube draws can paint above it.
   * ------------------------------------------------------------------ */

  function stockPlayer() {
    return $(PLAYER_SELECTOR);
  }

  function ensureOverlay() {
    const player = stockPlayer();
    if (!player) return null;

    let overlay = $(OVERLAY_SELECTOR);
    if (!overlay || !overlay.isConnected) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_SELECTOR.slice(1);
      overlay.style.cssText =
        "position:absolute;inset:0;z-index:2147483000;background:#000;";
      player.insertAdjacentElement("afterend", overlay);
    } else if (overlay.previousElementSibling !== player) {
      player.insertAdjacentElement("afterend", overlay);
    }

    const parent = player.parentElement;
    if (parent && window.getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    return overlay;
  }

  function removeOverlay() {
    const overlay = $(OVERLAY_SELECTOR);
    if (overlay) overlay.remove();
  }

  // Move the video that owns the screen into the overlay, dropping any previous
  // media element so two videos never stack on top of each other.
  function reparentVideo(overlay, video) {
    overlay.querySelectorAll("video").forEach((old) => {
      if (old !== video) old.remove();
    });
    overlay.appendChild(video);
  }

  function activeVideo() {
    const overlay = $(OVERLAY_SELECTOR);
    return overlay ? overlay.querySelector("video") : null;
  }

  /* ------------------------------------------------------------------ *
   * Extraction path
   * ------------------------------------------------------------------ */

  function buildVideo(stream) {
    const video = document.createElement("video");

    video.controls = false;
    video.autoplay = true;
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x-webkit-airplay", "allow");
    video.referrerPolicy = "origin";
    video.style.cssText =
      "display:block;width:100%;height:100%;background:#000;";

    video.src = stream.url;
    return video;
  }

  function rememberPlayback(video) {
    if (!video || !state.videoId) return;
    state.resume = {
      videoId: state.videoId,
      time: video.currentTime || 0,
      rate: video.playbackRate || 1,
    };
  }

  function restorePlayback(video) {
    const resume = state.resume;
    if (!resume || resume.videoId !== state.videoId) return;
    if (resume.time > 0) video.currentTime = resume.time;
    if (resume.rate && resume.rate !== 1) video.playbackRate = resume.rate;
  }

  function startExtraction(candidates) {
    const videoId = currentVideoId();
    if (!videoId) return false;

    const gen = ++state.gen;
    const overlay = ensureOverlay();
    if (!overlay) return false;

    const video = buildVideo(candidates[0]);
    restorePlayback(video);
    reparentVideo(overlay, video);
    bindControls(overlay);
    state.videoId = videoId;

    // Try each candidate in turn; if they all fail, fall through to the adopt
    // path so the viewer sees YouTube's own (still working) video.
    let index = 0;
    let settled = false;

    const finish = (ok) => {
      if (settled || gen !== state.gen) return;
      settled = true;
      window.clearTimeout(failTimer);
      if (ok) {
        state.mode = "extract";
        log(`playing ${videoId} natively (itag ${video.currentItag || "?"})`);
      } else {
        warn("no muxed stream would play, adopting YouTube's element");
        if (!adoptVideo()) removeOverlay();
      }
    };

    const tryCandidate = () => {
      if (gen !== state.gen) return;
      if (index >= candidates.length) {
        finish(false);
        return;
      }

      window.clearTimeout(failTimer);

      const stream = candidates[index++];
      video.currentItag = stream.itag;
      video.src = stream.url;
      try {
        video.play().catch(() => {});
      } catch (_) {
        /* play needs a gesture on some pages; controls cover that */
      }

      failTimer = window.setTimeout(tryCandidate, CANDIDATE_TIMEOUT_MS);
    };

    let failTimer;
    video.addEventListener("loadeddata", () => finish(true), { once: true });
    video.addEventListener("playing", () => finish(true), { once: true });
    video.addEventListener("error", tryCandidate, { once: true });

    tryCandidate();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Adopt path
   *
   * Grab the media element YouTube's player is currently rendering into and
   * park it inside the overlay. Reparenting does not interrupt playback, and
   * YouTube keeps choosing streams and running its engine — we only move the
   * pixels. Nothing here can 403.
   * ------------------------------------------------------------------ */

  function adoptVideo() {
    const player = stockPlayer();
    const overlay = ensureOverlay();
    if (!player || !overlay) return false;

    const ytVideo =
      player.querySelector("video.html5-main-video, video.video-stream, video") ||
      null;

    if (!ytVideo) return false;
    if (ytVideo === activeVideo()) {
      styleStolenVideo(ytVideo);
      return true;
    }

    reparentVideo(overlay, ytVideo);
    styleStolenVideo(ytVideo);
    state.videoId = currentVideoId();
    state.mode = "adopt";

    ytVideo.controls = false;
    ytVideo.removeAttribute("controls");
    ytVideo.setAttribute("x-webkit-airplay", "allow");
    ytVideo.playsInline = true;

    bindControls(overlay);
    attachKeyboardShortcuts();
    log("adopted YouTube's own media element");
    return true;
  }

  function styleStolenVideo(video) {
    video.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "background:#000",
    ].join(";") + ";";
  }

  /* ------------------------------------------------------------------ *
   * Control bar
   *
   * Safari's native video controls can't be relied on here (YouTube strips the
   * controls attribute off its own element, and autoplaying inline videos hide
   * the built-in bar), so Citric paints a small bar of its own that fades in on
   * hover and covers play/pause, seeking, volume, PiP, AirPlay and fullscreen.
   * ------------------------------------------------------------------ */

  function injectStyles() {
    if (document.getElementById("citric-style")) return;
    const style = document.createElement("style");
    style.id = "citric-style";
    style.textContent = [
      "#citric-player .citric-bar{position:absolute;left:0;right:0;bottom:0;",
      "height:52px;display:flex;align-items:center;gap:10px;padding:24px 14px 8px;",
      "box-sizing:border-box;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.72));",
      "opacity:0;transition:opacity .18s ease;pointer-events:none;z-index:5;}",
      "#citric-player .citric-bar.visible{opacity:1;}",
      "#citric-player .citric-controls{display:flex;align-items:center;gap:2px;pointer-events:auto;}",
      "#citric-player .citric-btn{width:34px;height:34px;display:inline-flex;align-items:center;",
      "justify-content:center;background:transparent;border:0;color:#fff;border-radius:6px;",
      "cursor:pointer;padding:0;}",
      "#citric-player .citric-btn:hover{background:rgba(255,255,255,.16);}",
      "#citric-player .citric-btn svg{width:20px;height:20px;fill:currentColor;}",
      "#citric-player .citric-btn.stroke svg{fill:none;stroke:currentColor;stroke-width:2;}",
      "#citric-player .citric-time{color:#fff;font:12px/1 -apple-system,system-ui,sans-serif;",
      "margin:0 4px;white-space:nowrap;pointer-events:none;}",
      "#citric-player .citric-slider{-webkit-appearance:none;appearance:none;height:4px;",
      "border-radius:2px;background:rgba(255,255,255,.35);outline:none;cursor:pointer;pointer-events:auto;}",
      "#citric-player .citric-slider::-webkit-slider-thumb{-webkit-appearance:none;",
      "width:12px;height:12px;border-radius:50%;background:#fff;}",
      "#citric-player .citric-seek{flex:1 1 auto;min-width:60px;}",
      "#citric-player .citric-vol{width:64px;}",
      "#citric-player .citric-spinner{position:absolute;inset:0;display:none;align-items:center;",
      "justify-content:center;pointer-events:none;z-index:4;}",
      "#citric-player .citric-spinner.on{display:flex;}",
      "#citric-player .citric-spinner:before{content:'';width:42px;height:42px;border-radius:50%;",
      "border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:citric-spin .8s linear infinite;}",
      "@keyframes citric-spin{to{transform:rotate(360deg)}}",
      // When WebKit enters fullscreen it keeps the element's own laid-out box,
      // centered on a black screen, instead of stretching it. Hammer the player
      // into every corner with percentage sizing — vw/vh units resolve against
      // the pre-fullscreen layout viewport here and leave black strips on the
      // right and bottom (a long-standing Safari quirk).
      "#citric-player:fullscreen,#citric-player:-webkit-full-screen{",
      "position:fixed!important;top:0!important;left:0!important;",
      "right:0!important;bottom:0!important;width:100%!important;height:100%!important;",
      "margin:0!important;min-width:0!important;max-width:none!important;",
      "min-height:0!important;max-height:none!important;box-sizing:border-box!important;",
    ].join("");
    document.documentElement.appendChild(style);
  }

  const ICONS = {
    play:
      '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back:
      '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7z"/></svg>',
    forward:
      '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7z"/></svg>',
    muted:
      '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/></svg>',
    quiet:
      '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 10a4 4 0 0 1 0 4"/></svg>',
    loud:
      '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 10a4 4 0 0 1 0 4"/><path d="M19.5 7.5a8 8 0 0 1 0 9"/></svg>',
    pip:
      '<svg viewBox="0 0 24 24" class="stroke"><path d="M4 5h16a0 0 0 0 1 0 0v9a0 0 0 0 1 0 0h-9a0 0 0 0 0 0 0"/></svg>',
    airplay:
      '<svg viewBox="0 0 24 24"><path d="M4 5h16v10h-7l-2-2.5L9 15H4V5z"/><path d="M12 15l4 5H8z"/></svg>',
    fullscreen:
      '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
  };

  const fmtTime = (sec) => {
    if (!isFinite(sec)) return "0:00";
    const total = Math.floor(sec);
    return String(Math.floor(total / 60)) + ":" + String(total % 60).padStart(2, "0");
  };

  function buildBar() {
    const bar = document.createElement("div");
    bar.className = "citric-bar";
    bar.innerHTML = [
      '<div class="citric-controls">',
      '<button class="citric-btn" data-action="play" title="Play / Pause">' + ICONS.play + "</button>",
      '<button class="citric-btn" data-action="back" title="Back 10 seconds">' + ICONS.back + "</button>",
      '<button class="citric-btn" data-action="forward" title="Forward 10 seconds">' + ICONS.forward + "</button>",
      "</div>",
      '<input class="citric-slider citric-seek" type="range" min="0" max="0" step="0.1" value="0" data-action="seek">',
      '<span class="citric-time">0:00 / 0:00</span>',
      '<div class="citric-controls">',
      '<button class="citric-btn" data-action="mute" title="Mute">' + ICONS.loud + "</button>",
      '<input class="citric-slider citric-vol" type="range" min="0" max="1" step="0.05" value="1" data-action="volume">',
      '<button class="citric-btn" data-action="pip" title="Picture in Picture">' + ICONS.pip + "</button>",
      '<button class="citric-btn" data-action="airplay" title="AirPlay">' + ICONS.airplay + "</button>",
      '<button class="citric-btn" data-action="fullscreen" title="Fullscreen">' + ICONS.fullscreen + "</button>",
      "</div>",
    ].join("");
    return bar;
  }

  let controlsBar = null;
  let controlsVideo = null;

  const wiredOverlays = new WeakSet();
  let hidingTimer;
  let scrubbing = false;

  function showBar() {
    if (!controlsBar) return;
    controlsBar.classList.add("visible");
    const video = activeVideo();
    window.clearTimeout(hidingTimer);
    if (video && video.paused) return;
    hidingTimer = window.setTimeout(() => {
      if (!scrubbing) controlsBar.classList.remove("visible");
    }, 2600);
  }

  // Once-per-overlay wiring: show the bar on movement. Click-to-toggle lives on
  // the document in the capture phase (below), so it works both inline and when
  // the overlay is fullscreened.
  function wireOverlay(overlay) {
    if (wiredOverlays.has(overlay)) return;
    wiredOverlays.add(overlay);

    overlay.addEventListener("mousemove", showBar);
    overlay.addEventListener("mouseleave", () => {
      const video = activeVideo();
      if (!scrubbing && (!video || !video.paused)) {
        controlsBar.classList.remove("visible");
      }
    });
  }

  function toggleFullscreen(video) {
    wireFullscreenGuard();
    // Exit first if a fullscreen view is already up.
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    // Fullscreen the whole player overlay, not the media element. The DOM stays
    // intact this way, so clicks and the control bar keep working fullscreen —
    // entering Safari's native media presentation would swallow those events.
    const holder = video.closest("#citric-player");
    const goFullscreen = holder
      && (holder.webkitRequestFullscreen || holder.requestFullscreen);
    if (goFullscreen) {
      goFullscreen.call(holder);
      return;
    }
    // Ancient webkit only: present the media element itself.
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }

  // Safari refuses to re-size an absolutely positioned player to the viewport
  // when it enters fullscreen, leaving black strips on two edges. So the moment
  // our overlay becomes the fullscreen element we hammer it with inline styles
  // that pin it to every edge of the screen; when fullscreen ends we restore
  // the in-page placement.
  function wireFullscreenGuard() {
    if (window.__citricFsGuard) return;
    window.__citricFsGuard = true;

    const applyHolderSize = () => {
      const overlay = document.getElementById("citric-player");
      if (!overlay) return;
      const fsEl = document.webkitFullscreenElement || document.fullscreenElement;
      if (fsEl === overlay) {
        overlay.style.cssText =
          "position:fixed;top:0;left:0;right:0;bottom:0;" +
          "width:auto;height:auto;max-width:none;max-height:none;" +
          "z-index:2147483000;background:#000;";
      } else if (!fsEl) {
        overlay.style.cssText =
          "position:absolute;inset:0;z-index:2147483000;background:#000;";
      }
    };

    document.addEventListener("fullscreenchange", applyHolderSize);
    document.addEventListener("webkitfullscreenchange", applyHolderSize);
  }

  // Toggle play/pause without fighting the engine that owns the media element.
  // In adopt mode YouTube still drives its video, so nudge its player API to
  // keep internal state honest — otherwise a scripted pause is instantly
  // overridden when its engine decides it should still be playing. On the
  // extraction path (our own element) a plain element call is all it takes.
  function togglePlayback(video) {
    if (!video) return;
    const player = stockPlayer();
    if (state.mode === "adopt" && player && player.pauseVideo && player.playVideo) {
      if (video.paused) player.playVideo();
      else player.pauseVideo();
      return;
    }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function updateBarState(video) {
    if (!controlsBar) return;
    const playBtn = controlsBar.querySelector('[data-action="play"]');
    const muteBtn = controlsBar.querySelector('[data-action="mute"]');
    const vol = controlsBar.querySelector('[data-action="volume"]');

    if (video.paused) {
      playBtn.innerHTML = ICONS.play;
      controlsBar.classList.add("visible");
    } else {
      playBtn.innerHTML = ICONS.pause;
    }

    muteBtn.innerHTML = video.muted || video.volume === 0 ? ICONS.muted : video.volume < 0.5 ? ICONS.quiet : ICONS.loud;
    if (document.activeElement !== vol) vol.value = String(video.muted ? 0 : video.volume);
  }

  function bindControls(overlay) {
    injectStyles();
    if (controlsBar && controlsBar.parentElement === overlay) {
      // keep existing bar
    } else {
      controlsBar = buildBar();
      overlay.append(controlsBar);
      overlay.insertAdjacentHTML("beforeend", '<div class="citric-spinner"></div>');
    }

    const video = overlay.querySelector("video");
    if (!video) return;

    if (controlsVideo === video) return;
    controlsVideo = video;

    controlsBar.querySelector('[data-action="pip"]').hidden =
      typeof video.webkitSetPresentationMode !== "function";
    controlsBar.querySelector('[data-action="airplay"]').hidden =
      typeof video.webkitShowPlaybackTargetPicker !== "function";

    const seek = controlsBar.querySelector('[data-action="seek"]');
    const vol = controlsBar.querySelector('[data-action="volume"]');
    const time = controlsBar.querySelector(".citric-time");
    const spinner = overlay.querySelector(".citric-spinner");

    wireOverlay(overlay);

    video.addEventListener("play", () => {
      updateBarState(video);
      showBar();
    });
    video.addEventListener("pause", () => {
      updateBarState(video);
      showBar();
    });
    video.addEventListener("volumechange", () => updateBarState(video));

    // YouTube's engine likes to re-apply pointer-events:none to its own video;
    // never let that swallow clicks meant for the picture.
    video.addEventListener("webkitbeginfullscreen", () => {
      video.style.pointerEvents = "auto";
    });

    video.addEventListener("timeupdate", () => {
      if (scrubbing) return;
      if (isFinite(video.duration)) {
        seek.max = String(video.duration);
        seek.value = String(video.currentTime);
      }
      time.textContent =
        fmtTime(video.currentTime) + " / " + fmtTime(video.duration);
    });

    video.addEventListener("loadedmetadata", () => {
      seek.max = String(video.duration || 0);
      time.textContent = "0:00 / " + fmtTime(video.duration);
    });

    video.addEventListener("waiting", () => spinner.classList.add("on"));
    video.addEventListener("playing", () => spinner.classList.remove("on"));
    video.addEventListener("canplay", () => spinner.classList.remove("on"));

    seek.addEventListener("input", () => {
      scrubbing = true;
      video.currentTime = parseFloat(seek.value);
      time.textContent = fmtTime(video.currentTime) + " / " + fmtTime(video.duration);
    });
    seek.addEventListener("change", () => {
      scrubbing = false;
      showBar();
    });

    vol.addEventListener("input", () => {
      video.volume = parseFloat(vol.value);
      video.muted = video.volume === 0;
      updateBarState(video);
    });

    controlsBar.addEventListener("click", (event) => {
      const videoNow = activeVideo();
      if (!videoNow) return;
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      switch (btn.dataset.action) {
        case "play":
          togglePlayback(videoNow);
          break;
        case "back":
          videoNow.currentTime = Math.max(0, videoNow.currentTime - 10);
          break;
        case "forward":
          videoNow.currentTime = Math.min(videoNow.duration || 0, videoNow.currentTime + 10);
          break;
        case "mute":
          videoNow.muted = !videoNow.muted;
          updateBarState(videoNow);
          break;
        case "pip":
          if (videoNow.webkitSetPresentationMode) {
            videoNow.webkitSetPresentationMode(
              videoNow.webkitPresentationMode === "picture-in-picture"
                ? "inline"
                : "picture-in-picture"
            );
          }
          break;
        case "airplay":
          if (videoNow.webkitShowPlaybackTargetPicker) {
            videoNow.webkitShowPlaybackTargetPicker();
          }
          break;
        case "fullscreen":
          toggleFullscreen(videoNow);
          break;
      }
      showBar();
    });
  }

  /* ------------------------------------------------------------------ *
   * Keyboard shortcuts
   * ------------------------------------------------------------------ */

  function attachKeyboardShortcuts() {
    if (document.citricKeyboardBound) return;
    document.citricKeyboardBound = true;

    const handler = (event) => {
      const video = activeVideo();
      if (!video) return;
      if (event.defaultPrevented) return;
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || event.target.isContentEditable) {
        return;
      }

      switch (event.key) {
        case "k":
        case "K":
          togglePlayback(video);
          break;
        case "m":
        case "M":
          video.muted = !video.muted;
          break;
        case "j":
        case "J":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "l":
        case "L":
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          break;
        case "f":
        case "F":
          toggleFullscreen(video);
          break;
        case " ":
          togglePlayback(video);
          event.preventDefault();
          break;
      }
    };

    document.addEventListener("keydown", handler);
  }

  // Clicking anywhere on the picture toggles play/pause, like clicking on
  // YouTube. Bound on the document in the capture phase, so the gesture is seen
  // even when the media element is presented fullscreen and Safari retargets or
  // chews the event before it reaches the element — the document always runs
  // capture first. pointerup and click both fire for a single physical tap, so
  // a short lock swallows the echo. The control bar is excluded entirely.
  if (!window.__citricClickWired) {
    window.__citricClickWired = true;
    let lastToggleAt = 0;
    const toggle = (event) => {
      const video = activeVideo();
      if (!video || !event.target) return;

      const fsEl =
        document.webkitFullscreenElement || document.fullscreenElement || null;
      const overlay = document.getElementById("citric-player");
      const onVideo = event.target === video || video.contains(event.target);
      const onFullscreen =
        fsEl && (event.target === fsEl || fsEl.contains(event.target));
      const onOverlay = overlay && overlay.contains(event.target);
      if (!onVideo && !onFullscreen && !onOverlay) return;

      if (event.target.closest && event.target.closest(".citric-bar")) return;

      const now = performance.now();
      if (now - lastToggleAt < 400) return;
      lastToggleAt = now;
      togglePlayback(video);
    };
    document.addEventListener("pointerup", toggle, true);
    document.addEventListener("click", toggle, true);
  }

  /* ------------------------------------------------------------------ *
   * Boot and SPA navigation
   *
   * Nothing under document_start is guaranteed to exist yet, so we watch for
   * the player container to appear. YouTube reuses the container across watch
   * pages; we simply re-run the mount on every navigation because the adopt
   * path is idempotent and the extraction path only acts on a response that
   * matches the current URL.
   * ------------------------------------------------------------------ */

  const mount = debounce(() => {
    const player = stockPlayer();
    if (!player) {
      removeOverlay();
      return;
    }
    if (!currentVideoId()) {
      removeOverlay();
      return;
    }

    // Fresh navigation to a different video: adopt first (YouTube's element is
    // already correct), then only consider extraction for a confirmed response.
    const videoId = currentVideoId();
    const response = resolveResponse(player);
    const candidates = response ? pickStreams(response) : [];

    if (candidates.length && (!state.videoId || state.videoId === videoId)) {
      startExtraction(candidates);
    } else if (!adoptVideo()) {
      removeOverlay();
    }
  }, 300);

  function start() {
    const onFirstPlayer = () => {
      mount();
    };

    const existing = $(PLAYER_SELECTOR);
    if (existing) {
      onFirstPlayer();
    } else {
      const observer = new MutationObserver(() => {
        if (!$(PLAYER_SELECTOR)) return;
        observer.disconnect();
        onFirstPlayer();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    // Primary navigation signal: fires after YouTube swaps watch content. It
    // is dispatched on <window> (some pages relay it to <document>), so listen
    // on both; mount() is idempotent so a double fire is harmless.
    window.addEventListener(NAVIGATE_EVENT, mount);
    document.addEventListener(NAVIGATE_EVENT, mount);

    // Backstop observer: YouTube occasionally re-mounts or clears the player
    // container without a navigation event (embed resizes, live reloads).
    // When the container is touched, make sure the overlay still holds a video
    // that matches the current URL.
    const reconcile = debounce(() => {
      const player = stockPlayer();
      const overlay = $(OVERLAY_SELECTOR);

      if (!player || !currentVideoId()) {
        removeOverlay();
        return;
      }

      const video = player.querySelector(
        "video.html5-main-video, video.video-stream, video"
      );
      const ours = activeVideo();

      // YouTube re-created its media element (fresh navigation or quality
      // reset): if we are in adopt mode, swap the new one in.
      if (video && ours && video !== ours && state.mode === "adopt") {
        reparentVideo(overlay, video);
        styleStolenVideo(video);
        bindControls(overlay);
        attachKeyboardShortcuts();
        return;
      }

      // Nothing mounted, or YouTube replaced our overlay's contents — remount.
      if (!ours || !overlay.contains(ours)) {
        mount();
      }
    }, 400);

    const backstop = new MutationObserver(reconcile);
    backstop.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  start();
})();