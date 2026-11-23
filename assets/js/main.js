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

          var el = entry.target;
          var target = parseInt(el.getAttribute('data-target'), 10);

          // A stat column staggers its own entry, so the three in a band
          // arrive one after another rather than all at once.
          var stat = el.closest ? el.closest('.stat') : null;
          var delay = stat ? parseInt(stat.getAttribute('data-delay'), 10) || 0 : 0;

          window.setTimeout(function () {
            if (stat) stat.classList.add('is-in');
            if (!isNaN(target)) animateCounter(el, target, 900 + delay);
          }, delay);

          observer.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(function (el) { observer.observe(el); });
  }

  /* --- Project image carousels ------------------------------------------ */

  /* Only runs where a project folder held more than one image. Rotates on a
     timer, pauses on hover or keyboard focus, and stops entirely if the
     visitor has reduced motion turned on — they can still use the dots. */

  function initCarousels() {
    document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
      var slides = carousel.querySelectorAll('img');
      var dots = carousel.querySelectorAll('.project-media__dot');
      if (slides.length < 2) return;

      var current = 0;
      var timer = null;

      function show(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach(function (slide, i) {
          slide.classList.toggle('is-active', i === current);
        });
        dots.forEach(function (dot, i) {
          dot.classList.toggle('is-active', i === current);
        });
      }

      function start() {
        if (prefersReducedMotion || timer) return;
        timer = window.setInterval(function () { show(current + 1); }, 4000);
      }

      function stop() {
        window.clearInterval(timer);
        timer = null;
      }

      dots.forEach(function (dot, i) {
        dot.addEventListener('click', function () {
          stop();
          show(i);
          start();
        });
      });

      carousel.addEventListener('mouseenter', stop);
      carousel.addEventListener('mouseleave', start);
      carousel.addEventListener('focusin', stop);
      carousel.addEventListener('focusout', start);

      // Don't animate offscreen — saves work on a long projects page.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) start();
            else stop();
          });
        }, { threshold: 0.2 }).observe(carousel);
      } else {
        start();
      }
    });
  }

  /* --- Client rail ------------------------------------------------------ */

  /* Arrow buttons scroll by roughly one card. Disabled at each end so the
     controls reflect where you actually are. */

  function initRails() {
    document.querySelectorAll('[data-rail]').forEach(function (rail) {
      var section = rail.closest('section') || document;
      var prev = section.querySelector('[data-rail-prev]');
      var next = section.querySelector('[data-rail-next]');
      if (!prev || !next) return;

      function step() {
        var card = rail.firstElementChild;
        return card ? card.getBoundingClientRect().width + 20 : 300;
      }

      function sync() {
        var max = rail.scrollWidth - rail.clientWidth - 2;
        prev.disabled = rail.scrollLeft <= 2;
        next.disabled = rail.scrollLeft >= max;
      }

      prev.addEventListener('click', function () {
        rail.scrollBy({ left: -step(), behavior: 'smooth' });
      });
      next.addEventListener('click', function () {
        rail.scrollBy({ left: step(), behavior: 'smooth' });
      });

      rail.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    });
  }

  /* --- Enquiry form ----------------------------------------------------- */

  /* Submits to Formspree over fetch so the visitor stays on the page instead
     of being bounced to a Formspree thank-you screen. If fetch fails for any
     reason the form still works — we fall back to a normal submit. */

  function initEnquiryForm() {
    var form = document.getElementById('enquiryForm');
    if (!form) return;

    var status = document.getElementById('formStatus');
    var button = form.querySelector('button[type="submit"]');
    var originalLabel = button ? button.textContent : '';

    function setStatus(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className =
        'text-sm font-semibold ' +
        (kind === 'error' ? 'text-red-600' : 'text-green-700');
    }

    form.addEventListener('submit', function (e) {
      if (!window.fetch || !window.FormData) return; // let the browser do it

      e.preventDefault();
      setStatus('', null);

      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (response.ok) {
            form.reset();
            setStatus(
              'Thanks — your enquiry is in. We usually reply within one working day.',
              'ok'
            );
          } else {
            return response.json().then(function (data) {
              var detail =
                data && data.errors
                  ? data.errors.map(function (x) { return x.message; }).join(', ')
                  : 'Something went wrong.';
              throw new Error(detail);
            });
          }
        })
        .catch(function (err) {
          setStatus(
            (err.message || 'Something went wrong.') +
              ' You can also email us directly.',
            'error'
          );
        })
        .finally(function () {
          if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
          }
        });
    });
  }

  /* --- Boot ------------------------------------------------------------- */

  function init() {
    initMobileMenu();
    initReveal();
    initCounters();
    initCarousels();
    initRails();
    initEnquiryForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
