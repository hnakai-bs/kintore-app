import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public;

  const user = useState<import("firebase/auth").User | null>(
    "firebase-auth-user",
    () => null,
  );
  const authReady = useState("firebase-auth-ready", () => false);

  if (!config.firebaseApiKey) {
    authReady.value = true;
    return {
      provide: {
        firebaseAuth: null,
        firestoreDb: null,
        firebaseStorage: null,
      },
    };
  }

  const firebaseConfig = {
    apiKey: config.firebaseApiKey,
    authDomain: config.firebaseAuthDomain,
    projectId: config.firebaseProjectId,
    storageBucket: config.firebaseStorageBucket,
    messagingSenderId: config.firebaseMessagingSenderId,
    appId: config.firebaseAppId,
  };

  const app: FirebaseApp =
    getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  let resolveReady!: () => void;
  const whenReady = new Promise<void>((r) => {
    resolveReady = r;
  });

  onAuthStateChanged(auth, (u) => {
    user.value = u;
    if (!authReady.value) {
      authReady.value = true;
      resolveReady();
    }
  });

  return {
    provide: {
      firebaseAuth: {
        auth,
        whenReady,
        signInWithEmail(email: string, password: string) {
          return signInWithEmailAndPassword(auth, email, password).then(() => {});
        },
        signOutUser() {
          return signOut(auth);
        },
      },
      firestoreDb: db,
      firebaseStorage: storage,
    },
  };
});
