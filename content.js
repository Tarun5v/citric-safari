/*!
 * Citric — a lean native HTML5 player for YouTube.
 *
 * Replaces YouTube's stock player with a lightweight <video> element. The
 * #movie_player container is kept in place so YouTube's layout and client-side
 * navigation keep working, but the underlying player is paused, detached from
 * the DOM, and swapped for a bare-bones player with native Safari controls.
 */

("use strict");

(() => {
  const PLAYER_SELECTOR = "#movie_player";
  const NAVIGATE_EVENT = "yt-navigate-finish";

  // How long we are willing to wait for the underlying player to report a fresh
  // response after a route change. If it does not arrive in time we leave
  // YouTube's own player alone rather than risk a black frame.
  const RESPONSE_TIMEOUT_MS = 5000;

  const state = {
    videoId: null,
    replacing: false,
    // Playback position carried across navigations within the same video.
    // Keyed by videoId so accidental back-forth does not lose your spot.
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
  // streams are available we bail out and keep YouTube's player.
  function pickStream(response) {
    if (!response.streamingData) return null;

    const usable = (response.streamingData.formats || []).filter(
      (format) =>
        format.url &&
        format.contentLength &&
        !format.mimeType.includes("text/")
    );

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
   * Neutralizing the stock player
   *
   * Pause playback first so the underlying engine stops decoding, then strip
   * the player's DOM children so its chrome, poster and telemetry hooks are no
   * longer part of the document. We leave the container element itself intact.
   * ------------------------------------------------------------------ */

  function neutralize(player) {
    if (player && typeof player.pauseVideo === "function") {
      try {
        player.pauseVideo();
      } catch (_) {
        /* player mid-load */
      }
    }

    player.removeAttribute("style");
    player.style.cssText =
      "display:block;width:100%;height:100%;overflow:hidden;background:#000;";

    player.replaceChildren();
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
    if (resume && resume.videoId === state.videoId) {
      if (resume.time > 0) video.currentTime = resume.time;
      if (resume.rate && resume.rate !== 1) video.playbackRate = resume.rate;
    }
  }

  /* ------------------------------------------------------------------ *
   * Native player replacement
   * ------------------------------------------------------------------ */

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

  let keyboardBound = false;
  function attachKeyboardShortcuts() {
    if (keyboardBound) return;
    keyboardBound = true;

    const handler = (event) => {
      const video = getActiveVideo();
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

  function install(player) {
    if (state.replacing) return;
    state.replacing = true;
    try {
      const response = resolveResponse(player);
      const stream = response && pickStream(response);
      if (!response || !stream) return;

      const videoId = currentVideoId();
      if (!videoId) return;
      state.videoId = videoId;

      // Grab the live player's playback position before we pull the rug out.
      rememberPlayback(getActiveVideo());

      neutralize(player);

      const video = buildVideo(stream, response);
      restorePlayback(video);
      player.replaceChildren(video);

      attachKeyboardShortcuts();
      console.info(`[citric] playing ${videoId} natively`);
    } finally {
      state.replacing = false;
    }
  }

  // The <video> we injected last time around, if it is still connected.
  function getActiveVideo() {
    const player = $(PLAYER_SELECTOR);
    if (!player) return null;
    return player.querySelector("video");
  }

  /* ------------------------------------------------------------------ *
   * Boot and SPA navigation
   *
   * Nothing under document_start is guaranteed to exist yet, so we watch for
   * the player container to appear. YouTube reuses the same container across
   * watch pages, so route changes are handled by tearing down our elements and
   * re-installing once the underlying player reports the new video.
   * ------------------------------------------------------------------ */

  const awaitPlayer = (callback) => {
    const existing = $(PLAYER_SELECTOR);
    if (existing) {
      callback(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const player = $(PLAYER_SELECTOR);
      if (!player) return;
      observer.disconnect();
      callback(player);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const rebuildForNavigation = debounce(() => {
    const video = getActiveVideo();
    rememberPlayback(video);
    state.videoId = null;

    const player = $(PLAYER_SELECTOR);
    if (!player) return;

    // Poll the underlying player until it reports the video the URL now points
    // to, then swap in a fresh native element. If the player never catches up we
    // simply stop and let YouTube's own player take over seamlessly.
    const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
    const poll = () => {
      if (state.replacing) return;
      const videoId = currentVideoId();
      if (!videoId) {
        state.videoId = null;
        return;
      }
      const live = livePlayerResponse(player);
      if (live && live.videoDetails.videoId === videoId) {
        install(player);
        return;
      }
      if (Date.now() > deadline) return;
      window.setTimeout(poll, 150);
    };
    poll();
  }, 300);

  function start() {
    awaitPlayer((player) => {
      neutralize(player);
      install(player);
    });

    // Primary navigation signal: fires after YouTube swaps watch content.
    // It is dispatched on <window> (some pages relay it to <document>), so
    // listen on both; the handler is idempotent so a double fire is harmless.
    const onNavigate = () => {
      state.videoId = null;
      rebuildForNavigation();
    };
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    document.addEventListener(NAVIGATE_EVENT, onNavigate);

    // Backstop observer: YouTube occasionally re-mounts or clears the player
    // container without emitting a navigation event (embed re-sizes, live
    // reloads). Watch for the container being emptied beneath us and recover.
    const containerObserver = new MutationObserver(() => {
      const video = getActiveVideo();
      if (!video || !video.isConnected) {
        rebuildForNavigation();
      }
    });

    const applyContainerObserver = () => {
      const player = $(PLAYER_SELECTOR);
      if (!player) return;
      containerObserver.observe(player, {
        childList: true,
        subtree: true,
      });
    };

    awaitPlayer(applyContainerObserver);
  }

  start();
})();