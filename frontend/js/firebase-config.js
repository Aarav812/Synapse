// ============================================
// Synapse AI — Firebase Configuration
// ============================================
// IMPORTANT: Replace the values below with your actual Firebase config
// from Firebase Console → Project Settings → General → Your apps

// ── DEV: disable auth for local testing ──────────────────────────────────────
// Auto-detected by hostname: the bypass is ON only when the page is served from
// localhost / 127.0.0.1 / [::1], and OFF everywhere else — so a real deployment
// re-enables auth with no manual step to forget. When on, auth.js skips the
// signed-out redirect and chat.js sends /api/chat requests without a Firebase
// ID token. Pair with `DISABLE_AUTH=true` in backend/.env for local dev (the
// backend refuses this bypass when NODE_ENV=production).
window.DEV_DISABLE_AUTH = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// ─────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyB3O9ufoR8-R0OAtPFgoR3SU4vRrYiWtrI",
  authDomain: "synapse-113bb.firebaseapp.com",
  projectId: "synapse-113bb",
  storageBucket: "synapse-113bb.firebasestorage.app",
  messagingSenderId: "740564023687",
  appId: "1:740564023687:web:59cd1d00564c76c42e7b22",
  measurementId: "G-81ZNBSKTEP"
};

// Initialize Firebase.
// `auth` is declared with `var` and initialised to null BEFORE the try block so
// the binding always exists for later scripts, even if the Firebase SDK (loaded
// from www.gstatic.com) fails to arrive — e.g. offline development, a blocked
// network, a strict CSP, or an ad/DNS blocker. Previously this threw a bare
// ReferenceError here, which left `auth` undefined and made every later script
// (auth.js, chat.js) die on its first `auth.` reference, freezing the whole UI.
var auth = null;
try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();

  // Set persistence to LOCAL (survives browser close). This returns a promise
  // that rejects in environments without IndexedDB (e.g. some private-browsing
  // modes) — swallow it instead of producing an unhandled rejection.
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
    console.warn("[firebase] Could not enable LOCAL auth persistence:", err);
  });
} catch (err) {
  console.error(
    "[firebase] SDK failed to initialise — sign-in will be unavailable, " +
      "but the interface stays usable. Check that firebase-app-compat.js and " +
      "firebase-auth-compat.js loaded (network/CSP/ad-blocker).",
    err
  );
  auth = null;
}
