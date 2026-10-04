// ============================================
// Synapse AI — Authentication Logic (Modal)
// ============================================

// ── Page Transition helper for navigating away ──
function navigateTo(url) {
  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';
    setTimeout(() => { window.location.href = url; }, 300);
  } else {
    window.location.href = url;
  }
}

// ── DOM Elements ──
const authError        = document.getElementById('auth-error');
const authForm         = document.getElementById('auth-form');
const authBtn          = document.getElementById('auth-btn');
const authBtnText      = document.getElementById('auth-btn-text');
const authToggle       = document.getElementById('auth-toggle');
const authTitle        = document.getElementById('auth-title');
const authSubtitle     = document.getElementById('auth-subtitle');
const nameField        = document.getElementById('name-field');
const googleBtn        = document.getElementById('google-btn');
const passwordStrengthBar = document.getElementById('password-strength-bar');

let isSignUp = false;
let explicitLoginAttempt = false;

// Shown whenever an auth action is attempted while the Firebase SDK failed to
// initialise (blocked CDN, offline, strict CSP). Keeps the UI responsive with
// a clear message instead of a silent dead click or a thrown ReferenceError.
const AUTH_UNAVAILABLE_MSG = 'Sign-in is unavailable right now — the authentication service failed to load. Check your connection and refresh the page.';

// ── Wire up UI interactions once DOM is ready ──
window.addEventListener('DOMContentLoaded', () => {

  // ── Show / Hide Password ──
  const toggleBtn  = document.getElementById('toggle-password');
  const passwordEl = document.getElementById('password');
  const toggleIcon = document.getElementById('toggle-password-icon');
  if (toggleBtn && passwordEl && toggleIcon) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordEl.type === 'password';
      passwordEl.type = isHidden ? 'text' : 'password';
      toggleIcon.textContent = isHidden ? 'visibility_off' : 'visibility';
      const label = isHidden ? 'Hide password' : 'Show password';
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.setAttribute('title', label);
    });
  }

  // ── Password Strength Meter ──
  if (passwordEl) {
    passwordEl.addEventListener('input', () => {
      if (!isSignUp) return;
      const val  = passwordEl.value;
      const segs  = document.querySelectorAll('.strength-seg');
      const label = document.getElementById('strength-label');
      if (!segs.length || !label) return;

      let strength = 0;
      if (val.length >= 6) strength++;
      if (/[A-Z]/.test(val) && /[0-9]/.test(val)) strength++;
      if (val.length >= 12 && /[^A-Za-z0-9]/.test(val)) strength++;

      const colors = ['#f44336', '#ff9800', '#4caf50'];
      const labels = ['Weak', 'Moderate', 'Strong'];
      segs.forEach((seg, i) => {
        seg.style.background = i < strength ? colors[strength - 1] : 'rgba(255,255,255,0.1)';
      });
      label.textContent = strength > 0 ? labels[strength - 1] : 'Password strength';
      label.style.color = strength > 0 ? colors[strength - 1] : 'rgba(226,226,233,0.4)';
    });
  }

  // ── Forgot Password ──
  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!auth) {
        showError(AUTH_UNAVAILABLE_MSG);
        return;
      }
      const emailEl = document.getElementById('email');
      const email = emailEl?.value.trim();
      if (!email) {
        showError('Please enter your email address first.');
        return;
      }
      try {
        await auth.sendPasswordResetEmail(email);
        showSuccess('Password reset email sent! Check your inbox.');
      } catch (err) {
        showError(formatError(err.code));
      }
    });
  }
});

// ── Toggle Sign In / Sign Up ──
if (authToggle) {
  authToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    const forgotWrap = document.getElementById('forgot-password-wrap');
    const authFormEl = document.getElementById('auth-form');
    
    // Animate the form transition
    if (authFormEl) {
      authFormEl.style.opacity = '0';
      authFormEl.style.transform = 'translateY(6px)';
      authFormEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    }
    
    setTimeout(() => {
      if (isSignUp) {
        authTitle.textContent      = 'Create Account';
        authSubtitle.textContent   = 'Join Synapse AI today';
        authBtnText.textContent    = 'Create Account';
        authToggle.innerHTML       = 'Already have an account? <strong style="color:#7c5cff;">Sign In</strong>';
        if (nameField) nameField.style.display = 'block';
        if (passwordStrengthBar)  passwordStrengthBar.style.display = 'block';
        if (forgotWrap) forgotWrap.style.display = 'none';
      } else {
        authTitle.textContent      = 'Welcome Back';
        authSubtitle.textContent   = 'Sign in to continue with Aura';
        authBtnText.textContent    = 'Sign In';
        authToggle.innerHTML       = "Don't have an account? <strong style='color:#7c5cff;'>Create one</strong>";
        if (nameField) nameField.style.display = 'none';
        if (passwordStrengthBar) {
          passwordStrengthBar.style.display = 'none';
          document.querySelectorAll('.strength-seg').forEach(seg => {
            seg.style.background = 'rgba(255,255,255,0.1)';
          });
          const label = document.getElementById('strength-label');
          if (label) { label.textContent = 'Password strength'; label.style.color = 'rgba(226,226,233,0.4)'; }
        }
        if (forgotWrap) forgotWrap.style.display = '';
      }
      hideError();
      
      // Animate form back in
      if (authFormEl) {
        requestAnimationFrame(() => {
          authFormEl.style.opacity = '1';
          authFormEl.style.transform = 'translateY(0)';
        });
      }
    }, 200);
  });
}

