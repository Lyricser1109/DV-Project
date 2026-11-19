// Only page navigation lives here. Each chart keeps its own JavaScript file.
(() => {
  const questionFiles = [
    "visualisations.html",
    "visualisations-q2.html",
    "visualisations-q3.html",
    "visualisations-q4.html",
    "visualisations-q5.html"
  ];
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const storageKey = "road-injury-question-transition";
  const currentIndex = getQuestionIndex(window.location.href);
  const nativeTransitions = "onpagereveal" in window &&
    window.CSS && CSS.supports("view-transition-name", "question-content");
  let navigating = false;

  if (currentIndex === -1) return;

  root.dataset.questionTransitions = nativeTransitions ? "native" : "fallback";

  function getQuestionIndex(address) {
    const url = new URL(address, window.location.href);
    if (url.origin !== window.location.origin) return -1;
    if (url.pathname.slice(0, url.pathname.lastIndexOf("/")) !==
        window.location.pathname.slice(0, window.location.pathname.lastIndexOf("/"))) return -1;
    return questionFiles.indexOf(url.pathname.split("/").pop());
  }

  function setDirection(direction) {
    root.style.setProperty("--question-shift", direction < 0 ? "-24px" : "24px");
  }

  // Read before the first paint so the incoming page moves in the right direction.
  try {
    const pending = JSON.parse(sessionStorage.getItem(storageKey));
    sessionStorage.removeItem(storageKey);
    if (pending && pending.to === currentIndex && Date.now() - pending.time < 10000) {
      setDirection(pending.direction);
    }
  } catch {
    // Normal links and transitions still work if storage is unavailable.
  }

  window.addEventListener("pageswap", event => {
    if (reducedMotion.matches) event.viewTransition?.skipTransition();
    const destination = event.activation?.entry?.url;
    const nextIndex = destination ? getQuestionIndex(destination) : -1;
    if (nextIndex !== -1) setDirection(nextIndex - currentIndex);
  });

  window.addEventListener("pagereveal", event => {
    if (reducedMotion.matches) event.viewTransition?.skipTransition();
    const previous = window.navigation?.activation?.from?.url;
    const previousIndex = previous ? getQuestionIndex(previous) : -1;
    if (previousIndex !== -1) setDirection(currentIndex - previousIndex);
  });

  document.addEventListener("click", async event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") ||
        (link.target && link.target !== "_self")) return;

    const url = new URL(link.href);
    const nextIndex = getQuestionIndex(url.href);
    if (nextIndex === -1 || nextIndex === currentIndex) return;

    const direction = nextIndex - currentIndex;
    setDirection(direction);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        to: nextIndex,
        direction,
        time: Date.now()
      }));
    } catch {
      // Storage is optional; it only remembers the transition direction.
    }

    // Keep normal browser navigation for native transitions and reduced motion.
    if (nativeTransitions || reducedMotion.matches) return;

    const stage = document.querySelector(".question-stage");
    if (!stage || typeof stage.animate !== "function") return;
    event.preventDefault();
    if (navigating) return;
    navigating = true;

    const distance = direction < 0 ? 24 : -24;
    const animation = stage.animate([
      { opacity: 1, transform: "translateX(0)" },
      { opacity: 0, transform: `translateX(${distance}px)` }
    ], { duration: 160, easing: "ease-in", fill: "forwards" });

    await animation.finished.catch(() => {});
    window.location.assign(url.href);
  });

  // A browser Back/Forward restoration must not keep the old exit animation.
  window.addEventListener("pageshow", event => {
    navigating = false;
    if (event.persisted) {
      document.querySelector(".question-stage")?.getAnimations().forEach(animation => {
        animation.cancel();
      });
    }
  });
})();
