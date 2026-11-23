import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCTizvApcTs_WiIvStv-Tp01EllXX6jPgM",
  authDomain: "reza-system-authenticati-5badc.firebaseapp.com",
  projectId: "reza-system-authenticati-5badc",
  storageBucket: "reza-system-authenticati-5badc.firebasestorage.app",
  messagingSenderId: "1052494346845",
  appId: "1:1052494346845:web:87729b7208126027872bb4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const authPersistenceReady = setPersistence(
  auth,
  browserLocalPersistence
);
