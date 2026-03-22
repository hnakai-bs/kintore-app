import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  fetchAdminUserComments,
  type AdminUserComment,
} from "~/composables/useAdminUserComments";

/**
 * ユーザー向けトレーナーコメントの取得と、既読 ID（`users/{uid}/settings/trainerCommentReads`）の管理。
 */
export function useTrainerCommentsInbox() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  const comments = useState<AdminUserComment[]>(
    "trainer-inbox-comments",
    () => [],
  );
  const seenCommentIds = useState<string[]>("trainer-inbox-seen-ids", () => []);
  const loading = useState("trainer-inbox-loading", () => false);
  const error = useState<string | null>("trainer-inbox-error", () => null);

  function seenSet(): Set<string> {
    return new Set(seenCommentIds.value);
  }

  const unreadCount = computed(() => {
    const s = seenSet();
    return comments.value.filter((c) => !s.has(c.id)).length;
  });

  function isCommentRead(id: string): boolean {
    return seenSet().has(id);
  }

  async function loadSeenIds(uid: string): Promise<string[]> {
    const db = nuxtApp.$firestoreDb;
    if (!db) return [];
    const snap = await getDoc(
      doc(db, "users", uid, "settings", "trainerCommentReads"),
    );
    if (!snap.exists()) return [];
    const raw = snap.data()?.seenCommentIds;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x));
  }

  async function refreshInbox(): Promise<void> {
    await waitUntilReady();
    const uid = user.value?.uid;
    if (!uid) {
      comments.value = [];
      seenCommentIds.value = [];
      error.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const [list, seen] = await Promise.all([
        fetchAdminUserComments(uid),
        loadSeenIds(uid),
      ]);
      comments.value = list;
      seenCommentIds.value = seen;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "コメントの読み込みに失敗しました";
      comments.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** 指定 ID を既読として保存（未読のみ Firestore に送る） */
  async function markCommentsAsSeen(ids: string[]): Promise<void> {
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db || ids.length === 0) return;
    const s = seenSet();
    const newIds = [...new Set(ids.map(String))].filter((id) => !s.has(id));
    if (newIds.length === 0) return;
    await waitUntilReady();
    await setDoc(
      doc(db, "users", uid, "settings", "trainerCommentReads"),
      {
        seenCommentIds: arrayUnion(...newIds),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    seenCommentIds.value = [...new Set([...seenCommentIds.value, ...newIds])];
  }

  async function markAllInListAsSeen(): Promise<void> {
    const ids = comments.value.map((c) => c.id);
    await markCommentsAsSeen(ids);
  }

  return reactive({
    comments,
    seenCommentIds,
    loading,
    error,
    unreadCount,
    isCommentRead,
    refreshInbox,
    markCommentsAsSeen,
    markAllInListAsSeen,
  });
}
