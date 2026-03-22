import { doc, getDoc } from "firebase/firestore";

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

    try {
      const snap = await getDoc(doc(db, "admin_users", uid));
      isAdmin.value = snap.exists();
    } catch {
      isAdmin.value = false;
    }
    checked.value = true;
    cachedUid = uid;
  }

  return {
    isAdmin: readonly(isAdmin),
    checked: readonly(checked),
    refresh,
  };
}
