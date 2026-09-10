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

  /* Boot at document_start: nothing is guaranteed to exist yet, so watch the
   * document for the player container to appear before doing anything. */

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

  function start() {
    awaitPlayer((player) => {
      neutralize(player);
    });
  }

  start();
})();