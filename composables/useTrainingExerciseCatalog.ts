import { collection, getDocs } from "firebase/firestore";

export type TrainingExerciseRow = {
  id: string;
  name: string;
  guideUrl: string;
  sortOrder: number;
};

const STATE_ENTRIES = "training-exercise-catalog-entries";
const STATE_READY = "training-exercise-catalog-ready";
const STATE_ERR = "training-exercise-catalog-error";

/**
 * Firestore `trainingExercises` を種目マスタとして読み込み（トレーニング画面・セッションで共有）。
 */
export function useTrainingExerciseCatalog() {
  const nuxtApp = useNuxtApp();
  const { user, waitUntilReady } = useFirebaseAuth();

  const entries = useState<TrainingExerciseRow[]>(STATE_ENTRIES, () => []);
  const ready = useState(STATE_READY, () => false);
  const loadError = useState<string | null>(STATE_ERR, () => null);

  async function refresh() {
    await waitUntilReady();
    const db = nuxtApp.$firestoreDb;
    if (!user.value || !db) {
      entries.value = [];
      loadError.value = null;
      ready.value = true;
      return;
    }
    try {
      /** orderBy しない: sortOrder 欠落ドキュメントが Firestore から除外されるのを防ぐ */
      const snap = await getDocs(collection(db, "trainingExercises"));
      const mapped = snap.docs.map((d) => {
        const data = d.data() as {
          name?: unknown;
          guideUrl?: unknown;
          sortOrder?: unknown;
        };
        const sortOrder =
          typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
            ? data.sortOrder
            : 0;
        return {
          id: d.id,
          name: String(data.name ?? "").trim(),
          guideUrl: String(data.guideUrl ?? "").trim(),
          sortOrder,
        };
      });
      mapped.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, "ja");
      });
      entries.value = mapped;
      loadError.value = null;
    } catch (e) {
      entries.value = [];
      loadError.value =
        e instanceof Error ? e.message : "種目一覧の読み込みに失敗しました";
    } finally {
      ready.value = true;
    }
  }

  watch(
    user,
    () => {
      ready.value = false;
      void refresh();
    },
    { immediate: true },
  );

  const names = computed(() => entries.value.map((e) => e.name).filter(Boolean));

  const nameSet = computed(() => new Set(names.value));

  function guideUrl(name: string): string {
    const n = String(name || "").trim();
    const row = entries.value.find((e) => e.name === n);
    return row?.guideUrl ?? "";
  }

  function isValidName(name: string): boolean {
    const n = String(name || "").trim();
    return n !== "" && nameSet.value.has(n);
  }

  return {
    entries,
    ready: readonly(ready),
    loadError: readonly(loadError),
    refresh,
    names,
    nameSet,
    guideUrl,
    isValidName,
  };
}
