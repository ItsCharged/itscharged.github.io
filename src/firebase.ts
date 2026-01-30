import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCGQRXsjrL7afZ1h_mJj-63Bu-DmuF-XF4",
  authDomain: "musikwuenschemwg.firebaseapp.com",
  projectId: "musikwuenschemwg",
  storageBucket: "musikwuenschemwg.firebasestorage.app",
  messagingSenderId: "796284725823",
  appId: "1:796284725823:web:05e2513d8258c98394668a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
