/* =========================================================
   OROBRICK — interactions
   Stack: Lenis (smooth scroll) · GSAP + ScrollTrigger · Splitting
   Hero: scroll-scrubbed cinematic video (Google Flow / Veo 3)
   ========================================================= */

import { initBgFluid } from "./bgFluid.js";
import { initHeroLiquid } from "./heroLiquid.js";
import { initPageLiquid } from "./pageLiquid.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFinePointerDevice = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// WebGL effects only on desktop — skip on mobile for battery + performance
if (isFinePointerDevice) {
  initBgFluid({ speed: 0.18, grain: 0.045 });
  window.addEventListener("DOMContentLoaded", () => {
    initHeroLiquid({
      canvasId: "heroLiquid",
      videoId: "heroFrameCanvas",
      heroSelector: ".hero",
    });
    initPageLiquid({ canvasId: "pageLiquid" });
  });
}

gsap.registerPlugin(ScrollTrigger);

/* ---------------------------------------------------------
   1. Splitting (mask-friendly char/word splits)
   Skip on touch devices to reduce DOM node count + layout thrashing
   --------------------------------------------------------- */
if (isFinePointerDevice) {
  Splitting();
  document.querySelectorAll("[data-splitting] .char").forEach((c, i) => {
    c.style.setProperty("--char-index", i);
  });
}

/* ---------------------------------------------------------
   2. Loader
   --------------------------------------------------------- */
const loader = document.getElementById("loader");
const loaderFill = document.querySelector(".loader-bar-fill");

let loaderFinished = false;
function finishLoader() {
  if (loaderFinished) return;
  loaderFinished = true;
  if (loaderFill) loaderFill.style.width = "100%";
  setTimeout(() => {
    loader.classList.add("is-done");
    document.body.classList.add("is-loaded");
    setTimeout(startHero, 250);
  }, 400);
}
// Fire on load event OR after a safety timeout — whichever comes first.
window.addEventListener("load", finishLoader);
setTimeout(finishLoader, 1500);

/* ---------------------------------------------------------
   3. Lenis smooth scroll
   --------------------------------------------------------- */
let lenis = new Lenis({
  lerp: 0.07,           // Responsive but smooth
  smoothWheel: true,
  wheelMultiplier: 0.7,
  touchMultiplier: 1.5,
});

// Sync Lenis with GSAP ScrollTrigger for buttery smooth pinned sections
lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute("href"));
    if (target) {
      lenis.scrollTo(target, { offset: -90 });
    }
    document.getElementById("navLinks")?.classList.remove("is-open");
  });
});

/* ---------------------------------------------------------
   4. Navigation
   --------------------------------------------------------- */
const nav = document.getElementById("nav");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

ScrollTrigger.create({
  start: 80,
  end: 99999,
  onUpdate: (self) => nav.classList.toggle("is-solid", self.scroll() > 80),
});

navToggle?.addEventListener("click", () => navLinks.classList.toggle("is-open"));

/* ---------------------------------------------------------
   5. Hero — scroll-scrubbed video with smooth zoom-in
   Problem: browsers can only seek to keyframes in H.264 video,
   so setting currentTime shows only the nearest keyframe.
   Solution: play the video once at load, capture every frame
   into an array, then draw the right frame to a canvas on scroll.
   --------------------------------------------------------- */
const heroVideo = document.getElementById("heroVideo");
const heroCanvas = document.getElementById("heroFrameCanvas");
const heroMark = document.querySelector(".hero-mark");
const heroContent = document.querySelector(".hero-content");
const heroWords = document.querySelectorAll(".hero-word");

gsap.set(heroWords, { y: 30, opacity: 0 });
gsap.set(heroContent, { opacity: 0, y: 30 });

function startHero() {
  const mask = document.getElementById("heroMask");
  if (mask) {
    gsap.fromTo(mask,
      { opacity: 0 },
      { opacity: 1, duration: 1.1, ease: "power2.out" }
    );
  }
}

/* --- Frame extraction engine ---
   Plays the video in the background at 2x speed, captures every frame
   to an offscreen canvas, stores them as ImageBitmap for zero-copy
   drawing on scroll. Falls back to plain drawImage if createImageBitmap
   isn't available. */
const extractedFrames = [];
let frameCanvasCtx = null;
let framesReady = false;

