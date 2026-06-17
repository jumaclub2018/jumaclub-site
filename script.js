'use strict';

// ── Ленивая загрузка Яндекс-карт ─────────────────────────────────────────────
// Карты загружаются только когда блок контактов появляется в зоне видимости
(function () {
  const maps = document.querySelectorAll('.map-iframe[data-src]');
  if (!maps.length) return;

  const load = (iframe) => {
    iframe.src = iframe.dataset.src;
    iframe.removeAttribute('data-src');
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          load(e.target);
          observer.unobserve(e.target);
        }
      });
    }, { rootMargin: '200px' });
    maps.forEach(m => observer.observe(m));
  } else {
    // Fallback для старых браузеров — грузим сразу
    maps.forEach(load);
  }
})();

// ── Nav scroll state ──────────────────────────────────────────────────────────
const nav = document.querySelector('.site-nav');
const scrollTopBtn = document.querySelector('.scroll-top');

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  nav?.classList.toggle('scrolled', y > 10);
  scrollTopBtn?.classList.toggle('visible', y > 400);
}, { passive: true });

scrollTopBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ── Mobile menu ───────────────────────────────────────────────────────────────
const burger = document.querySelector('.nav-burger');
const mobileMenu = document.querySelector('.mobile-menu');

burger?.addEventListener('click', () => {
  mobileMenu?.classList.toggle('open');
  burger.setAttribute('aria-expanded', mobileMenu?.classList.contains('open'));
});

mobileMenu?.querySelectorAll('a').forEach(link =>
  link.addEventListener('click', () => mobileMenu.classList.remove('open'))
);

// ── FAQ accordion ─────────────────────────────────────────────────────────────
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-a');
    const isOpen = btn.classList.contains('open');

    document.querySelectorAll('.faq-q.open').forEach(openBtn => {
      openBtn.classList.remove('open');
      openBtn.closest('.faq-item').querySelector('.faq-a').classList.remove('open');
    });

    if (!isOpen) {
      btn.classList.add('open');
      answer.classList.add('open');
    }
  });
});

// ── Form submission ───────────────────────────────────────────────────────────
async function submitForm(form) {
  const nameInput  = form.querySelector('[name="name"]');
  const phoneInput = form.querySelector('[name="phone"]');
  const submitBtn  = form.querySelector('.form-submit');
  const messageEl  = form.querySelector('.form-message');

  const name  = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name)  { nameInput.focus();  return; }
  if (!phone) { phoneInput.focus(); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправляем...';
  if (messageEl) messageEl.className = 'form-message';

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, source: 'landing' }),
    });

    if (res.ok) {
      if (messageEl) {
        messageEl.textContent = 'Заявка принята! Мы перезвоним вам в ближайшее время.';
        messageEl.className = 'form-message success show';
      }
      form.reset();
      if (typeof ym     !== 'undefined') ym(window._ymId, 'reachGoal', 'lead_submitted');
      if (typeof gtag   !== 'undefined') gtag('event', 'generate_lead');
    } else {
      throw new Error('server_error');
    }
  } catch {
    if (messageEl) {
      messageEl.textContent = 'Что-то пошло не так. Позвоните нам: +7 901 783-11-73';
      messageEl.className = 'form-message error show';
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Записаться';
  }
}

document.querySelectorAll('.signup-form').forEach(form => {
  form.addEventListener('submit', e => { e.preventDefault(); submitForm(form); });
});

