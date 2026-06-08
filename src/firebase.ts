import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// --- NEW: Import App Check ---
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbl2GlBosoBB4_xo7BdvJTHlOSoJ7AjT4",
  authDomain: "adc-portal-29fb3.firebaseapp.com",
  projectId: "adc-portal-29fb3",
  storageBucket: "adc-portal-29fb3.firebasestorage.app",
  messagingSenderId: "206138284974",
  appId: "1:206138284974:web:944f4d5147e7743fce463f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- NEW: The App Check "Outside Bouncer" ---
// We initialize this before the database so the bouncer is ready at the door.
if (typeof window !== "undefined") {
  // Optional: This line helps bypass reCAPTCHA blocks when you test locally
  if (window.location.hostname === "localhost") {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdzKA0tAAAAAFAH8F3ACodnwHMOVNQ3U-ioW29W'),
    isTokenAutoRefreshEnabled: true // Firebase will handle renewing the token automatically
  });
}
// --------------------------------------------

// Initialize Firestore
export const db = getFirestore(app);
export const auth = getAuth(app);

console.log('Firebase Handshake & App Check Successful!');
