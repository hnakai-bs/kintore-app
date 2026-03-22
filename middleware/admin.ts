import { doc, getDoc } from "firebase/firestore";

/**
 * ログイン済みかつ Firestore `admin_users/{uid}` があること。
 * `definePageMeta({ middleware: ['admin'] })` が付いたページでのみ実行される。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig().public;
  if (!config.firebaseApiKey) {
    return navigateTo("/setup");
  }

  const nuxtApp = useNuxtApp();
  const fb = nuxtApp.$firebaseAuth;
  if (!fb) return;

  await fb.whenReady;
  const user = useState<import("firebase/auth").User | null>(
    "firebase-auth-user",
  );

  if (!user.value) {
    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }

  const db = nuxtApp.$firestoreDb;
  if (!db) {
    return navigateTo("/");
  }

  const adminGateReason = useState<"not_admin" | "firestore_error" | null>(
    "admin-gate-reason",
    () => null,
  );

  try {
    const snap = await getDoc(doc(db, "admin_users", user.value.uid));
    if (!snap.exists()) {
      adminGateReason.value = "not_admin";
      return navigateTo("/");
    }
    adminGateReason.value = null;
  } catch {
    // ルール未デプロイ・admin_users 未整備などで permission-denied になり得る。未捕捉だと Nuxt が 500 になる。
    adminGateReason.value = "firestore_error";
    return navigateTo("/");
  }
});