// ── Form Submit ──
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    if (!auth) {
      showError(AUTH_UNAVAILABLE_MSG);
      return;
    }
    setLoading(true);

    const email       = document.getElementById('email').value.trim();
    const password    = document.getElementById('password').value;
    const displayName = document.getElementById('display-name')?.value.trim();

    try {
      explicitLoginAttempt = true;
      let isNewUser = false;
      if (isSignUp) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        if (displayName) await cred.user.updateProfile({ displayName });
        isNewUser = true;
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
      
      if (isNewUser) {
        sessionStorage.setItem('synapse_new_user', 'true');
      }
      // onAuthStateChanged will handle the redirect
    } catch (err) {
      explicitLoginAttempt = false;
      showError(formatError(err.code));
      setLoading(false);
    }
  });
}

// ── Google Sign In ──
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    hideError();
    if (!auth) {
      showError(AUTH_UNAVAILABLE_MSG);
      return;
    }
    try {
      explicitLoginAttempt = true;
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await auth.signInWithPopup(provider);
      
      if (cred.additionalUserInfo && cred.additionalUserInfo.isNewUser) {
        sessionStorage.setItem('synapse_new_user', 'true');
      }
    } catch (err) {
      explicitLoginAttempt = false;
      if (err.code !== 'auth/popup-closed-by-user') {
        showError(formatError(err.code));
      }
    }
  });
}

// ── Auth State Listener ──
// Guarded: when the Firebase SDK failed to load, `auth` is null. Without this
// check the bare `auth.` reference throws a ReferenceError that unwinds this
// whole script — previously one of the reasons the page froze.
if (auth) {
auth.onAuthStateChanged((user) => {
  const currentPage = window.location.pathname;

  // Dynamic Launch Buttons for Landing Page
  const navLaunchBtn = document.getElementById('nav-launch-btn');
  const heroStartBtn = document.getElementById('hero-start-btn');
  const footerLaunchBtn = document.getElementById('footer-launch-btn');

  if (user) {
    if (navLaunchBtn) navLaunchBtn.textContent = 'Go to Chat';
    if (heroStartBtn) heroStartBtn.textContent = 'Continue Chatting';
    if (footerLaunchBtn) footerLaunchBtn.textContent = 'Go to Chat';

    // Only redirect to chat if the user explicitly signed in (not on passive session restore)
    if (explicitLoginAttempt) {
      sessionStorage.removeItem('synapse_new_user');
      explicitLoginAttempt = false; // reset to prevent double-redirect on token refresh

      if (currentPage === '/' || currentPage === '/index.html' || currentPage === '/login.html' || currentPage === '') {
        navigateTo('/chat.html');
      }
    }
  } else {
    // Signed out — redirect to home (modal will handle sign-in).
    // DEV bypass: when window.DEV_DISABLE_AUTH is on (see firebase-config.js),
    // stay on the chat page so the UI can be exercised without a Firebase
    // session. Turn the flag off to restore the normal auth gate.
    const onChatPage = currentPage === '/chat.html' || currentPage === '/chat' ||
                       currentPage.endsWith('/chat.html') || currentPage.endsWith('/chat');
    if (onChatPage && !window.DEV_DISABLE_AUTH) {
      navigateTo('/index.html');
    }
  }
});
} else {
  // Firebase never initialised (CDN blocked / offline / CSP). Do NOT redirect
  // or throw — leave the page fully interactive in offline mode; chat.js
  // applies the same guard and keeps local UI working.
  console.warn('[auth] Firebase Auth unavailable — running without sign-in. ' +
    'Check that the gstatic.com Firebase scripts loaded.');
}

// ── Helpers ──
function showError(msg) {
  if (authError) {
    authError.textContent = msg;
    authError.style.display = 'block';
    authError.style.background = 'rgba(147,0,10,0.2)';
    authError.style.color = '#ffb4ab';
    authError.style.border = '1px solid rgba(255,180,171,0.2)';
  }
}

function showSuccess(msg) {
  if (authError) {
    authError.textContent = msg;
    authError.style.display = 'block';
    authError.style.background = 'rgba(0,150,100,0.15)';
    authError.style.color = '#4ade80';
    authError.style.border = '1px solid rgba(74,222,128,0.2)';
  }
}

function hideError() {
  if (authError) authError.style.display = 'none';
}

function setLoading(loading) {
  if (authBtn) {
    authBtn.disabled = loading;
    authBtnText.innerHTML = loading
      ? '<span class="spinner"></span>'
      : (isSignUp ? 'Create Account' : 'Sign In');
  }
}

function formatError(code) {
  const errors = {
    'auth/email-already-in-use':  'This email is already registered. Try signing in.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/weak-password':          'Password should be at least 6 characters.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/invalid-credential':     'Invalid credentials. Please check and try again.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return errors[code] || 'Something went wrong. Please try again.';
}
