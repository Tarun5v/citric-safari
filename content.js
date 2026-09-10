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

  function activeVideo() {
    const overlay = $(OVERLAY_SELECTOR);
    return overlay ? overlay.querySelector("video") : null;
  }

  /* ------------------------------------------------------------------ *
   * Extraction path
   * ------------------------------------------------------------------ */

  function buildVideo(stream) {
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
    overlay.appendChild(video);
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

    overlay.appendChild(ytVideo);
    styleStolenVideo(ytVideo);
    state.videoId = currentVideoId();
    state.mode = "adopt";

    ytVideo.controls = true;
    ytVideo.setAttribute("x-webkit-airplay", "allow");
    ytVideo.playsInline = true;

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
        overlay.appendChild(video);
        styleStolenVideo(video);
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