import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { ymd } from "~/utils/conditionGraphCore";
import {
  firestoreBlocked,
  firestoreOk,
  MSG_NO_FIRESTORE,
  MSG_NO_USER,
  toUserFirestoreMessage,
  type FirestorePersistResult,
} from "~/utils/firestorePersist";

export type TrainingDayDoc = {
  sets: unknown[];
  memo: string;
};

export function useTrainingFirestore() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  async function fetchRange(
    startYmd: string,
    endYmd: string,
    options?: { forUserId?: string },
  ): Promise<Record<string, unknown[]>> {
    await waitUntilReady();
    const uid = options?.forUserId ?? user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db) return {};
    const col = collection(db, "users", uid, "training");
    const q = query(
      col,
      where(documentId(), ">=", startYmd),
      where(documentId(), "<=", endYmd),
    );
    const snap = await getDocs(q);
    const out: Record<string, unknown[]> = {};
    snap.forEach((d) => {
      const data = d.data() as { sets?: unknown };
      out[d.id] = Array.isArray(data.sets) ? data.sets : [];
    });
    return out;
  }

  /**
   * 直近のトレーニング日（新しい順）。管理画面の一覧用。
   * `orderBy(documentId())` は環境によってインデックス／評価で失敗することがあるため、
   * `fetchRange` と同じ range クエリで取得し、クライアント側で ID 降順に並べる。
   */
  async function listTrainingDaysDesc(
    limitCount: number,
    options?: { forUserId?: string },
  ): Promise<{ dateYmd: string; sets: unknown[] }[]> {
    await waitUntilReady();
    const uid = options?.forUserId ?? user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db) return [];

    const maxDays = Math.min(500, Math.max(1, limitCount));
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (maxDays - 1));

    const map = await fetchRange(ymd(start), ymd(end), options);
    const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));
    return keys.map((dateYmd) => ({
      dateYmd,
      sets: map[dateYmd] ?? [],
    }));
  }

  async function getDay(dateYmd: string): Promise<TrainingDayDoc | null> {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db) return null;
    const snap = await getDoc(doc(db, "users", uid, "training", dateYmd));
    if (!snap.exists()) return null;
    const data = snap.data() as { sets?: unknown; memo?: unknown };
    const sets = Array.isArray(data.sets) ? data.sets : [];
    const memoRaw = data.memo != null ? String(data.memo) : "";
    return { sets, memo: memoRaw };
  }

  async function saveDay(
    dateYmd: string,
    sets: unknown[],
    memo: string,
  ): Promise<FirestorePersistResult> {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!db) return firestoreBlocked(MSG_NO_FIRESTORE);
    if (!uid) return firestoreBlocked(MSG_NO_USER);
    try {
      await setDoc(
        doc(db, "users", uid, "training", dateYmd),
        {
          sets: JSON.parse(JSON.stringify(sets)),
          memo,
        },
        { merge: true },
      );
      return firestoreOk();
    } catch (e) {
      return { ok: false, message: toUserFirestoreMessage(e) };
    }
  }

  return { fetchRange, listTrainingDaysDesc, getDay, saveDay };
}
