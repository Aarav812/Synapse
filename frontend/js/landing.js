// ============================================
// Synapse AI — Landing Page Logic (ported design)
// ============================================

// ── Apple Liquid Glass: Interactive Light Reflections ──
(function initLiquidGlass() {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isMobile || reducedMotion) return;

  // Track mouse globally for glass surfaces
  document.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    const y = e.clientY;
    document.querySelectorAll('.glass, .glass-card, .feature-card, .model-card, .navbar').forEach(el => {
      const rect = el.getBoundingClientRect();
      const relX = ((x - rect.left) / rect.width) * 100;
      const relY = ((y - rect.top) / rect.height) * 100;
      el.style.setProperty('--mouse-x', relX + '%');
      el.style.setProperty('--mouse-y', relY + '%');
    });
  }, { passive: true });

  // Add .glass-light divs to all glass surfaces for dynamic reflections
  function addLightDivs() {
    document.querySelectorAll('.glass, .glass-card, .feature-card, .model-card').forEach(el => {
      if (!el.querySelector('.glass-light')) {
        const light = document.createElement('div');
        light.className = 'glass-light';
        light.setAttribute('aria-hidden', 'true');
        el.appendChild(light);
      }
    });
  }
  addLightDivs();
  const observer = new MutationObserver(addLightDivs);
  observer.observe(document.body, { childList: true, subtree: true });
})();

// ── Page Transition Helper ──
function landingNavigateTo(url) {
  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.classList.add('active');
    setTimeout(() => { window.location.href = url; }, 300);
  } else {
    window.location.href = url;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Wire up internal nav links (anchor links pass through; absolute links transition)
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '/login.html') {
        e.preventDefault();
        if (typeof auth !== 'undefined' && auth.currentUser) {
          landingNavigateTo('/chat.html');
        } else {
          openAuthModal();
        }
        return;
      }
      if (href && !href.startsWith('#')) {
        e.preventDefault();
        landingNavigateTo(href);
      }
    });
  });

  const heroStartBtn = document.getElementById('hero-start-btn');
  if (heroStartBtn) {
    heroStartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof auth !== 'undefined' && auth.currentUser) {
        landingNavigateTo('/chat.html');
      } else {
        openAuthModal();
      }
    });
  }

  const footerStartBtn = document.getElementById('footer-start-btn');
  if (footerStartBtn) {
    footerStartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof auth !== 'undefined' && auth.currentUser) {
        landingNavigateTo('/chat.html');
      } else {
        openAuthModal();
      }
    });
  }

  // "Launch Aura" buttons (nav, footer, mobile menu) open the auth modal
  // when logged out, or go straight to chat when signed in.
  ['nav-launch-btn', 'footer-launch-btn', 'mobile-launch-btn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof auth !== 'undefined' && auth.currentUser) {
          landingNavigateTo('/chat.html');
        } else {
          openAuthModal();
        }
      });
    }
  });

  // Model cards → launch chat preselected to that model
  document.querySelectorAll('.model-card[data-model]').forEach((card) => {
    const launchModel = (e) => {
      e.preventDefault();
      if (typeof auth !== 'undefined' && auth.currentUser) {
        localStorage.setItem('selected_model', card.getAttribute('data-model'));
        localStorage.setItem('selected_model_name', card.getAttribute('data-name'));
        landingNavigateTo('/chat.html');
      } else {
        openAuthModal();
      }
    };
    card.addEventListener('click', launchModel);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') launchModel(e);
    });
  });

  // Fade in on load
  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.style.opacity = '1';
    overlay.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.35s ease';
        overlay.style.opacity = '0';
      });
    });
  }

  // ── Auth Modal Logic ──
  const authModal = document.getElementById('auth-modal');
  const authModalContent = document.getElementById('auth-modal-content');
  const closeAuthModalBtn = document.getElementById('close-auth-modal');

  window.openAuthModal = function() {
    if (!authModal) return;
    authModal.style.display = 'flex';
    requestAnimationFrame(() => {
      authModal.style.opacity = '1';
      authModalContent.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      const emailEl = document.getElementById('email');
      if (emailEl) emailEl.focus();
    }, 300);
  };

  window.closeAuthModal = function() {
    if (!authModal) return;
    authModal.style.opacity = '0';
    authModalContent.style.transform = 'scale(0.95)';
    setTimeout(() => {
      authModal.style.display = 'none';
    }, 300);
  };

  if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener('click', window.closeAuthModal);
  }
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) window.closeAuthModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authModal && authModal.style.display !== 'none') {
      window.closeAuthModal();
    }
  });

  // ── Scroll Reveal Animations ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

// ── Mobile Hamburger Menu ──
(function() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const overlay = document.getElementById('mobile-nav-overlay');
  const closeBtn = document.getElementById('mobile-nav-close');
  if (!menuBtn || !overlay) return;

  menuBtn.addEventListener('click', () => {
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
  });

  function closeMenu() {
    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  overlay.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeMenu();
  });
})();

// ── Navbar Scroll Glow ──
(function() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 24) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

// ── Stats Count-up Animation ──
(function() {
  const statItems = document.querySelectorAll('.stat-number');
  if (!statItems.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const duration = 1400;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function animateCounter(el, target) {
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      el.textContent = Math.round(easeOut(progress) * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const el = entry.target;
      const text = el.textContent.trim();
      if (text === '∞') return;
      if (text === '<1s') return;
      const num = parseInt(text, 10);
      if (!isNaN(num)) animateCounter(el, num);
    });
  }, { threshold: 0.5 });

  statItems.forEach(el => observer.observe(el));
})();

// ── CTA Button Ripple (subtle press feedback) ──
(function() {
  document.querySelectorAll('.btn-primary').forEach(btn => {
    btn.addEventListener('click', function() {
      this.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1.03)' }],
        { duration: 220, easing: 'ease-out' }
      );
    });
  });
})();

console.log('Synapse AI Landing — ported design loaded.');