function resizeHeroCanvas() {
  if (!heroCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = heroCanvas.clientWidth || window.innerWidth;
  const h = heroCanvas.clientHeight || window.innerHeight;
  heroCanvas.width = Math.floor(w * dpr);
  heroCanvas.height = Math.floor(h * dpr);
}

if (heroCanvas) {
  frameCanvasCtx = heroCanvas.getContext("2d", { alpha: false });
  resizeHeroCanvas();
  window.addEventListener("resize", () => {
    resizeHeroCanvas();
    // Redraw current frame after resize
    drawFrameAtProgress(lastDrawnProgress);
  });
}

/* Smooth frame rendering engine:
   ScrollTrigger sets a *target* progress. A rAF loop lerps the
   *current* progress toward it every frame, so the video glides
   smoothly even when scroll jumps several frames at once.
   Crossfade between adjacent frames eliminates hard cuts. */
let lastDrawnProgress = 0;

function drawCoverFrame(ctx, source, canvas) {
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = source.width;
  const ih = source.height;
  if (!iw || !ih) return;
  const scale = Math.max(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  const x = (cw - w) / 2;
  const y = (ch - h) / 2;
  ctx.drawImage(source, x, y, w, h);
}

function renderFrame(p) {
  if (!frameCanvasCtx || !heroCanvas) return;
  const len = extractedFrames.length;
  if (!len) return;

  const exact = p * (len - 1);
  const idxA = Math.floor(exact);
  const idxB = Math.min(idxA + 1, len - 1);
  const mix = exact - idxA;

  drawCoverFrame(frameCanvasCtx, extractedFrames[idxA], heroCanvas);

  if (idxB !== idxA && mix > 0.005) {
    frameCanvasCtx.globalAlpha = mix;
    drawCoverFrame(frameCanvasCtx, extractedFrames[idxB], heroCanvas);
    frameCanvasCtx.globalAlpha = 1.0;
  }
}

// Called directly by GSAP ScrollTrigger's onUpdate.
// GSAP scrub already smooths the progress value — no extra lerp needed.
// The crossfade between adjacent frames handles inter-frame smoothness.
function drawFrameAtProgress(p) {
  if (!frameCanvasCtx || !heroCanvas || !extractedFrames.length) return;
  // Avoid redundant redraws for the same position
  if (Math.abs(p - lastDrawnProgress) < 0.0001) return;
  lastDrawnProgress = p;
  renderFrame(p);
}

async function extractFrames() {
  if (!heroVideo) return;

  return new Promise((resolve) => {
    // Wait for video metadata
    function start() {
      const dur = heroVideo.duration;
      if (!dur || isNaN(dur)) {
        heroVideo.addEventListener("loadedmetadata", start, { once: true });
        return;
      }

      // Capture at full native resolution for sharp quality
      const CAP_W = heroVideo.videoWidth;
      const CAP_H = heroVideo.videoHeight;
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = CAP_W;
      captureCanvas.height = CAP_H;
      const capCtx = captureCanvas.getContext("2d", { alpha: false });

      function captureFrame() {
        capCtx.drawImage(heroVideo, 0, 0);
        if (typeof createImageBitmap === "function") {
          createImageBitmap(captureCanvas).then((bmp) => {
            extractedFrames.push(bmp);
          });
        } else {
          const clone = document.createElement("canvas");
          clone.width = CAP_W;
          clone.height = CAP_H;
          clone.getContext("2d").drawImage(captureCanvas, 0, 0);
          extractedFrames.push(clone);
        }
      }

      if ("requestVideoFrameCallback" in heroVideo) {
        // Modern path: capture every rendered frame at 1x speed
        // so we get the full native framerate with no skips
        function onFrame() {
          captureFrame();
          if (extractedFrames.length === 1) drawFrameAtProgress(0);
          if (!heroVideo.ended && !heroVideo.paused) {
            heroVideo.requestVideoFrameCallback(onFrame);
          }
        }
        heroVideo.requestVideoFrameCallback(onFrame);
        heroVideo.playbackRate = 1.0; // 1x = capture every single frame
        heroVideo.play().then(() => {}).catch(() => {});

        heroVideo.addEventListener("ended", () => {
          captureFrame();
          heroVideo.pause();
          framesReady = true;
          drawFrameAtProgress(0);
          console.log(`[Orobrick] Captured ${extractedFrames.length} frames at ${CAP_W}x${CAP_H}`);
          resolve();
        }, { once: true });

      } else {
        // Fallback: seek at fixed intervals (lower on mobile to avoid UI freeze)
        const FPS = isFinePointerDevice ? 60 : 24;
        const totalFrames = Math.ceil(dur * FPS);
        let i = 0;

        function seekNext() {
          if (i >= totalFrames) {
            framesReady = true;
            drawFrameAtProgress(0);
            resolve();
            return;
          }
          heroVideo.currentTime = (i / totalFrames) * dur;
          i++;
        }

        heroVideo.addEventListener("seeked", () => {
          captureFrame();
          if (extractedFrames.length === 1) drawFrameAtProgress(0);
          seekNext();
        });

        seekNext();
      }
    }

    if (heroVideo.readyState >= 1) {
      start();
    } else {
      heroVideo.addEventListener("loadedmetadata", start, { once: true });
      heroVideo.load();
    }
  });
}

const heroMediaEls = document.querySelectorAll(".hero-media");
const heroOverlayEl = document.querySelector(".hero-overlay");
const maskTextEl = document.getElementById("maskText");
const heroMaskEl = document.getElementById("heroMask");
const vw = window.innerWidth;
const startSize = Math.max(60, Math.min(vw * 0.12, 180));
const endSize = Math.max(800, vw * 1.8);

// Set initial mask text size so full word is visible on any screen
if (maskTextEl) maskTextEl.setAttribute("font-size", startSize);

if (!reduceMotion && isFinePointerDevice) {
  /* =======================================================
     DESKTOP HERO — full scroll-scrub with frame extraction
     ======================================================= */
  extractFrames().then(() => {
    console.log(`[Orobrick] Extracted ${extractedFrames.length} video frames`);
  });

  if (heroMediaEls.length) gsap.set(heroMediaEls, { opacity: 1, scale: 1.0 });
  if (heroOverlayEl) gsap.set(heroOverlayEl, { opacity: 0 });

  const ZOOM_PHASE = 0.35;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "+=500%",
      pin: true,
      pinSpacing: true,
      scrub: 2.5,
      anticipatePin: 1,
      onUpdate: (self) => {
        drawFrameAtProgress(self.progress);
      },
    },
  });

  if (maskTextEl) {
    tl.fromTo(maskTextEl,
      { attr: { "font-size": startSize } },
      { attr: { "font-size": endSize }, duration: ZOOM_PHASE, ease: "power1.inOut" },
      0.0
    );
  }
  if (heroMaskEl) {
    tl.fromTo(heroMaskEl,
      { opacity: 1 },
      { opacity: 0, duration: 0.05, ease: "power2.out" },
      ZOOM_PHASE - 0.05
    );
  }
  if (heroMediaEls.length) {
    tl.fromTo(heroMediaEls,
      { scale: 1.0 },
      { scale: 1.25, duration: 1.0, ease: "power2.inOut" },
      0.0
    );
  }
  if (heroOverlayEl) {
    tl.fromTo(heroOverlayEl,
      { opacity: 0 },
      { opacity: 0.6, duration: 0.15, ease: "power2.out" },
      0.80
    );
  }

  const wordsStart = 0.40;
  const wordsEnd = 0.78;
  const wordWindow = (wordsEnd - wordsStart) / heroWords.length;
  const FADE_FRAC = 0.18;
  heroWords.forEach((word, i) => {
    const start = wordsStart + i * wordWindow;
    const fadeDur = wordWindow * FADE_FRAC;
    tl.fromTo(word,
      { opacity: 0, y: 35 },
      { opacity: 1, y: 0, duration: fadeDur, ease: "power2.out" },
      start
    );
    tl.to(word,
      { opacity: 0, y: -35, duration: fadeDur, ease: "power2.in" },
      start + wordWindow - fadeDur
    );
  });

  tl.to(heroContent, { opacity: 1, y: 0, duration: 0.14, ease: "power2.out" }, 0.82);

} else if (!reduceMotion) {
  /* =======================================================
     MOBILE HERO — lightweight, no video scrubbing
     Video autoplays as background. Simple pin with mask zoom
     and content fade-in. No per-frame seeking = butter smooth.
     ======================================================= */
  // Loop video so it always has motion. Watchdog restarts if it stalls.
  if (heroVideo) {
    heroVideo.loop = true;
    heroVideo.playbackRate = 0.6;
    heroVideo.play().catch(() => {});
    // Restart on pause/stall — mobile browsers sometimes pause background video
    heroVideo.addEventListener("pause", () => {
      heroVideo.play().catch(() => {});
    });
    heroVideo.addEventListener("stalled", () => {
      heroVideo.play().catch(() => {});
    });
    // Periodic check every 3s — if somehow stopped, restart
    setInterval(() => {
      if (heroVideo.paused && document.visibilityState === "visible") {
        heroVideo.play().catch(() => {});
      }
    }, 3000);
  }
  if (heroMediaEls.length) gsap.set(heroMediaEls, { opacity: 1, scale: 1.0 });
  if (heroOverlayEl) gsap.set(heroOverlayEl, { opacity: 0.3 });

  const ZOOM_PHASE_M = 0.45;

  const tlm = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "+=200%",
      pin: true,
      pinSpacing: true,
      scrub: 0.8,
      anticipatePin: 1,
    },
  });

  // Mask text zoom — same cutout effect, shorter duration
  if (maskTextEl) {
    tlm.fromTo(maskTextEl,
      { attr: { "font-size": startSize } },
      { attr: { "font-size": endSize }, duration: ZOOM_PHASE_M, ease: "power2.inOut" },
      0.0
    );
  }
  if (heroMaskEl) {
    tlm.fromTo(heroMaskEl,
      { opacity: 1 },
      { opacity: 0, duration: 0.08, ease: "power2.out" },
      ZOOM_PHASE_M - 0.08
    );
  }

  // Gentle zoom on the video
  if (heroMediaEls.length) {
    tlm.fromTo(heroMediaEls,
      { scale: 1.0 },
      { scale: 1.1, duration: 1.0, ease: "power1.out" },
      0.0
    );
  }

  // Scrim + content reveal
  if (heroOverlayEl) {
    tlm.fromTo(heroOverlayEl,
      { opacity: 0.3 },
      { opacity: 0.65, duration: 0.2, ease: "power2.out" },
      0.6
    );
  }
  tlm.to(heroContent, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, 0.7);

} else {
  // Reduced motion: show everything immediately
  if (heroMark) heroMark.style.opacity = 0;
  heroContent.style.opacity = 1;
  heroContent.style.transform = "none";
}

