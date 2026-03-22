import { checkAdminUid } from "~/composables/useAdminAccess";

/**
 * ログイン済みかつ Firestore `admin_users/{uid}` があること。
 * 一般ユーザーは管理ログインへ誘導（`redirect` で戻り先を保持）。
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

  const adminGateReason = useState<"not_admin" | "firestore_error" | null>(
    "admin-gate-reason",
    () => null,
  );

  const result = await checkAdminUid(user.value.uid);
  if (result === "not_admin") {
    adminGateReason.value = "not_admin";
    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }
  if (result === "error") {
    adminGateReason.value = "firestore_error";
    return navigateTo("/");
  }
  adminGateReason.value = null;
});
