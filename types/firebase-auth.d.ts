import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

export type FirebaseAuthPlugin = {
  auth: Auth;
  whenReady: Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signOutUser(): Promise<void>;
};

declare module "#app" {
  interface NuxtApp {
    $firebaseAuth: FirebaseAuthPlugin | null;
    $firestoreDb: Firestore | null;
    $firebaseStorage: FirebaseStorage | null;
  }
}

export {};
