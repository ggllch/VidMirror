(function initVidMirrorContent() {
  if (globalThis.__VIDMIRROR_CONTROLLER__) {
    return;
  }
  const api = globalThis.browser ?? globalThis.chrome;

  let isRunning = false;
  let observer = null;
  let rescanFrameId = null;
  let warmupFrameId = null;
  let periodicRescanId = null;
  let warmupAttempts = 0;

  const MIRROR_ATTRIBUTE = "data-vidmirror-applied";
  const ORIGINAL_TRANSFORM_ATTRIBUTE = "data-vidmirror-original-transform";
  const ORIGINAL_PRIORITY_ATTRIBUTE = "data-vidmirror-original-priority";
  const ORIGINAL_SCALE_ATTRIBUTE = "data-vidmirror-original-scale";
  const ORIGINAL_SCALE_PRIORITY_ATTRIBUTE = "data-vidmirror-original-scale-priority";

  function isSupportedPage() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function isYouTubePage() {
    return (
      location.hostname === "youtube.com" ||
      location.hostname === "www.youtube.com" ||
      location.hostname.endsWith(".youtube.com") ||
      location.hostname === "youtu.be"
    );
  }

  function findAllVideosInShadow(root = document, results = []) {
    const videos = root.querySelectorAll("video");
    videos.forEach((video) => results.push(video));

    const allElements = root.querySelectorAll("*");
    for (const element of allElements) {
      if (element.shadowRoot) {
        findAllVideosInShadow(element.shadowRoot, results);
      }
    }

    return results;
  }

  function getUniqueVideos() {
    return [...new Set(findAllVideosInShadow())];
  }

  function mirrorVideo(video) {
    if (!video.hasAttribute(MIRROR_ATTRIBUTE)) {
      video.setAttribute(ORIGINAL_TRANSFORM_ATTRIBUTE, video.style.transform || "");
      video.setAttribute(
        ORIGINAL_PRIORITY_ATTRIBUTE,
        video.style.getPropertyPriority("transform") || ""
      );
      video.setAttribute(ORIGINAL_SCALE_ATTRIBUTE, video.style.scale || "");
      video.setAttribute(
        ORIGINAL_SCALE_PRIORITY_ATTRIBUTE,
        video.style.getPropertyPriority("scale") || ""
      );
      video.setAttribute(MIRROR_ATTRIBUTE, "true");
    }

    if (!isYouTubePage() && CSS.supports("scale", "-1 1")) {
      video.style.setProperty("scale", "-1 1", "important");
      return;
    }

    const baseTransform = video.getAttribute(ORIGINAL_TRANSFORM_ATTRIBUTE) || "";
    const mirroredTransform = `${baseTransform} scaleX(-1)`.trim();
    video.style.setProperty("transform", mirroredTransform, "important");
  }

  function unmirrorVideo(video) {
    const originalTransform = video.getAttribute(ORIGINAL_TRANSFORM_ATTRIBUTE) || "";
    const originalPriority = video.getAttribute(ORIGINAL_PRIORITY_ATTRIBUTE) || "";
    const originalScale = video.getAttribute(ORIGINAL_SCALE_ATTRIBUTE) || "";
    const originalScalePriority =
      video.getAttribute(ORIGINAL_SCALE_PRIORITY_ATTRIBUTE) || "";

    if (originalTransform) {
      video.style.setProperty("transform", originalTransform, originalPriority || "");
    } else {
      video.style.removeProperty("transform");
    }

    if (originalScale) {
      video.style.setProperty("scale", originalScale, originalScalePriority || "");
    } else {
      video.style.removeProperty("scale");
    }

    video.removeAttribute(MIRROR_ATTRIBUTE);
    video.removeAttribute(ORIGINAL_TRANSFORM_ATTRIBUTE);
    video.removeAttribute(ORIGINAL_PRIORITY_ATTRIBUTE);
    video.removeAttribute(ORIGINAL_SCALE_ATTRIBUTE);
    video.removeAttribute(ORIGINAL_SCALE_PRIORITY_ATTRIBUTE);
  }

  function mirrorVideos() {
    const videos = getUniqueVideos();
    if (videos.length > 0) {
      videos.forEach(mirrorVideo);
      return true;
    }
    return false;
  }

  function unmirrorVideos() {
    const videos = getUniqueVideos();
    videos
      .filter((video) => video.hasAttribute(MIRROR_ATTRIBUTE))
      .forEach(unmirrorVideo);
  }

  function scheduleRescan() {
    if (!isRunning || rescanFrameId !== null) {
      return;
    }

    rescanFrameId = requestAnimationFrame(() => {
      rescanFrameId = null;
      if (isRunning) {
        mirrorVideos();
      }
    });
  }

  function startWarmupRescan() {
    warmupAttempts = 0;

    const run = () => {
      warmupFrameId = null;
      if (!isRunning) {
        return;
      }

      const mirrored = mirrorVideos();
      if (mirrored || warmupAttempts >= 120) {
        return;
      }

      warmupAttempts += 1;
      warmupFrameId = requestAnimationFrame(run);
    };

    if (warmupFrameId !== null) {
      cancelAnimationFrame(warmupFrameId);
      warmupFrameId = null;
    }

    warmupFrameId = requestAnimationFrame(run);
  }

  function stopScript() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (rescanFrameId !== null) {
      cancelAnimationFrame(rescanFrameId);
      rescanFrameId = null;
    }
    if (warmupFrameId !== null) {
      cancelAnimationFrame(warmupFrameId);
      warmupFrameId = null;
    }
    if (periodicRescanId !== null) {
      clearInterval(periodicRescanId);
      periodicRescanId = null;
    }

    unmirrorVideos();
    isRunning = false;
  }

  function startScript() {
    if (isRunning || !isSupportedPage()) {
      return;
    }

    isRunning = true;
    mirrorVideos();
    startWarmupRescan();

    observer = new MutationObserver(() => {
      scheduleRescan();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });

    periodicRescanId = setInterval(() => {
      if (isRunning) {
        mirrorVideos();
      }
    }, 1200);
  }

  function setEnabled(enabled) {
    if (enabled) {
      startScript();
    } else {
      stopScript();
    }
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "VIDMIRROR_PING") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type !== "VIDMIRROR_SET_ENABLED") {
      return;
    }

    setEnabled(Boolean(message.enabled));
    sendResponse({ ok: true });
  });

  globalThis.__VIDMIRROR_CONTROLLER__ = {
    setEnabled
  };
})();