/* ---------------------------------------------------------
   6. Section reveals — bidirectional IntersectionObserver.
      Each time an element enters viewport: show animation plays.
      Each time it leaves viewport: hide animation plays.
      So scrolling back up + back down replays the animations.
   --------------------------------------------------------- */
function revealOnScroll(elements, showAnim, hideAnim, rootMargin = "0px 0px -10% 0px") {
  if (!elements.length || !("IntersectionObserver" in window)) {
    elements.forEach((el, i) => showAnim(el, i));
    return;
  }
  const list = Array.from(elements);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const idx = list.indexOf(el);
        if (entry.isIntersecting) {
          showAnim(el, idx);
        } else if (hideAnim) {
          hideAnim(el, idx);
        }
      }
    },
    { rootMargin, threshold: 0.01 }
  );
  list.forEach((el) => observer.observe(el));
}

const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
revealOnScroll(
  revealEls,
  (el, i) => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: 0.9,
      ease: "power3.out",
      delay: (i % 6) * 0.05,
      overwrite: "auto",
      onStart: () => el.classList.add("is-in"),
    });
  },
  (el) => {
    gsap.to(el, {
      opacity: 0, y: 40,
      duration: 0.35,
      ease: "power2.in",
      overwrite: "auto",
      onComplete: () => el.classList.remove("is-in"),
    });
  }
);

