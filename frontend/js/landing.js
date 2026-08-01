// ============================================
// Synapse AI — Landing Page Logic (ported design)
// ============================================

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
        if (typeof auth !== 'undefined' && auth && auth.currentUser) {
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
      if (typeof auth !== 'undefined' && auth && auth.currentUser) {
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
      if (typeof auth !== 'undefined' && auth && auth.currentUser) {
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
        if (typeof auth !== 'undefined' && auth && auth.currentUser) {
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
      if (typeof auth !== 'undefined' && auth && auth.currentUser) {
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
  // Guarded: without IntersectionObserver (very old browsers / embedded
  // webviews) a ReferenceError here would abort the rest of this handler.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('active'));
  }
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
  if (!('IntersectionObserver' in window)) return;
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

// ── Liquid Glass · Mouse-driven reflections & studio lighting ──
// Smoothly (spring-delayed) moves the studio key light and the specular
// highlight across every glass surface, so the material reacts to the
// background and pointer like real optical crystal. GPU-friendly, 60fps.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const root = document.documentElement;

  // Global smoothed pointer (0..1) for the studio key light
  let tx = 0.5, ty = 0.32;   // target
  let cx = 0.5, cy = 0.32;   // current (eased)

  // Glass surfaces that get an individual moving specular highlight
  const glassEls = Array.from(
    document.querySelectorAll('.glass, .feature-card, .model-card, .navbar, .stats-ribbon, .cta-band')
  );

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth;
    ty = e.clientY / window.innerHeight;
  }, { passive: true });

  let raf = null;
  function tick() {
    // Ease toward target — the "slightly delayed" spring feel
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;

    root.style.setProperty('--px', (cx * 100).toFixed(2) + '%');
    root.style.setProperty('--py', (cy * 100).toFixed(2) + '%');

    // Per-element specular highlight — light appears to come from the pointer
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const lightX = cx * vw;
    const lightY = cy * vh;
    for (let i = 0; i < glassEls.length; i++) {
      const el = glassEls[i];
      const r = el.__rect || (el.__rect = el.getBoundingClientRect());
      const lx = ((lightX - r.left) / r.width) * 100;
      const ly = ((lightY - r.top) / r.height) * 100;
      el.style.setProperty('--lx', Math.max(-20, Math.min(120, lx)).toFixed(1) + '%');
      el.style.setProperty('--ly', Math.max(-40, Math.min(120, ly)).toFixed(1) + '%');
    }

    raf = requestAnimationFrame(tick);
  }

  // Recompute cached rects on scroll / resize (throttled)
  let geoTick = false;
  function invalidateGeo() {
    if (geoTick) return;
    geoTick = true;
    requestAnimationFrame(() => {
      glassEls.forEach((el) => { el.__rect = el.getBoundingClientRect(); });
      geoTick = false;
    });
  }
  window.addEventListener('scroll', invalidateGeo, { passive: true });
  window.addEventListener('resize', invalidateGeo, { passive: true });

  raf = requestAnimationFrame(tick);
})();

// ── Subtle parallax lift on cards (pointer-follow tilt, very restrained) ──
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  document.querySelectorAll('.feature-card, .model-card').forEach((card) => {
    let rafId = null;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;   // -0.5..0.5
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        card.style.transform =
          `translateY(-8px) rotateX(${(-dy * 3).toFixed(2)}deg) rotateY(${(dx * 3).toFixed(2)}deg)`;
        rafId = null;
      });
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
})();

// ── WebGL Shader Background ──
(function() {
  const canvas = document.getElementById('webgl-bg');
  if (!canvas || !window.THREE) return;

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

  const uniforms = {
    resolution: { value: [window.innerWidth, window.innerHeight] },
    time: { value: 0.0 },
    xScale: { value: 1.0 },
    yScale: { value: 0.5 },
    distortion: { value: 0.05 },
  };

  const vertexShader = `
    attribute vec3 position;
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    uniform float xScale;
    uniform float yScale;
    uniform float distortion;

    void main() {
      vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
      
      float d = length(p) * distortion;
      
      float rx = p.x * (1.0 + d);
      float gx = p.x;
      float bx = p.x * (1.0 - d);

      float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
      float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
      float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `;

  const position = new Float32Array([
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
    -1.0,  1.0, 0.0,
     1.0, -1.0, 0.0,
    -1.0,  1.0, 0.0,
     1.0,  1.0, 0.0,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));

  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: uniforms,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    uniforms.resolution.value = [width, height];
  }

  function animate() {
    uniforms.time.value += 0.01;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", handleResize);
  handleResize();
  animate();
})();

console.log('Synapse AI Landing — Liquid Glass loaded.');
