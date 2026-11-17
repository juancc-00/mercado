// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBZ4iLuNSLAPDGmkY5Y_zumRW8RzYemeK4",
    authDomain: "mercado-87636.firebaseapp.com",
    projectId: "mercado-87636",
    storageBucket: "mercado-87636.firebasestorage.app",
    messagingSenderId: "771003005436",
    appId: "1:771003005436:web:44be10bec509bd2ac0da79",
    measurementId: "G-BTGLM8Q14Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);