/* ---------------------------------------------------------
   7. Section title reveals
   Desktop: staggered per-char animation (Splitting.js)
   Mobile: whole-title fade+slide (no Splitting = no .char nodes)
   --------------------------------------------------------- */
const titleEls = Array.from(
  document.querySelectorAll(".section-title[data-splitting], .cta-title[data-splitting], .contact-headline[data-splitting]")
);

if (isFinePointerDevice) {
  // Desktop: per-char stagger
  titleEls.forEach((title) => {
    gsap.set(title.querySelectorAll(".char"), { opacity: 0, y: 18 });
  });
  revealOnScroll(
    titleEls,
    (title) => {
      gsap.to(title.querySelectorAll(".char"), {
        opacity: 1, y: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.015,
        overwrite: "auto",
      });
    },
    (title) => {
      gsap.to(title.querySelectorAll(".char"), {
        opacity: 0, y: 18,
        duration: 0.3,
        ease: "power2.in",
        stagger: 0.005,
        overwrite: "auto",
      });
    }
  );
} else {
  // Mobile: whole-title fade + slide
  titleEls.forEach((title) => {
    gsap.set(title, { opacity: 0, y: 30 });
  });
  revealOnScroll(
    titleEls,
    (title) => {
      gsap.to(title, {
        opacity: 1, y: 0,
        duration: 0.7,
        ease: "power3.out",
        overwrite: "auto",
      });
    },
    (title) => {
      gsap.to(title, {
        opacity: 0, y: 30,
        duration: 0.3,
        ease: "power2.in",
        overwrite: "auto",
      });
    }
  );
}

