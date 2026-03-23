import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  addCustomSessionInState,
  getSessionFromState,
  listSessionsFromState,
  parseSessionsState,
  removeSessionFromState,
  sessionsDefaultState,
  updateSessionInState,
  type SessionRow,
  type SessionsState,
} from "~/utils/sessionsCore";
import {
  firestoreBlocked,
  firestoreOk,
  MSG_NO_FIRESTORE,
  MSG_NO_USER,
  toUserFirestoreMessage,
  type FirestorePersistResult,
} from "~/utils/firestorePersist";

export type KintoreSessionWriteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * トレーニングセッションを Firestore `users/{uid}/settings/sessions` に保存。
 */
export function useKintoreSessions() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  const state = useState<SessionsState>(
    "kintore-sessions-state",
    () => sessionsDefaultState(),
  );
  const ready = useState("kintore-sessions-ready", () => false);

  function cloneState(): SessionsState {
    return JSON.parse(JSON.stringify(state.value)) as SessionsState;
  }

  async function persist(): Promise<FirestorePersistResult> {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!db) return firestoreBlocked(MSG_NO_FIRESTORE);
    if (!uid) return firestoreBlocked(MSG_NO_USER);
    try {
      await setDoc(
        doc(db, "users", uid, "settings", "sessions"),
        {
          byId: state.value.byId,
          customOrder: state.value.customOrder,
          hiddenPresetIds: state.value.hiddenPresetIds ?? [],
        },
        { merge: true },
      );
      return firestoreOk();
    } catch (e) {
      return { ok: false, message: toUserFirestoreMessage(e) };
    }
  }

  async function load() {
    await waitUntilReady();
    const uid = user.value?.uid;
    const db = nuxtApp.$firestoreDb;
    if (!uid || !db) {
      state.value = sessionsDefaultState();
      ready.value = true;
      return;
    }
    const snap = await getDoc(doc(db, "users", uid, "settings", "sessions"));
    state.value = snap.exists()
      ? parseSessionsState(snap.data())
      : sessionsDefaultState();
    ready.value = true;
  }

  watch(
    user,
    async () => {
      ready.value = false;
      await load();
    },
    { immediate: true },
  );

  function listSessions(): SessionRow[] {
    return listSessionsFromState(state.value);
  }

  function getSession(id: string | undefined | null): SessionRow | null {
    return getSessionFromState(state.value, id);
  }

  async function updateSession(
    id: string,
    patch: { title?: string; notes?: string; exercises?: string[] },
  ): Promise<KintoreSessionWriteResult> {
    const snapshot = cloneState();
    if (!updateSessionInState(state.value, id, patch)) {
      return { ok: false, message: "このセッションは編集できません。" };
    }
    const r = await persist();
    if (!r.ok) {
      state.value = snapshot;
      return { ok: false, message: r.message };
    }
    return { ok: true };
  }

  async function addCustomSession(title: string): Promise<string> {
    const snapshot = cloneState();
    const id = addCustomSessionInState(state.value, title);
    const r = await persist();
    if (!r.ok) {
      state.value = snapshot;
      throw new Error(r.message);
    }
    return id;
  }

  async function deleteSession(id: string): Promise<KintoreSessionWriteResult> {
    const snapshot = cloneState();
    if (!removeSessionFromState(state.value, id)) {
      return { ok: false, message: "このセッションは削除できません。" };
    }
    const r = await persist();
    if (!r.ok) {
      state.value = snapshot;
      return { ok: false, message: r.message };
    }
    return { ok: true };
  }

  return {
    ready: readonly(ready),
    listSessions,
    getSession,
    updateSession,
    addCustomSession,
    deleteSession,
    refresh: load,
  };
}