// ── Animations (GSAP + ScrollTrigger + Lenis) ─────────────────────────────────
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReduced && typeof gsap !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);

  // Lenis smooth scroll — только для не-touch устройств
  const isTouch = navigator.maxTouchPoints > 0;
  if (!isTouch && typeof Lenis !== 'undefined') {
    const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // ── 1. Hero — появление элементов по очереди ────────────────────────────────
  gsap.timeline({ defaults: { ease: 'power2.out' } })
    .from('.hero-locations',  { opacity: 0, y: 14, duration: 0.45 }, 0.05)
    .from('.hero h1',         { opacity: 0, y: 28, duration: 0.55 }, 0.18)
    .from('.hero-sub',        { opacity: 0, y: 18, duration: 0.5  }, 0.32)
    .from('.age-tag',         { opacity: 0, y: 14, stagger: 0.07, duration: 0.4 }, 0.42)
    .from('.hero-hook',       { opacity: 0, y: 14, duration: 0.4  }, 0.62)
    .from('.hero-btns .btn',  { opacity: 0, y: 14, stagger: 0.08, duration: 0.4 }, 0.7)
    .from('.hero-photo-wrap', { opacity: 0, x: 28, duration: 0.6  }, 0.2);

  // ── 2. Параллакс фото на первом экране ──────────────────────────────────────
  gsap.to('.hero-photo-wrap', {
    yPercent: -10,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });

  // ── 3. Заголовки секций ──────────────────────────────────────────────────────
  document.querySelectorAll('section').forEach(section => {
    const label    = section.querySelector('.section-label');
    const heading  = section.querySelector('h2');
    const subtitle = section.querySelector('.section-subtitle');
    const targets  = [label, heading, subtitle].filter(Boolean);
    if (!targets.length) return;

    gsap.from(targets, {
      opacity: 0, y: 22,
      duration: 0.55,
      ease: 'power2.out',
      stagger: 0.1,
      scrollTrigger: { trigger: targets[0], start: 'top 88%', once: true },
    });
  });

  // ── 4. Карточки — появление со сдвигом ──────────────────────────────────────
  [
    { sel: '.coaches-grid .coach-card',         parent: '.coaches-grid' },
    { sel: '.benefits-grid .benefit-card',      parent: '.benefits-grid' },
    { sel: '.pricing-grid .price-card',         parent: '.pricing-grid' },
    { sel: '.reviews-grid .review-card',        parent: '.reviews-grid' },
    { sel: '.schedule-groups .group-card',      parent: '.schedule-groups' },
    { sel: '.contacts-grid .contact-card',      parent: '.contacts-grid' },
    { sel: '.gallery-grid .gallery-img',        parent: '.gallery-grid' },
  ].forEach(({ sel, parent }) => {
    const els = gsap.utils.toArray(sel);
    if (!els.length) return;
    gsap.from(els, {
      opacity: 0, y: 36,
      duration: 0.55,
      ease: 'power2.out',
      stagger: 0.09,
      scrollTrigger: {
        trigger: document.querySelector(parent) || els[0],
        start: 'top 83%',
        once: true,
      },
    });
  });

  // ── 5. Фото-полоса в «Что получит ребёнок» ──────────────────────────────────
  gsap.from('.benefits-photos img', {
    opacity: 0, y: 28, scale: 0.96,
    duration: 0.55,
    ease: 'power2.out',
    stagger: 0.1,
    scrollTrigger: { trigger: '.benefits-photos', start: 'top 83%', once: true },
  });

  // ── 6. Блок статистики — карточки + счётчик чисел ───────────────────────────
  gsap.from('.stat-item', {
    opacity: 0, y: 28,
    duration: 0.5,
    ease: 'power2.out',
    stagger: 0.08,
    scrollTrigger: { trigger: '.stats-grid', start: 'top 82%', once: true },
  });

  document.querySelectorAll('.stat-num').forEach(el => {
    const raw      = el.textContent.trim();           // "100+", "4,5", "5" …
    const isFloat  = raw.includes(',');
    const numStr   = raw.replace(/[^\d,]/g, '').replace(',', '.');
    const num      = parseFloat(numStr);
    const suffix   = raw.replace(/[\d,\.]/g, '');     // "+", "" …
    if (isNaN(num)) return;

    const startVal = isFloat ? num - 0.5 : 0;         // для рейтинга — от 4,0 до 4,5
    const counter  = { val: startVal };

    el.textContent = isFloat
      ? startVal.toFixed(1).replace('.', ',') + suffix
      : '0' + suffix;

    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter() {
        gsap.to(counter, {
          val: num,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate() {
            el.textContent = isFloat
              ? counter.val.toFixed(1).replace('.', ',') + suffix
              : Math.round(counter.val) + suffix;
          },
        });
      },
    });
  });

  // ── 7. Кнопки форм — micro-bounce при появлении ──────────────────────────────
  gsap.from('.final-cta .btn', {
    opacity: 0, y: 20, scale: 0.97,
    duration: 0.5,
    ease: 'back.out(1.4)',
    scrollTrigger: { trigger: '.final-cta', start: 'top 80%', once: true },
  });
}