/* ---------------------------------------------------------
   8. Process — glowing timeline with interactive steps
   Light travels along the rail as you scroll. Each step
   glows sequentially. Click/hover a step to jump the light
   to that position with a smooth transition.
   --------------------------------------------------------- */
const processSection = document.getElementById("process");
const processSteps = Array.from(document.querySelectorAll(".process-step"));
const railFill = document.getElementById("processRailFill");

if (processSection && railFill && processSteps.length) {
  let currentActiveIdx = -1;
  let isHovering = false;

  function activateStep(idx, smooth) {
    processSteps.forEach((step, i) => {
      const shouldBeActive = i <= idx;
      if (shouldBeActive && !step.classList.contains("is-active")) {
        // Stagger the glow: each step lights up with a tiny delay
        if (smooth) {
          setTimeout(() => step.classList.add("is-active"), i * 80);
        } else {
          step.classList.add("is-active");
        }
      } else if (!shouldBeActive) {
        step.classList.remove("is-active");
      }
    });
  }

  // Responsive: vertical rail on mobile uses height, horizontal uses width
  const isMobileLayout = window.innerWidth <= 720;
  function setRailFill(pct) {
    if (isMobileLayout) {
      railFill.style.width = "100%";
      railFill.style.height = `${pct}%`;
    } else {
      railFill.style.width = `${pct}%`;
    }
  }

  // Scroll-driven: light travels along the rail
  ScrollTrigger.create({
    trigger: processSection,
    start: "top 65%",
    end: "bottom 55%",
    scrub: 0.6,
    onUpdate: (self) => {
      if (isHovering) return; // Don't fight with hover interaction
      const p = self.progress;
      const activeIdx = Math.min(
        Math.floor(p * processSteps.length),
        processSteps.length - 1
      );
      setRailFill(p * 100);

      if (activeIdx !== currentActiveIdx) {
        currentActiveIdx = activeIdx;
        activateStep(activeIdx, true);
      }
    },
  });

  // Interactive: click a step to jump the light there
  processSteps.forEach((step, i) => {
    step.style.cursor = "pointer";

    step.addEventListener("mouseenter", () => {
      isHovering = true;
      const pct = ((i + 0.5) / processSteps.length) * 100;
      const prop = isMobileLayout ? "height" : "width";
      gsap.to(railFill, { [prop]: `${pct}%`, duration: 0.6, ease: "power2.out" });
      if (isMobileLayout) railFill.style.width = "100%";
      activateStep(i, true);
    });

    step.addEventListener("mouseleave", () => {
      isHovering = false;
      // Snap back to scroll-driven position
      ScrollTrigger.update();
    });

    step.addEventListener("click", () => {
      // Scroll to bring this step into better view
      const stepTop = step.getBoundingClientRect().top + window.scrollY - 200;
      lenis.scrollTo(stepTop, { duration: 1.2 });
    });
  });
}

/* ---------------------------------------------------------
   9. Gallery — bidirectional scale-in + scroll parallax
   --------------------------------------------------------- */
