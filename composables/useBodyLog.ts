import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import {
  deleteEntryStorageFiles,
  resolveSlotsForUpdate,
  uploadEntrySlotsFromRaw,
  type SlotUrls,
} from "~/utils/bodyLogUpload";

export type BodyLogPhotoSlot = "front" | "back" | "side" | "extra";

export type BodyLogEntry = {
  id: string;
  date: string;
  front: string | null;
  back: string | null;
  side: string | null;
  extra: string | null;
};

const STORAGE_KEY = "kintore-body-log-v1";

const entries = ref<BodyLogEntry[]>([]);
let localHydrated = false;

function sortEntries(list: BodyLogEntry[]) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

function useCloudPersistence() {
  const nuxtApp = useNuxtApp();
  const c = useRuntimeConfig().public;
  return !!(
    c.firebaseApiKey &&
    nuxtApp.$firestoreDb &&
    nuxtApp.$firebaseStorage
  );
}

function docToEntry(id: string, data: Record<string, unknown>): BodyLogEntry {
  return {
    id,
    date: String(data.date ?? ""),
    front: (data.front as string | null | undefined) ?? null,
    back: (data.back as string | null | undefined) ?? null,
    side: (data.side as string | null | undefined) ?? null,
    extra: (data.extra as string | null | undefined) ?? null,
  };
}

