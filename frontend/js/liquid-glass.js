/* ============================================================================
   SYNAPSE — LIQUID GLASS ENGINE
   ----------------------------------------------------------------------------
   Gives every `.lg` surface its optical sub-layers and drives four custom
   properties from pointer state, on a single shared requestAnimationFrame loop:

     --lg-mx / --lg-my   pointer position inside the element (0 → 1), lagged
     --lg-hover          hover energy   (0 → 1), critically damped
     --lg-press          press energy   (0 → 1), critically damped
     --lg-tilt-x/y       parallax tilt  (-1 → 1), for interactive surfaces

   Design notes
   ------------
   • One rAF loop for the whole page. Elements are only integrated while they
     hold energy, so an idle page costs nothing.
   • Values are smoothed with a frame-rate independent exponential filter, so
     reflections *trail* the cursor the way light does through thick glass.
   • The loop parks itself the moment every surface has settled.
   ========================================================================== */

(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE  = window.matchMedia("(pointer: coarse)").matches;

  /* ── 1 · SVG refraction filter ──────────────────────────────────────────
     Turbulence → displacement. Kept deliberately gentle: the goal is the
     hint of thickness at the rim, not a funhouse mirror.                    */

  var SVG_DEFS =
    '<svg class="lg-defs" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<filter id="lg-refract" x="-20%" y="-20%" width="140%" height="140%" ' +
                'color-interpolation-filters="sRGB">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.0018 0.0042" ' +
                       'numOctaves="2" seed="7" result="warp"/>' +
          '<feGaussianBlur in="warp" stdDeviation="1.4" result="warpSoft"/>' +
          '<feDisplacementMap in="SourceGraphic" in2="warpSoft" scale="9" ' +
                             'xChannelSelector="R" yChannelSelector="G"/>' +
        '</filter>' +

        // A slightly stronger variant for large surfaces (cards, CTA band)
        '<filter id="lg-refract-deep" x="-20%" y="-20%" width="140%" height="140%" ' +
                'color-interpolation-filters="sRGB">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.0012 0.0030" ' +
                       'numOctaves="2" seed="19" result="warp"/>' +
          '<feGaussianBlur in="warp" stdDeviation="2" result="warpSoft"/>' +
          '<feDisplacementMap in="SourceGraphic" in2="warpSoft" scale="14" ' +
                             'xChannelSelector="R" yChannelSelector="G"/>' +
        '</filter>' +
      '</defs>' +
    '</svg>';

  function installDefs() {
    if (document.getElementById("lg-svg-defs")) return;
    var host = document.createElement("div");
    host.id = "lg-svg-defs";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;";
    host.innerHTML = SVG_DEFS;
    document.body.appendChild(host);
  }

  /* Only Chromium currently composites an SVG filter inside backdrop-filter.
     Everywhere else we skip the layer rather than ship a broken effect. */
  function detectRefraction() {
    if (REDUCED || COARSE) return false;
    var ok =
      (window.CSS && CSS.supports && CSS.supports("backdrop-filter", "url(#lg-refract)")) ||
      (window.CSS && CSS.supports && CSS.supports("-webkit-backdrop-filter", "url(#lg-refract)"));
    if (!ok) return false;
    var ua = navigator.userAgent;
    var isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
    var isFirefox = /Firefox/.test(ua);
    return !isSafari && !isFirefox;
  }

  /* ── 2 · Layer injection ────────────────────────────────────────────────
     Every `.lg` gets an overflow-clipped stack it doesn't have to declare.  */

  function buildLayers(el) {
    if (el.querySelector(":scope > .lg-layers")) return;

    var wrap = document.createElement("span");
    wrap.className = "lg-layers";
    wrap.setAttribute("aria-hidden", "true");

    if (el.dataset.lgRefract !== "off") {
      var refract = document.createElement("span");
      refract.className = "lg-refract";
      if (el.dataset.lgRefract === "deep") {
        refract.style.backdropFilter = "url(#lg-refract-deep)";
        refract.style.webkitBackdropFilter = "url(#lg-refract-deep)";
      }
      wrap.appendChild(refract);
    }

    var sheen = document.createElement("span");
    sheen.className = "lg-sheen";
    wrap.appendChild(sheen);

    var glint = document.createElement("span");
    glint.className = "lg-glint";
    wrap.appendChild(glint);

    el.insertBefore(wrap, el.firstChild);
  }

  /* ── 3 · The shared animation loop ──────────────────────────────────────*/

  var tracked = [];      // every registered surface
  var live    = [];      // surfaces still carrying energy this frame
  var running = false;
  var lastT   = 0;

  // Frame-rate independent smoothing: how much of the gap we close per second.
  var RATE = {
    pointer: 9.5,   // reflections lag the cursor noticeably
    hover:   7.0,
    press:   16.0,
    tilt:    8.0
  };
  var EPSILON = 0.0006;

  function approach(current, target, rate, dt) {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
  }

  function State(el, opts) {
    this.el = el;
    this.interactive = !!opts.interactive;
    this.tilt = !!opts.tilt;
    this.mx = 0.5; this.my = 0.5;
    this.tmx = 0.5; this.tmy = 0.5;
    this.hover = 0; this.thover = 0;
    this.press = 0; this.tpress = 0;
    this.tiltX = 0; this.tiltY = 0;
    this.queued = false;
    this.rect = null;
  }

  State.prototype.measure = function () {
    this.rect = this.el.getBoundingClientRect();
  };

  State.prototype.wake = function () {
    if (!this.queued) {
      this.queued = true;
      live.push(this);
    }
    start();
  };

  State.prototype.step = function (dt) {
    this.mx = approach(this.mx, this.tmx, RATE.pointer, dt);
    this.my = approach(this.my, this.tmy, RATE.pointer, dt);
    this.hover = approach(this.hover, this.thover, RATE.hover, dt);
    this.press = approach(this.press, this.tpress, RATE.press, dt);

    var s = this.el.style;
    s.setProperty("--lg-mx", this.mx.toFixed(4));
    s.setProperty("--lg-my", this.my.toFixed(4));
    s.setProperty("--lg-hover", this.hover.toFixed(4));
    s.setProperty("--lg-press", this.press.toFixed(4));

    if (this.tilt) {
      // tilt only expresses itself while the surface is hot
      var tx = (this.mx - 0.5) * 2 * this.hover;
      var ty = (this.my - 0.5) * 2 * this.hover;
      this.tiltX = approach(this.tiltX, tx, RATE.tilt, dt);
      this.tiltY = approach(this.tiltY, ty, RATE.tilt, dt);
      s.setProperty("--lg-tilt-x", this.tiltX.toFixed(4));
      s.setProperty("--lg-tilt-y", this.tiltY.toFixed(4));
    }

    return (
      Math.abs(this.mx - this.tmx) > EPSILON ||
      Math.abs(this.my - this.tmy) > EPSILON ||
      Math.abs(this.hover - this.thover) > EPSILON ||
      Math.abs(this.press - this.tpress) > EPSILON
    );
  };

  function frame(now) {
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
    lastT = now;

    var next = [];
    for (var i = 0; i < live.length; i++) {
      var st = live[i];
      if (st.step(dt)) {
        next.push(st);
      } else {
        st.queued = false;
      }
    }
    live = next;

    if (live.length) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      lastT = 0;
    }
  }

  function start() {
    if (!running) {
      running = true;
      lastT = 0;
      requestAnimationFrame(frame);
    }
  }

  /* ── 4 · Registration ───────────────────────────────────────────────────*/

  var registry = new WeakMap();

  function register(el) {
    if (registry.has(el)) return registry.get(el);

    buildLayers(el);

    var interactive = el.classList.contains("lg-interactive");
    var st = new State(el, {
      interactive: interactive,
      tilt: interactive && el.dataset.lgTilt !== "off" && !COARSE && !REDUCED
    });
    registry.set(el, st);
    tracked.push(st);

    // Pointer position → normalised, lagged reflections
    el.addEventListener("pointermove", function (e) {
      if (!st.rect) st.measure();
      var r = st.rect;
      if (!r || !r.width || !r.height) return;
      st.tmx = clamp01((e.clientX - r.left) / r.width);
      st.tmy = clamp01((e.clientY - r.top) / r.height);
      st.wake();
    }, { passive: true });

    el.addEventListener("pointerenter", function (e) {
      st.measure();
      var r = st.rect;
      if (r && r.width) {
        st.tmx = clamp01((e.clientX - r.left) / r.width);
        st.tmy = clamp01((e.clientY - r.top) / r.height);
      }
      st.thover = 1;
      st.wake();
    }, { passive: true });

    el.addEventListener("pointerleave", function () {
      st.thover = 0;
      st.tpress = 0;
      // reflections drift back to the resting pose rather than snapping
      st.tmx = 0.5;
      st.tmy = 0.5;
      st.wake();
    }, { passive: true });

    el.addEventListener("pointerdown", function () {
      st.tpress = 1;
      st.wake();
    }, { passive: true });

    var release = function () {
      st.tpress = 0;
      st.wake();
    };
    el.addEventListener("pointerup", release, { passive: true });
    el.addEventListener("pointercancel", release, { passive: true });

    // Keyboard parity — focus lights the material the same way hover does
    el.addEventListener("focusin", function () { st.thover = 1; st.wake(); });
    el.addEventListener("focusout", function () { st.thover = 0; st.wake(); });

    return st;
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function invalidateRects() {
    for (var i = 0; i < tracked.length; i++) tracked[i].rect = null;
  }

  /* ── 5 · Ambient drift ──────────────────────────────────────────────────
     Without a pointer the glass would be dead still, which reads as a decal.
     A very slow global drift keeps the highlights breathing.                */

  function ambientDrift() {
    if (REDUCED) return;
    var root = document.documentElement;
    var t0 = performance.now();
    (function tick(now) {
      var t = (now - t0) / 1000;
      root.style.setProperty("--lg-amb-x", (0.5 + Math.sin(t * 0.11) * 0.5).toFixed(4));
      root.style.setProperty("--lg-amb-y", (0.5 + Math.cos(t * 0.083) * 0.5).toFixed(4));
      setTimeout(function () { requestAnimationFrame(tick); }, 66); // ~15Hz is plenty
    })(t0);
  }

  /* ── 6 · Navigation lens ────────────────────────────────────────────────
     A magnifying pill that glides between nav items, the way Apple's nav
     highlight settles under the hovered label.                              */

  function navLens(nav) {
    var list = nav.querySelector(".nav-links-desktop");
    if (!list) return;

    var lens = document.createElement("span");
    lens.className = "nav-lens";
    lens.setAttribute("aria-hidden", "true");
    list.appendChild(lens);

    var links = Array.prototype.slice.call(list.querySelectorAll(".nav-link"));
    if (!links.length) return;

    var cur = { x: 0, w: 0 };
    var tgt = { x: 0, w: 0 };
    var active = false;
    var raf = 0;

    function place(link) {
      var lr = list.getBoundingClientRect();
      var r = link.getBoundingClientRect();
      tgt.x = r.left - lr.left;
      tgt.w = r.width;
      if (!active) { cur.x = tgt.x; cur.w = tgt.w; }
      active = true;
      lens.classList.add("is-active");
      loop();
    }

    function loop() {
      if (raf) return;
      var last = 0;
      raf = requestAnimationFrame(function step(now) {
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
        last = now;
        cur.x = approach(cur.x, tgt.x, 13, dt);
        cur.w = approach(cur.w, tgt.w, 13, dt);
        lens.style.transform =
          "translate3d(" + cur.x.toFixed(2) + "px,0,0) scaleX(" + cur.w.toFixed(2) + ")";
        if (Math.abs(cur.x - tgt.x) > 0.3 || Math.abs(cur.w - tgt.w) > 0.3) {
          raf = requestAnimationFrame(step);
        } else {
          lens.style.transform =
            "translate3d(" + tgt.x.toFixed(2) + "px,0,0) scaleX(" + tgt.w.toFixed(2) + ")";
          raf = 0;
        }
      });
    }

    links.forEach(function (link) {
      link.addEventListener("pointerenter", function () { place(link); });
      link.addEventListener("focus", function () { place(link); });
    });

    list.addEventListener("pointerleave", function () {
      active = false;
      lens.classList.remove("is-active");
    });

    window.addEventListener("resize", function () {
      active = false;
      lens.classList.remove("is-active");
    }, { passive: true });
  }

  /* ── 7 · Boot ───────────────────────────────────────────────────────────*/

  var SELECTOR = ".lg";

  function scan(root) {
    var nodes = (root || document).querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i++) register(nodes[i]);
  }

  function init() {
    installDefs();

    if (detectRefraction()) {
      document.documentElement.classList.add("lg-has-refraction");
    }

    scan(document);
    ambientDrift();

    var nav = document.getElementById("navbar");
    if (nav && !COARSE) navLens(nav);

    // Late-arriving glass (modals, injected cards) is picked up automatically.
    if (window.MutationObserver) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches(SELECTOR)) register(n);
            if (n.querySelectorAll) scan(n);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("resize", invalidateRects, { passive: true });
    window.addEventListener("scroll", invalidateRects, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Small public surface for other scripts
  window.LiquidGlass = {
    register: register,
    scan: scan,
    refresh: invalidateRects
  };
})();
