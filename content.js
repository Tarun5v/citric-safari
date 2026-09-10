/*!
 * Citric — a lean native HTML5 player for YouTube.
 *
 * YouTube's player tends to fight back if you touch its internals, so instead
 * of emptying #movie_player we cover it with our own overlay and *pause* the
 * underlying player. The stock player stays mounted underneath (keeping the
 * layout and navigation intact) but the native <video> we render on top is what
 * the viewer actually sees and controls.
 *
 * If the stream we pick ever fails to load, the overlay is removed again and
 * the stock player is re-woken — playback keeps working no matter what.
 */

("use strict");

(() => {
  const PLAYER_SELECTOR = "#movie_player";
  const OVERLAY_SELECTOR = "#citric-player";
  const NAVIGATE_EVENT = "yt-navigate-finish";

  // How long we are willing to wait for the underlying player to report a fresh
  // response after a route change before leaving YouTube's player alone.
  const RESPONSE_TIMEOUT_MS = 5000;

  // If our media element has not produced a frame within this window we treat
  // the stream as failed and hand control back to the stock player.
  const STREAM_TIMEOUT_MS = 12000;

  const state = {
    videoId: null,
    // Once a stream fails for a given video we back off rather than retry in a
    // loop while the stock player plays it.
    gaveUpOn: null,
    // Playback position carried across navigations within the same video.
    resume: { videoId: null, time: 0, rate: 1 },
  };

  const $ = (selector, root = document) => root.querySelector(selector);

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

  function resolveResponse(player) {
    const videoId = currentVideoId();
    if (!videoId) return null;

    const live = livePlayerResponse(player);
    if (live && live.videoDetails.videoId === videoId) return live;

    const initial = initialPlayerResponse();
    if (initial && initial.videoDetails.videoId === videoId) return initial;

    return null;
  }

  // Pick a single muxed (audio + video) progressive stream we can hand straight
  // to a <video> element. Adaptive formats require an external audio + video
  // pairing layer (typically MSE), which is out of scope — if only adaptive
  // streams are available we bail out and keep YouTube's player handling it.
  function pickStream(response) {
    if (!response.streamingData) return null;

    const usable = (response.streamingData.formats || []).filter((format) => {
      const mime = format.mimeType || "";
      return format.url && format.contentLength && !mime.includes("text/");
    });

    if (usable.length === 0) return null;

    return usable.reduce((best, format) =>
      (format.bitrate || 0) > (best.bitrate || 0) ? format : best
    );
  }

  function captionTracks(response) {
    const renderer =
      response.captions && response.captions.playerCaptionsTracklistRenderer;
    return (renderer && renderer.captionTracks) || [];
  }

  /* ------------------------------------------------------------------ *
   * Stock player control
   * ------------------------------------------------------------------ */

  function stockPlayer() {
    return $(PLAYER_SELECTOR);
  }

  function pauseStock() {
    const player = stockPlayer();
    if (!player || typeof player.pauseVideo !== "function") return;
    try {
      player.pauseVideo();
    } catch (_) {
      /* player mid-load */
    }
  }

  function resumeStock() {
    const player = stockPlayer();
    if (!player || typeof player.playVideo !== "function") return;
    try {
      player.playVideo();
    } catch (_) {
      /* player mid-load */
    }
  }

  /* ------------------------------------------------------------------ *
   * Native player overlay
   * ------------------------------------------------------------------ */

  // The overlay is placed as the *next sibling* of #movie_player, inside the
  // same sized wrapper. Waiting until after #movie_player (and giving it a very
  // high z-index) means YouTube's own UI can never paint above it, even when it
  // re-enthuses and re-renders its internals underneath.
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

  // Tracks YouTube timedtext into WebVTT so Safari's native caption picker can
  // consume them. Tracks are exposed but never force-enabled — nobody likes
  // captions switching themselves back on after a reload.
  function buildCaptions(response, video) {
    captionTracks(response).forEach((track) => {
      const trackEl = document.createElement("track");
      const url = new URL(track.baseUrl);
      url.searchParams.set("fmt", "vtt");
      trackEl.src = url.toString();
      trackEl.kind = "captions";
      trackEl.srclang = track.languageCode;
      trackEl.label = track.name.simpleText || track.languageCode;
      video.appendChild(trackEl);
    });
  }

  function buildVideo(stream, response) {
    const video = document.createElement("video");

    video.controls = true;
    video.autoplay = true;
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x-webkit-airplay", "allow");
    video.referrerPolicy = "origin";
    video.style.cssText =
      "display:block;width:100%;height:100%;background:#000;";

    video.src = stream.url;
    buildCaptions(response, video);
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
          if (video.paused) video.play();
          else video.pause();
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
        case " ":
          if (video.paused) video.play();
          else video.pause();
          event.preventDefault();
          break;
      }
    };

    document.addEventListener("keydown", handler);
  }

  function activeVideo() {
    const overlay = $(OVERLAY_SELECTOR);
    return overlay ? overlay.querySelector("video") : null;
  }

  // Mount the native player. Returns the <video>, or null if the stock player
  // has no usable stream for the current URL.
  function mountVideo(response) {
    const stream = pickStream(response);
    if (!stream) return null;

    state.videoId = currentVideoId();

    pauseStock();

    const overlay = ensureOverlay();
    if (!overlay) return null;

    const video = buildVideo(stream, response);
    restorePlayback(video);
    overlay.replaceChildren(video);

    attachKeyboardShortcuts();

    // If the selected stream never comes up, back out cleanly and hand control
    // to the stock player rather than leaving a permanent black frame.
    let fired = false;
    const failTimer = window.setTimeout(() => {
      if (fired) return;
      fired = true;
      fallbackToStock();
    }, STREAM_TIMEOUT_MS);

    const clearFail = () => {
      if (fired) return;
      fired = true;
      window.clearTimeout(failTimer);
    };

    video.addEventListener("loadeddata", clearFail, { once: true });
    video.addEventListener("playing", clearFail, { once: true });
    video.addEventListener("error", () => {
      clearFail();
      fallbackToStock();
    });

    return video;
  }

  function fallbackToStock() {
    state.gaveUpOn = currentVideoId();
    removeOverlay();
    resumeStock();
    console.warn("[citric] stream failed, handed back to the stock player");
  }

  /* ------------------------------------------------------------------ *
   * Boot and SPA navigation
   *
   * Nothing under document_start is guaranteed to exist yet, so we watch for
   * the player container to appear. YouTube reuses the same container across
   * watch pages, so route changes are handled by tearing down our overlay and
   * re-mounting once the underlying player reports the new video.
   * ------------------------------------------------------------------ */

  const rebuildForNavigation = debounce(() => {
    const video = activeVideo();
    rememberPlayback(video);

    const player = stockPlayer();
    if (!player) {
      removeOverlay();
      return;
    }

    const videoId = currentVideoId();
    if (state.gaveUpOn !== videoId) state.gaveUpOn = null;

    // Poll the underlying player until it reports the video the URL now points
    // to, then mount a fresh native element. If the player never catches up we
    // simply stop and let YouTube's own player take over seamlessly.
    const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
    const poll = () => {
      const videoId = currentVideoId();
      if (!videoId) {
        removeOverlay();
        return;
      }

      const response = resolveResponse(player);
      if (response && response.videoDetails.videoId === videoId) {
        state.videoId = null; // fresh mount, don't carry stale resume state
        mountVideo(response);
        return;
      }

      if (Date.now() > deadline) {
        removeOverlay();
        return;
      }
      window.setTimeout(poll, 150);
    };

    poll();
  }, 300);

  function start() {
    const onFirstPlayer = () => {
      pauseStock();
      rebuildForNavigation();
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

    // Primary navigation signal: fires after YouTube swaps watch content.
    // It is dispatched on <window> (some pages relay it to <document>), so
    // listen on both; the handler is idempotent so a double fire is harmless.
    const onNavigate = () => {
      rememberPlayback(activeVideo());
      state.videoId = null;
      rebuildForNavigation();
    };
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    document.addEventListener(NAVIGATE_EVENT, onNavigate);

    // Backstop observer: YouTube occasionally re-mounts or clears the player
    // container without emitting a navigation event (embed re-sizes, live
    // reloads, canonical-URL swaps). Reconcile the overlay whenever the player
    // container above it is touched.
    const reconcile = debounce(() => {
      const player = stockPlayer();
      const overlay = $(OVERLAY_SELECTOR);

      if (!player) {
        removeOverlay();
        return;
      }

      if (!currentVideoId()) {
        removeOverlay();
        return;
      }

      if (overlay && overlay.previousElementSibling !== player) {
        if (overlay.isConnected) overlay.remove();
        rebuildForNavigation();
        return;
      }

      if (!overlay && state.gaveUpOn !== currentVideoId()) {
        rebuildForNavigation();
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