if (!reduceMotion) {
  const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));

  galleryItems.forEach((item) => {
    gsap.set(item, { autoAlpha: 0, scale: 0.92, y: 60 });
  });
  revealOnScroll(
    galleryItems,
    (item, i) => {
      gsap.to(item, {
        autoAlpha: 1, scale: 1, y: 0,
        duration: 1.0,
        ease: "power3.out",
        delay: (i % 3) * 0.08,
        overwrite: "auto",
      });
    },
    (item) => {
      gsap.to(item, {
        autoAlpha: 0, scale: 0.94, y: 40,
        duration: 0.45,
        ease: "power2.in",
        overwrite: "auto",
      });
    }
  );

  // Slow parallax while scrolling past — uses scrub so works both directions
  galleryItems.forEach((item) => {
    const img = item.querySelector(".gallery-img");
    if (!img) return;
    gsap.fromTo(img,
      { yPercent: -8 },
      {
        yPercent: 8,
        ease: "none",
        scrollTrigger: {
          trigger: item,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      }
    );
  });
}

/* ---------------------------------------------------------
   9b. About image — slow scale + slight tilt on scroll
   --------------------------------------------------------- */
const aboutVisual = document.querySelector(".about-visual");
const aboutImg = document.querySelector(".about-img");
if (aboutImg && aboutVisual && !reduceMotion) {
  gsap.fromTo(aboutImg,
    { scale: 1.15, yPercent: -4 },
    {
      scale: 1.0, yPercent: 4,
      ease: "none",
      scrollTrigger: {
        trigger: aboutVisual,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.6,
      },
    }
  );
}

/* ---------------------------------------------------------
   9c. Subtle body-bg theme transition between sections.
   Sections set data-bg-theme; we lerp html background between
   them as user scrolls so transitions feel cinematic.
   --------------------------------------------------------- */
const themedSections = document.querySelectorAll("[data-bg-theme]");
if (themedSections.length && !reduceMotion) {
  themedSections.forEach((sec) => {
    const theme = sec.dataset.bgTheme;
    ScrollTrigger.create({
      trigger: sec,
      start: "top 55%",
      end: "bottom 45%",
      onEnter: () => document.documentElement.setAttribute("data-theme", theme),
      onEnterBack: () => document.documentElement.setAttribute("data-theme", theme),
    });
  });
}

