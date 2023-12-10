import { initializeApp } from 'firebase/app';



const firebaseConfig = {
    apiKey: "AIzaSyCxAGciWo48j3A2P1okoK-3midsNm14cDk",
    authDomain: "ieltsbank-a2bc1.firebaseapp.com",
    databaseURL: "https://ieltsbank-a2bc1-default-rtdb.firebaseio.com",
    projectId: "ieltsbank-a2bc1",
    storageBucket: "ieltsbank-a2bc1.appspot.com",
    messagingSenderId: "612897473864",
    appId: "1:612897473864:web:60200b92143c0c1faf9f7d",
    measurementId: "G-1KRYZZY68X"
  };

  const app = initializeApp(firebaseConfig);

  export { app };
