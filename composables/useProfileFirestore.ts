import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { stripUndefined } from "~/utils/firestoreSanitize";
import {
  firestoreBlocked,
  firestoreOk,
  MSG_NO_FIRESTORE,
  MSG_NO_USER,
  toUserFirestoreMessage,
  type FirestorePersistResult,
} from "~/utils/firestorePersist";

async function ensureUserDirectoryEntry(db: Firestore, uid: string) {
  await setDoc(
    doc(db, "userDirectory", uid),
    { updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** ログインユーザーのプロフィール: `users/{uid}/settings/profile` */
export function useProfileFirestore() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  async function load(): Promise<Record<string, unknown>> {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db) return {};
    const snap = await getDoc(doc(db, "users", uid, "settings", "profile"));
    if (snap.exists()) {
      const dirSnap = await getDoc(doc(db, "userDirectory", uid));
      if (!dirSnap.exists()) {
        try {
          await ensureUserDirectoryEntry(db, uid);
        } catch {
          /* ルール未デプロイ時などはプロフィール表示は継続 */
        }
      }
    }
    return snap.exists()
      ? ({ ...(snap.data() as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  }

  async function merge(
    data: Record<string, unknown>,
  ): Promise<FirestorePersistResult> {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!db) return firestoreBlocked(MSG_NO_FIRESTORE);
    if (!uid) return firestoreBlocked(MSG_NO_USER);
    const payload = stripUndefined(data) as Record<string, unknown>;
    try {
      await setDoc(
        doc(db, "users", uid, "settings", "profile"),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await ensureUserDirectoryEntry(db, uid);
      return firestoreOk();
    } catch (e) {
      return { ok: false, message: toUserFirestoreMessage(e) };
    }
  }

  return { load, merge };
}
