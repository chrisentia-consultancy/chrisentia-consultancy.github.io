/* ==========================================================================
   Chrisentia Consultancy — site behaviour
   Single source of truth. Previously duplicated inline in all three pages.

   The nav and footer are now baked into the HTML at build time, so there is
   no fetch() here any more and nothing waits on the network before wiring up.
   ========================================================================== */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  /* --- Mobile menu ------------------------------------------------------ */

  function initMobileMenu() {
    var hamburger = document.getElementById('hamburger');
    var mobileMenu = document.getElementById('mobileMenu');
    if (!hamburger || !mobileMenu) return;

    function setOpen(open) {
      hamburger.classList.toggle('open', open);
      mobileMenu.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
    }

    hamburger.addEventListener('click', function () {
      setOpen(!mobileMenu.classList.contains('open'));
    });

    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setOpen(false);
      });
    });

    // Close on Escape so keyboard users are not trapped.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        setOpen(false);
        hamburger.focus();
      }
    });
  }

  /* --- Scroll reveal ---------------------------------------------------- */

  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    // No IntersectionObserver, or motion is turned off: show everything.
    if (!('IntersectionObserver' in window) || prefersReducedMotion) {
      items.forEach(function (el) { el.classList.add('active'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    items.forEach(function (el) { observer.observe(el); });
  }

  /* --- Animated counters ------------------------------------------------ */

  function animateCounter(el, target, duration) {
    if (prefersReducedMotion) {
      el.textContent = String(target);
      return;
    }

    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      el.textContent = String(Math.floor(progress * target));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        el.textContent = String(target);
      }
    }

    window.requestAnimationFrame(step);
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-target]');
    if (!counters.length) return;

    if (!('IntersectionObserver' in window)) {
      counters.forEach(function (el) {
        el.textContent = el.getAttribute('data-target');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var target = parseInt(entry.target.getAttribute('data-target'), 10);
          if (!isNaN(target)) animateCounter(entry.target, target, 900);
          // Run once, not on every scroll past.
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(function (el) { observer.observe(el); });
  }

  /* --- Boot ------------------------------------------------------------- */

  function init() {
    initMobileMenu();
    initReveal();
    initCounters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
