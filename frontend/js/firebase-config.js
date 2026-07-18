// ============================================
// Synapse AI — Firebase Configuration
// ============================================
// IMPORTANT: Replace the values below with your actual Firebase config
// from Firebase Console → Project Settings → General → Your apps

const firebaseConfig = {
  apiKey: "AIzaSyB3O9ufoR8-R0OAtPFgoR3SU4vRrYiWtrI",
  authDomain: "synapse-113bb.firebaseapp.com",
  projectId: "synapse-113bb",
  storageBucket: "synapse-113bb.firebasestorage.app",
  messagingSenderId: "740564023687",
  appId: "1:740564023687:web:59cd1d00564c76c42e7b22",
  measurementId: "G-81ZNBSKTEP",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Set persistence to LOCAL (survives browser close)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