export function useBodyLog() {
  const nuxtApp = useNuxtApp();

  async function loadFromFirestore(db: Firestore) {
    const user = useState<import("firebase/auth").User | null>(
      "firebase-auth-user",
    );
    if (!user.value?.uid) {
      entries.value = [];
      return;
    }
    const uid = user.value.uid;
    const col = collection(db, "users", uid, "bodyLogs");
    const q = query(col, orderBy("date", "desc"));
    const snap = await getDocs(q);
    entries.value = sortEntries(
      snap.docs.map((d) => docToEntry(d.id, d.data() as Record<string, unknown>)),
    );
  }

  async function loadFromStorage() {
    if (!import.meta.client) return;

    if (useCloudPersistence()) {
      const fb = nuxtApp.$firebaseAuth;
      if (fb) await fb.whenReady;
      const db = nuxtApp.$firestoreDb;
      if (db) await loadFromFirestore(db);
      return;
    }

    if (localHydrated) return;
    localHydrated = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          entries.value = sortEntries(parsed as BodyLogEntry[]);
        }
      }
    } catch {
      /* ignore */
    }
  }

  function persistLocal() {
    if (!import.meta.client || useCloudPersistence()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
    } catch {
      /* quota / private mode */
    }
  }

  type BodyLogEntryUpdate = Omit<BodyLogEntry, "id">;

  async function addEntry(entry: BodyLogEntry) {
    if (useCloudPersistence()) {
      const fb = nuxtApp.$firebaseAuth;
      if (fb) await fb.whenReady;
      const db = nuxtApp.$firestoreDb;
      const storage = nuxtApp.$firebaseStorage;
      const user = useState<import("firebase/auth").User | null>(
        "firebase-auth-user",
      );
      if (!db || !storage || !user.value?.uid) {
        throw new Error("Firebase が利用できません");
      }
      const uid = user.value.uid;
      const id = entry.id;
      const raw: SlotUrls = {
        front: entry.front,
        back: entry.back,
        side: entry.side,
        extra: entry.extra,
      };
      const urls = await uploadEntrySlotsFromRaw(storage, uid, id, raw);
      await setDoc(doc(db, "users", uid, "bodyLogs", id), {
        date: entry.date,
        front: urls.front,
        back: urls.back,
        side: urls.side,
        extra: urls.extra,
        updatedAt: serverTimestamp(),
      });
      entries.value = sortEntries([
        { id, date: entry.date, ...urls },
        ...entries.value,
      ]);
      return;
    }

    entries.value = sortEntries([entry, ...entries.value]);
    persistLocal();
  }

  async function updateEntry(id: string, data: BodyLogEntryUpdate) {
    if (useCloudPersistence()) {
      const fb = nuxtApp.$firebaseAuth;
      if (fb) await fb.whenReady;
      const db = nuxtApp.$firestoreDb;
      const storage = nuxtApp.$firebaseStorage;
      const user = useState<import("firebase/auth").User | null>(
        "firebase-auth-user",
      );
      if (!db || !storage || !user.value?.uid) {
        throw new Error("Firebase が利用できません");
      }
      const uid = user.value.uid;
      const prev = entries.value.find((e) => e.id === id);
      if (!prev) return false;

      const prevUrls: SlotUrls = {
        front: prev.front,
        back: prev.back,
        side: prev.side,
        extra: prev.extra,
      };
      const nextUrls: SlotUrls = {
        front: data.front,
        back: data.back,
        side: data.side,
        extra: data.extra,
      };
      const urls = await resolveSlotsForUpdate(
        storage,
        uid,
        id,
        prevUrls,
        nextUrls,
      );

      await updateDoc(doc(db, "users", uid, "bodyLogs", id), {
        date: data.date,
        front: urls.front,
        back: urls.back,
        side: urls.side,
        extra: urls.extra,
        updatedAt: serverTimestamp(),
      });

      entries.value = sortEntries([
        ...entries.value.filter((e) => e.id !== id),
        { id, date: data.date, ...urls },
      ]);
      return true;
    }

    const i = entries.value.findIndex((e) => e.id === id);
    if (i === -1) return false;
    entries.value = sortEntries([
      ...entries.value.slice(0, i),
      { id, ...data },
      ...entries.value.slice(i + 1),
    ]);
    persistLocal();
    return true;
  }

  async function deleteEntry(id: string) {
    if (useCloudPersistence()) {
      const fb = nuxtApp.$firebaseAuth;
      if (fb) await fb.whenReady;
      const db = nuxtApp.$firestoreDb;
      const storage = nuxtApp.$firebaseStorage;
      const user = useState<import("firebase/auth").User | null>(
        "firebase-auth-user",
      );
      if (!db || !storage || !user.value?.uid) {
        throw new Error("Firebase が利用できません");
      }
      const uid = user.value.uid;
      const exists = entries.value.some((e) => e.id === id);
      if (!exists) return false;

      await deleteEntryStorageFiles(storage, uid, id);
      await deleteDoc(doc(db, "users", uid, "bodyLogs", id));
      entries.value = entries.value.filter((e) => e.id !== id);
      return true;
    }

    const before = entries.value.length;
    entries.value = entries.value.filter((e) => e.id !== id);
    if (entries.value.length === before) return false;
    persistLocal();
    return true;
  }

  /** ローカル保存モードのみ（クラウド時は無効） */
  function replaceEntries(list: BodyLogEntry[]) {
    if (useCloudPersistence()) {
      return;
    }
    entries.value = sortEntries([...list]);
    persistLocal();
  }

  return {
    entries,
    loadFromStorage,
    addEntry,
    updateEntry,
    deleteEntry,
    replaceEntries,
  };
}

/**
 * 管理画面: 指定ユーザーの `users/{uid}/bodyLogs` を取得（Firestore 管理者 read）。
 */
export async function fetchBodyLogsForUserId(
  targetUid: string,
): Promise<BodyLogEntry[]> {
  const nuxtApp = useNuxtApp();
  const { waitUntilReady } = useFirebaseAuth();
  await waitUntilReady();
  const uid = targetUid.trim();
  const db = nuxtApp.$firestoreDb;
  if (!db || !uid) return [];
  const col = collection(db, "users", uid, "bodyLogs");
  const q = query(col, orderBy("date", "desc"));
  const snap = await getDocs(q);
  return sortEntries(
    snap.docs.map((d) =>
      docToEntry(d.id, d.data() as Record<string, unknown>),
    ),
  );
}
