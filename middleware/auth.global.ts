function safeInternalPath(path: unknown, fallback = "/") {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }
  return path;
}

import { checkAdminUid } from "~/composables/useAdminAccess";

function redirectQueryValue(
  q: string | string[] | undefined | null,
): string {
  if (q == null) return "";
  return typeof q === "string" ? q : q[0] ?? "";
}

/** `/admin` へ行きたいが現ユーザーが管理者でない → ログイン画面に留まる */
async function blockAutoRedirectFromLoginToAdmin(
  redirectPath: string,
  uid: string,
): Promise<boolean> {
  if (!redirectPath.startsWith("/admin")) return false;
  const result = await checkAdminUid(uid);
  return result !== "admin";
}

/**
 * Firebase 未設定時は /setup のみ。
 * 設定済みなら /setup はホームへ。ログイン必須（/login を除く）。
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
  const config = useRuntimeConfig().public;

  if (!config.firebaseApiKey) {
    if (to.path !== "/setup") {
      return navigateTo("/setup");
    }
    return;
  }

  if (to.path === "/setup") {
    return navigateTo("/");
  }

  const nuxtApp = useNuxtApp();
  const fb = nuxtApp.$firebaseAuth;
  if (!fb) return;

  await fb.whenReady;
  const user = useState<import("firebase/auth").User | null>(
    "firebase-auth-user",
  );

  if (to.path === "/login") {
    if (user.value) {
      const path = safeInternalPath(to.query.redirect, "/");
      if (await blockAutoRedirectFromLoginToAdmin(path, user.value.uid)) {
        return;
      }
      return navigateTo(path);
    }
    return;
  }

  if (!user.value) {
    // ログイン画面から「/」等へのプリフェッチが未ログインガードに引っかかり、
    // 数秒ごとに navigateTo が繰り返されてチラつくのを防ぐ
    if (from?.path === "/login") {
      const saved = redirectQueryValue(from.query.redirect);

      if (saved === to.fullPath) {
        return abortNavigation();
      }

      if (to.path === "/" && saved && saved !== "/") {
        return abortNavigation();
      }

      if (!saved && to.fullPath === "/") {
        return navigateTo({ path: "/login", query: { redirect: "/" } });
      }

      return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
    }

    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }
});