/* ---------------------------------------------------------
   9d. Service cards — INERTIA WHEEL CAROUSEL
   Grab-and-fling horizontal carousel with momentum physics.
   Cards tilt in 3D based on drag velocity. Decelerates like
   a spinning wheel. Supports mouse drag + touch + trackpad.
   --------------------------------------------------------- */
{
  const track = document.querySelector(".services-grid");
  const cards = Array.from(document.querySelectorAll(".service-card"));

  if (track && cards.length) {
    let pos = 0;          // current translate offset (px)
    let velocity = 0;     // px per frame
    let isDragging = false;
    let startX = 0;
    let startPos = 0;
    let lastX = 0;
    let lastTime = 0;
    let rafId = null;

    // Friction: lower = slides further (0.92–0.98 feels like a heavy wheel)
    const FRICTION = 0.955;
    // Max tilt angle in degrees based on velocity
    const MAX_TILT = 8;
    // How much velocity contributes to tilt
    const TILT_FACTOR = 0.15;

    // Calculate bounds
    function getBounds() {
      const trackW = track.scrollWidth;
      const viewW = track.parentElement.clientWidth;
      // Allow some rubber-band overshoot
      return { min: -(trackW - viewW + 40), max: 40 };
    }

    function applyTransform() {
      track.style.transform = `translate3d(${pos}px, 0, 0)`;

      // Apply 3D tilt to each card based on velocity
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, velocity * TILT_FACTOR));
      cards.forEach((card) => {
        card.style.transform =
          `rotateY(${tilt}deg) rotateX(${Math.abs(tilt) * 0.15}deg)`;
      });
    }

    function animate() {
      if (!isDragging) {
        // Apply friction to velocity
        velocity *= FRICTION;

        // Snap back if out of bounds (rubber-band)
        const bounds = getBounds();
        if (pos > bounds.max) {
          pos += (bounds.max - pos) * 0.12;
          velocity *= 0.5;
        } else if (pos < bounds.min) {
          pos += (bounds.min - pos) * 0.12;
          velocity *= 0.5;
        }

        pos += velocity;

        // Stop when velocity is negligible
        if (Math.abs(velocity) < 0.15) {
          velocity = 0;
          // Ease cards back to flat
          cards.forEach((card) => {
            card.style.transform = "rotateY(0deg) rotateX(0deg)";
          });
        }
      }

      applyTransform();
      rafId = requestAnimationFrame(animate);
    }

    // Start animation loop
    rafId = requestAnimationFrame(animate);

    // --- Mouse drag ---
    track.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startPos = pos;
      lastX = e.clientX;
      lastTime = performance.now();
      velocity = 0;
      track.classList.add("is-dragging");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      pos = startPos + dx;

      // Track velocity from recent movement
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocity = (e.clientX - lastX) / Math.max(dt, 8) * 16; // normalize to ~60fps
      }
      lastX = e.clientX;
      lastTime = now;
    });

    window.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove("is-dragging");
    });

    // --- Touch drag ---
    track.addEventListener("touchstart", (e) => {
      isDragging = true;
      startX = e.touches[0].clientX;
      startPos = pos;
      lastX = e.touches[0].clientX;
      lastTime = performance.now();
      velocity = 0;
      track.classList.add("is-dragging");
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!isDragging) return;
      const tx = e.touches[0].clientX;
      const dx = tx - startX;
      pos = startPos + dx;

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocity = (tx - lastX) / Math.max(dt, 8) * 16;
      }
      lastX = tx;
      lastTime = now;
    }, { passive: true });

    window.addEventListener("touchend", () => {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove("is-dragging");
    });

    // --- Horizontal scroll (trackpad / shift+wheel) ---
    track.addEventListener("wheel", (e) => {
      // Use deltaX for horizontal, deltaY for vertical scroll → map to horizontal
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      velocity -= delta * 0.4;
      e.preventDefault();
    }, { passive: false });

    // Prevent links/clicks from firing after a drag
    track.addEventListener("click", (e) => {
      if (Math.abs(pos - startPos) > 5) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}

/* ---------------------------------------------------------
   10. Asset upgrader — swap Unsplash placeholders for local files
   when they're present in /assets/. Looks at data-asset attribute.
   --------------------------------------------------------- */
async function upgradeToLocalAssets() {
  const els = document.querySelectorAll("img[data-asset]");
  for (const el of els) {
    const localPath = el.dataset.asset;
    try {
      const res = await fetch(localPath, { method: "HEAD" });
      if (res.ok) {
        el.src = localPath;
      }
    } catch (e) { /* ignore — placeholder stays */ }
  }
}
upgradeToLocalAssets();

/* ---------------------------------------------------------
   11. Contact form
   --------------------------------------------------------- */
const form = document.getElementById("contactForm");
const formStatus = document.getElementById("formStatus");

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const project = form.project.value;

  if (!name || !email || !project) {
    formStatus.textContent = "Please fill in your name, email, and project type.";
    formStatus.style.color = "#a05a3a";
    return;
  }

  formStatus.style.color = "var(--gold-deep)";
  formStatus.textContent = "Sending…";

  setTimeout(() => {
    formStatus.textContent = `Thanks ${name}. We'll be in touch within one business day.`;
    form.reset();
  }, 800);
});

/* ---------------------------------------------------------
   12. Magnetic CTAs (custom-cursor circle was removed)
   --------------------------------------------------------- */
const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
if (isFinePointer && !reduceMotion) {
  // Magnetic effect on buttons with [data-magnetic]
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    const STRENGTH = 0.32;
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) * STRENGTH;
      const y = (e.clientY - (rect.top + rect.height / 2)) * STRENGTH;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
    el.addEventListener("mouseleave", () => {
      el.style.transform = "translate3d(0,0,0)";
    });
  });

  // (Old 2D stick-stroke ripple canvas removed — WebGL heroLiquid handles
  //  all pointer-driven fluid feedback now.)
}

/* ---------------------------------------------------------
   12b. Language switcher — hand-written dictionary i18n
   Loads /i18n/<lang>.json on demand, walks every [data-i18n]
   and [data-i18n-attr="attrName:key"] element and rewrites
   text/attribute values. Persists choice in localStorage.

   Splitting.js note: data-splitting headings are wrapped in
   per-char <span class="char"> at boot. Any text rewrite
   destroys that structure. We snapshot the original English
   text first, flatten when applying any dictionary, and
   re-run Splitting on English so the per-char reveal works
   again. Other languages keep flat text (no reveal stagger
   but text is fully readable).
   --------------------------------------------------------- */
