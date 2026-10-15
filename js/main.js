(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* Mobile navigation                                                   */
  /* ------------------------------------------------------------------ */

  const navToggle = document.getElementById("navToggle");
  const navMobile = document.getElementById("navMobile");

  function closeMobileNav() {
    navMobile.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "فتح القائمة");
  }

  function openMobileNav() {
    navMobile.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "إغلاق القائمة");
  }

  if (navToggle && navMobile) {
    navToggle.addEventListener("click", () => {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      isOpen ? closeMobileNav() : openMobileNav();
    });

    navMobile.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMobileNav);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && navMobile.classList.contains("is-open")) {
        closeMobileNav();
        navToggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Reveal on scroll                                                    */
  /* ------------------------------------------------------------------ */

  const revealTargets = document.querySelectorAll(".reveal, .reveal-children");

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  /* ------------------------------------------------------------------ */
  /* Rotating video billboard — shared engine for the hero and the       */
  /* contact section (same playlist, independent playback state)         */
  /* ------------------------------------------------------------------ */

  const PLAYLIST = [
    { src: "videos/optimized/real-estate.mp4", label: "تغطية عقارية" },
    { src: "videos/optimized/dar-al-sana.mp4", label: "دار السنا" },
    { src: "videos/optimized/venue.mp4", label: "المكان" },
  ];

  const PREP_LEAD = 6; // seconds remaining — start buffering the next video
  const TRANSITION_LEAD = 1.2; // seconds remaining — start the crossfade
  const TRANSITION_MS = 1200; // must match the video opacity transition

  function urlFor(relativePath) {
    return encodeURI(relativePath);
  }

  function createVideoBillboard({ videoA, videoB, playlist, onProgress }) {
    const videoSlots = [videoA, videoB];
    let activeSlot = 0;
    let currentIndex = 0;
    let prepped = false;
    let transitioning = false;
    let playedThisLoop = new Set();
    let rafId = null;
    let started = false;

    function report() {
      if (!onProgress) return;
      const active = videoSlots[activeSlot];
      const fraction = active.duration ? active.currentTime / active.duration : 0;
      onProgress(currentIndex, fraction, playedThisLoop);
    }

    function playVideo(el) {
      el.play().catch(() => {
        /* autoplay blocked — billboard stays on current frame until a user gesture */
      });
    }

    function startAt(index, { instant } = {}) {
      const nextSlot = 1 - activeSlot;
      const nextVideo = videoSlots[nextSlot];
      const prevVideo = videoSlots[activeSlot];

      nextVideo.src = urlFor(playlist[index].src);
      nextVideo.currentTime = 0;
      nextVideo.load();

      const reveal = () => {
        playVideo(nextVideo);
        nextVideo.classList.add("is-active");
        prevVideo.classList.remove("is-active");
        playedThisLoop.add(currentIndex);
        if (index === 0) playedThisLoop = new Set();
        activeSlot = nextSlot;
        currentIndex = index;
        prepped = false;
        transitioning = false;
        setTimeout(() => {
          prevVideo.pause();
          prevVideo.currentTime = 0;
        }, TRANSITION_MS);
      };

      if (instant) {
        reveal();
        return;
      }

      transitioning = true;
      if (nextVideo.readyState >= 2) {
        reveal();
      } else {
        const onReady = () => {
          nextVideo.removeEventListener("loadeddata", onReady);
          reveal();
        };
        nextVideo.addEventListener("loadeddata", onReady);
      }
    }

    function prepareNext() {
      const nextIndex = (currentIndex + 1) % playlist.length;
      const nextVideo = videoSlots[1 - activeSlot];
      nextVideo.src = urlFor(playlist[nextIndex].src);
      nextVideo.load();
    }

    function tryAdvance() {
      if (transitioning) return;
      const nextIndex = (currentIndex + 1) % playlist.length;
      const nextVideo = videoSlots[1 - activeSlot];
      if (nextVideo.readyState >= 3) {
        startAt(nextIndex);
      }
      /* else: not buffered yet — the active video's 'ended' handler keeps
         looping it in place so the billboard never shows a blank frame. */
    }

    function tick() {
      if (!transitioning) {
        const active = videoSlots[activeSlot];
        if (active.duration && !Number.isNaN(active.duration)) {
          const remaining = active.duration - active.currentTime;
          report();

          if (!prepped && remaining <= PREP_LEAD) {
            prepareNext();
            prepped = true;
          }
          if (remaining <= TRANSITION_LEAD) {
            tryAdvance();
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    videoSlots.forEach((video, slot) => {
      video.addEventListener("ended", () => {
        if (slot === activeSlot && !transitioning) {
          // next video wasn't ready in time — loop current rather than go blank
          video.currentTime = 0;
          playVideo(video);
        }
      });
      video.addEventListener("error", () => {
        if (slot === activeSlot && !transitioning) {
          startAt((currentIndex + 1) % playlist.length, { instant: true });
        }
      });
    });

    function start() {
      if (started) return;
      started = true;

      if (prefersReducedMotion) {
        // Show the first video as a single static-feeling frame; no auto-rotation.
        const first = videoSlots[0];
        first.src = urlFor(playlist[0].src);
        first.addEventListener(
          "loadeddata",
          () => {
            playVideo(first);
            setTimeout(() => first.pause(), 50);
          },
          { once: true }
        );
        first.classList.add("is-active");
        report();
      } else {
        videoSlots[0].src = urlFor(playlist[0].src);
        videoSlots[0].classList.add("is-active");
        playVideo(videoSlots[0]);
        rafId = requestAnimationFrame(tick);
      }
    }

    function pause() {
      videoSlots[activeSlot].pause();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function resume() {
      if (!started || prefersReducedMotion) return;
      playVideo(videoSlots[activeSlot]);
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function jumpTo(index) {
      if (!started || index === currentIndex || transitioning) return;
      startAt(index);
    }

    return { start, pause, resume, jumpTo };
  }

  /* ---- Hero instance: always on, with the campaign-style indicator ---- */

  const heroVideoA = document.getElementById("heroVideoA");
  const heroVideoB = document.getElementById("heroVideoB");
  const seqButtons = Array.from(document.querySelectorAll(".hero__seq-btn"));

  if (heroVideoA && heroVideoB && PLAYLIST.length) {
    function updateIndicator(active, fraction, playedThisLoop) {
      seqButtons.forEach((btn, i) => {
        const fill = btn.querySelector(".hero__seq-fill");
        btn.classList.remove("is-active", "is-done");
        if (i === active) {
          btn.classList.add("is-active");
          if (fill) fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
        } else if (playedThisLoop.has(i)) {
          btn.classList.add("is-done");
          if (fill) fill.style.width = "";
        } else if (fill) {
          fill.style.width = "0%";
        }
      });
    }

    const heroBillboard = createVideoBillboard({
      videoA: heroVideoA,
      videoB: heroVideoB,
      playlist: PLAYLIST,
      onProgress: updateIndicator,
    });

    seqButtons.forEach((btn) => {
      btn.addEventListener("click", () => heroBillboard.jumpTo(Number(btn.dataset.index)));
    });

    heroBillboard.start();
  }

  /* ---- Contact instance: lazy — only plays while in view ---- */

  const contactSection = document.getElementById("contact");
  const contactVideoA = document.getElementById("contactVideoA");
  const contactVideoB = document.getElementById("contactVideoB");

  if (contactSection && contactVideoA && contactVideoB && PLAYLIST.length) {
    const contactBillboard = createVideoBillboard({
      videoA: contactVideoA,
      videoB: contactVideoB,
      playlist: PLAYLIST,
    });

    let contactStarted = false;

    if ("IntersectionObserver" in window) {
      const contactObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              if (!contactStarted) {
                contactStarted = true;
                contactBillboard.start();
              } else {
                contactBillboard.resume();
              }
            } else {
              contactBillboard.pause();
            }
          });
        },
        { threshold: 0.3 }
      );
      contactObserver.observe(contactSection);
    } else {
      contactBillboard.start();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lightbox — أعمالنا gallery                                          */
  /* ------------------------------------------------------------------ */

  const workItems = Array.from(document.querySelectorAll(".work-item"));
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxCaption = document.getElementById("lightboxCaption");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxPrev = document.getElementById("lightboxPrev");
  const lightboxNext = document.getElementById("lightboxNext");

  if (workItems.length && lightbox) {
    let currentItem = 0;
    let lastFocused = null;

    function renderItem(index) {
      const item = workItems[index];
      const img = item.querySelector("img");
      lightboxImg.src = item.dataset.full;
      lightboxImg.alt = img ? img.alt : "";
      lightboxCaption.innerHTML = `<strong>${item.dataset.tag}</strong> — ${item.dataset.label}`;
      currentItem = index;
    }

    function openLightbox(index) {
      lastFocused = document.activeElement;
      renderItem(index);
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
      lightboxClose.focus();
    }

    function closeLightbox() {
      lightbox.hidden = true;
      document.body.style.overflow = "";
      lightboxImg.src = "";
      if (lastFocused) lastFocused.focus();
    }

    function showNext() {
      renderItem((currentItem + 1) % workItems.length);
    }

    function showPrev() {
      renderItem((currentItem - 1 + workItems.length) % workItems.length);
    }

    workItems.forEach((item, index) => {
      item.addEventListener("click", () => openLightbox(index));
    });

    lightboxClose.addEventListener("click", closeLightbox);
    lightboxNext.addEventListener("click", showNext);
    lightboxPrev.addEventListener("click", showPrev);

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (e) => {
      if (lightbox.hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") showNext();
      if (e.key === "ArrowLeft") showPrev();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Footer year                                                         */
  /* ------------------------------------------------------------------ */

  const footerYear = document.getElementById("footerYear");
  if (footerYear) {
    const span = document.createElement("span");
    span.dir = "ltr";
    span.textContent = `© ${new Date().getFullYear()} 3 Lenses Studios`;
    footerYear.replaceChildren(span);
  }
})();
