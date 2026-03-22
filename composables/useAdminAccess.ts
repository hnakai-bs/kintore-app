import { doc, getDoc } from "firebase/firestore";

export type AdminUidCheckResult = "admin" | "not_admin" | "error";

/**
 * Firestore `admin_users/{uid}` の有無（ミドルウェア・ログイン画面用）。
 * `error` は DB 未接続や permission-denied 等。
 */
export async function checkAdminUid(uid: string): Promise<AdminUidCheckResult> {
  const nuxtApp = useNuxtApp();
  const db = nuxtApp.$firestoreDb;
  if (!db) return "error";
  try {
    const snap = await getDoc(doc(db, "admin_users", uid));
    return snap.exists() ? "admin" : "not_admin";
  } catch {
    return "error";
  }
}

/**
 * Firestore `admin_users/{uid}` が存在するユーザーのみ管理者。
 * ドキュメントは Firebase Console 等で手動作成（ルールでクライアントからの書き込み不可）。
 */
export function useAdminAccess() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  const isAdmin = ref(false);
  const checked = ref(false);
  let cachedUid: string | null | undefined;

  async function refresh() {
    await waitUntilReady();
    const uid = user.value?.uid ?? null;
    const db = nuxtApp.$firestoreDb;

    if (!uid || !db) {
      isAdmin.value = false;
      checked.value = true;
      cachedUid = uid;
      return;
    }

    if (cachedUid === uid && checked.value) return;

    const result = await checkAdminUid(uid);
    isAdmin.value = result === "admin";
    checked.value = true;
    cachedUid = uid;
  }

  return {
    isAdmin: readonly(isAdmin),
    checked: readonly(checked),
    refresh,
  };
}