(function initLangSwitch() {
  const root = document.getElementById("langSwitch");
  const toggle = document.getElementById("langToggle");
  const menu = document.getElementById("langMenu");
  const current = document.getElementById("langCurrent");
  if (!root || !toggle || !menu || !current) return;

  const STORAGE_KEY = "orobrick-lang";
  const LABELS = { en: "EN", es: "ES", ar: "AR" };
  const SUPPORTED = ["en", "es", "ar"];
  const dictCache = {};

  // Snapshot the original English text of every splitting element so
  // we can flatten the per-char structure cleanly on any toggle.
  const origText = new WeakMap();
  function snapshotSplittingText() {
    document.querySelectorAll("[data-splitting]").forEach((el) => {
      if (!origText.has(el)) origText.set(el, el.textContent.trim());
    });
  }
  function flattenSplitting() {
    document.querySelectorAll("[data-splitting]").forEach((el) => {
      const orig = origText.get(el);
      if (orig != null) el.textContent = orig;
    });
  }
  function reSplit() {
    if (typeof Splitting !== "function") return;
    Splitting();
    document.querySelectorAll("[data-splitting] .char").forEach((c, i) => {
      c.style.setProperty("--char-index", i);
    });
  }

  async function loadDict(lang) {
    if (dictCache[lang]) return dictCache[lang];
    const res = await fetch(`i18n/${lang}.json`, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Failed to load i18n/${lang}.json`);
    const dict = await res.json();
    dictCache[lang] = dict;
    return dict;
  }

  function applyDict(dict) {
    // Text content: <el data-i18n="key">…</el>
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = dict[key];
      if (typeof val === "string") el.textContent = val;
    });
    // Attribute values: <el data-i18n-attr="placeholder:key,aria-label:key2">
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      const spec = el.getAttribute("data-i18n-attr");
      spec.split(",").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (!attr || !key) return;
        const val = dict[key];
        if (typeof val === "string") el.setAttribute(attr, val);
      });
    });
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  function readSaved() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.indexOf(v) !== -1 ? v : "en";
    } catch (_) { return "en"; }
  }
  function writeSaved(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  }
  function paintActive(lang) {
    current.textContent = LABELS[lang] || lang.toUpperCase();
    // Sync active state across BOTH the desktop dropdown buttons and
    // the in-menu mobile language pills.
    document.querySelectorAll("button[data-lang]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.lang === lang);
    });
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }

  async function setLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = "en";
    paintActive(lang);
    writeSaved(lang);

    // Always flatten the splitting heading structure first so the
    // dictionary write hits whole text nodes, not per-char spans.
    flattenSplitting();

    try {
      const dict = await loadDict(lang);
      applyDict(dict);
    } catch (err) {
      console.warn("[Orobrick i18n]", err);
    }

    // Restore per-char reveal animations only for English.
    if (lang === "en") {
      setTimeout(reSplit, 50);
    }
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!root.classList.contains("is-open"));
  });
  // Document-wide delegation: ANY button[data-lang] (desktop dropdown
  // OR mobile in-menu pill) triggers a language change.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-lang]");
    if (btn) {
      setLanguage(btn.dataset.lang);
      setOpen(false);
      document.getElementById("navLinks")?.classList.remove("is-open");
      return;
    }
    // Close the desktop dropdown if clicking outside it.
    if (!root.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Snapshot the original (English) splitting text before anyone
  // mutates it, then restore the saved language.
  snapshotSplittingText();
  const saved = readSaved();
  paintActive(saved);
  if (saved !== "en") setLanguage(saved);
})();

/* ---------------------------------------------------------
   13. Year
   --------------------------------------------------------- */
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------------------------------------------------
   13. Refresh after fonts/layout settle so the pin's pinSpacing
       is included in Lenis's scroll limit. Without this, anchor
       clicks landing past the stale limit silently fail.
   --------------------------------------------------------- */
function fullRefresh() {
  ScrollTrigger.refresh();
  if (lenis) lenis.resize();
}
if (document.fonts?.ready) {
  document.fonts.ready.then(fullRefresh);
}
window.addEventListener("load", () => setTimeout(fullRefresh, 300));
// Keep Lenis's limit in sync any time ScrollTrigger recalculates.
ScrollTrigger.addEventListener("refresh", () => { if (lenis) lenis.resize(); });
