// ============================================
// Synapse AI — Firebase Configuration
// ============================================
// IMPORTANT: Replace the values below with your actual Firebase config
// from Firebase Console → Project Settings → General → Your apps

const firebaseConfig = {
  apiKey: "AIzaSyAh1UyMunYwIO7jWs-AXUf-mhH9RO4HpZU",
  authDomain: "spherical-synapse-ln56p.firebaseapp.com",
  projectId: "spherical-synapse-ln56p",
  storageBucket: "spherical-synapse-ln56p.firebasestorage.app",
  messagingSenderId: "696236259390",
  appId: "1:696236259390:web:6633c37f82e9ab65cfb96f",
  measurementId: ""
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Set persistence to LOCAL (survives browser close)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
