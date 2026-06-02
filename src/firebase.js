import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD13q6NnKHwpb1rXMpvC4IGBXcw8v6K9nA",
  authDomain: "prode-kw-2026.firebaseapp.com",
  projectId: "prode-kw-2026",
  storageBucket: "prode-kw-2026.firebasestorage.app",
  messagingSenderId: "479527118329",
  appId: "1:479527118329:web:208daab716ad2b6811c928",
  measurementId: "G-EWN79VSPVB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
