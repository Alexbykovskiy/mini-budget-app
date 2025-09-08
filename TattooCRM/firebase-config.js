// firebase-config.js — инициализация Firebase (compat)
const firebaseConfig = {
  apiKey: "AIzaSyBzHEcrGfwek6FzguWbSGSfMgebMy1sBe8",
  authDomain: "minibudget-4e474.firebaseapp.com",
  projectId: "minibudget-4e474",
  storageBucket: "minibudget-4e474.appspot.com",
  messagingSenderId: "306275735842",
  appId: "1:306275735842:web:740615c23059e97cd36d7b"
};

// ВАЖНО: сначала initializeApp
firebase.initializeApp(firebaseConfig);

// Экспорт "удобной" обёртки
window.FB = {
  auth: firebase.auth(),
  db: firebase.firestore()
};
