import type { User } from "firebase/auth";

/**
 * Firebase Auth の状態と操作。
 * `NUXT_PUBLIC_FIREBASE_API_KEY` が無い場合は $firebaseAuth が null（認証スキップモード）。
 */
export function useFirebaseAuth() {
  const user = useState<User | null>("firebase-auth-user", () => null);
  const authReady = useState("firebase-auth-ready", () => false);
  const nuxtApp = useNuxtApp();
  const fb = nuxtApp.$firebaseAuth;

  async function waitUntilReady() {
    if (!fb) return;
    await fb.whenReady;
  }

  return {
    user: readonly(user),
    authReady: readonly(authReady),
    isConfigured: computed(() => fb != null),
    waitUntilReady,
    signInWithEmail: (email: string, password: string) =>
      fb?.signInWithEmail(email, password),
    signOut: () => fb?.signOutUser(),
  };
}
