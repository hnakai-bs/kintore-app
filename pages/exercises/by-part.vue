<script setup lang="ts">
import { groupsByBodyPart } from "~/utils/trainingExerciseGroupsByBodyPart";

const route = useRoute();
const router = useRouter();

const pickMode = computed(() => route.query.pick === "1");
const pickDateYmd = computed(() => {
  const d = route.query.date;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
});

const trainingBackTo = computed(() => ({
  path: "/training",
  query: pickDateYmd.value ? { date: pickDateYmd.value } : {},
}));

useHead(() => ({
  title: pickMode.value ? "RE-BIRTH" : "種目一覧（部位別）",
}));

/** テンプレートでは catalog.xxx と書くと ref がアンラップされず常に truthy になるため、ref をトップレベルで使う */
const {
  entries,
  ready,
  loadError,
  refresh: reloadExerciseCatalog,
  isValidName,
  guideUrl,
} = useTrainingExerciseCatalog();
const { user } = useFirebaseAuth();
const { getDay, saveDay } = useTrainingFirestore();

const groups = computed(() => groupsByBodyPart(entries.value));

const pickBusy = ref(false);
const pickMessage = ref<string | null>(null);

type SetRow = { exercise: string; weight: number | ""; reps: number | "" };

function normalizeExercise(v: unknown): string {
  const s = v != null ? String(v).trim() : "";
  if (s === "" || isValidName(s)) return s;
  return "";
}

function normalizeStoredSet(s: unknown): SetRow {
  if (!s || typeof s !== "object") return { exercise: "", weight: "", reps: "" };
  const o = s as { exercise?: unknown; weight?: unknown; reps?: unknown };
  const exercise = normalizeExercise(o.exercise);
  let weight: number | "" = o.weight as number | "";
  if (weight === "" || weight == null) weight = "";
  else {
    const n = Number(weight);
    weight = Number.isFinite(n) ? n : "";
  }
  let reps: number | "" = o.reps as number | "";
  if (reps === "" || reps == null) reps = "";
  else {
    const n = parseInt(String(reps), 10);
    reps = Number.isFinite(n) ? n : "";
  }
  return { exercise, weight, reps };
}

async function onPickExercise(exerciseName: string) {
  pickMessage.value = null;
  const dateYmd = pickDateYmd.value;
  if (!dateYmd || !user.value || pickBusy.value) return;
  const name = String(exerciseName ?? "").trim();
  if (!isValidName(name)) return;

  pickBusy.value = true;
  try {
    const doc = await getDay(dateYmd);
    const exerciseMemos = doc?.exerciseMemos ? { ...doc.exerciseMemos } : {};
    const rawSets =
      doc && Array.isArray(doc.sets) ? doc.sets : [];
    const sets = rawSets.map((row) => normalizeStoredSet(row));

    const already = sets.some(
      (row) => normalizeExercise(row.exercise) === name,
    );
    if (already) {
      pickMessage.value = "この日にはすでにその種目が登録されています。";
      return;
    }

    sets.push({ exercise: name, weight: "", reps: "" });
    const r = await saveDay(dateYmd, sets, exerciseMemos);
    if (!r.ok) {
      pickMessage.value = r.message;
      return;
    }
    await router.push({ path: "/training", query: { date: dateYmd } });
  } finally {
    pickBusy.value = false;
  }
}

async function onVisibility() {
  if (document.visibilityState === "visible") {
    await reloadExerciseCatalog();
  }
}

onMounted(() => {
  void reloadExerciseCatalog();
  document.addEventListener("visibilitychange", onVisibility);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <main class="main exercises-by-part-page">
    <div v-if="pickMode" class="sessions-back-wrap">
      <NuxtLink class="sessions-back-btn" :to="trainingBackTo">
        <span class="sessions-back-btn__mark" aria-hidden="true">＜</span>戻る
      </NuxtLink>
    </div>

    <h1 v-if="!pickMode" class="exercises-by-part-page__title">
      トレーニング種目一覧
    </h1>
    <p v-if="!pickMode" class="exercises-by-part-page__lead">
      Firestore に登録された種目を、<strong>部位ごと</strong>に分けて表示しています。
    </p>

    <p
      v-if="pickMode && !pickDateYmd"
      class="firestore-alert"
      role="alert"
    >
      日付が指定されていません。トレーニング画面から「種目追加」を開いてください。
    </p>

    <p
      v-if="pickMessage"
      class="exercises-by-part-page__pick-msg"
      role="status"
    >
      {{ pickMessage }}
    </p>

    <p v-if="loadError" class="firestore-alert" role="alert">
      {{ loadError }}
    </p>

    <template v-else>
      <p v-if="!ready" class="exercises-by-part-page__muted">
        読み込み中…
      </p>
      <p
        v-else-if="!user"
        class="exercises-by-part-page__muted"
      >
        種目を表示するにはログインしてください。
      </p>
      <p
        v-else-if="groups.length === 0"
        class="exercises-by-part-page__muted"
      >
        種目がまだ登録されていません。管理画面の種目マスタから追加できます。
      </p>
      <template v-else>
        <div
          class="exercises-by-part-list"
          :aria-label="pickMode ? '追加する種目を選ぶ' : '部位別トレーニング種目一覧'"
          :aria-busy="pickMode && pickBusy ? 'true' : undefined"
        >
          <section
            v-for="(g, gi) in groups"
            :key="g.part"
            class="exercises-by-part-block"
            :aria-labelledby="`ex-part-${gi}`"
          >
            <h2 :id="`ex-part-${gi}`" class="exercises-by-part-block__heading">
              <span class="exercises-by-part-block__name">{{ g.part }}</span>
              <span class="exercises-by-part-block__count">{{ g.names.length }} 種目</span>
            </h2>
            <ol class="exercises-by-part-block__ol">
              <li
                v-for="(name, ni) in g.names"
                :key="`${g.part}-${name}-${ni}`"
                class="exercises-by-part-block__li"
              >
                <div class="exercises-by-part-block__body">
                  <span class="exercises-by-part-block__exercise-name">{{ name }}</span>
                  <a
                    v-if="guideUrl(name)"
                    class="exercises-by-part-block__guide-link"
                    :href="guideUrl(name)"
                  >
                    フォーム解説
                  </a>
                </div>
                <button
                  v-if="pickMode && pickDateYmd"
                  type="button"
                  class="exercises-by-part-block__pick-btn"
                  :disabled="pickBusy || !user"
                  @click="onPickExercise(name)"
                >
                  追加
                </button>
              </li>
            </ol>
          </section>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.exercises-by-part-page {
  padding-bottom: 28px;
}

.exercises-by-part-page__pick-msg {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-pressed);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.45;
}

.exercises-by-part-page__title {
  margin: 0 0 8px;
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text);
}

.exercises-by-part-page__lead {
  margin: 0 0 20px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.exercises-by-part-page__muted {
  margin: 12px 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.exercises-by-part-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.exercises-by-part-block {
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}

.exercises-by-part-block__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 12px 14px 10px;
  background: var(--surface-pressed);
  border-bottom: 1px solid var(--border);
  font: inherit;
}

.exercises-by-part-block__count {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

.exercises-by-part-block__name {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text);
}

.exercises-by-part-block__ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.exercises-by-part-block__li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.45;
}

.exercises-by-part-block__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.exercises-by-part-block__guide-link {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.exercises-by-part-block__guide-link:hover {
  text-decoration-thickness: 0.08em;
}

.exercises-by-part-block__pick-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.1em;
  padding: 6px 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--surface);
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.exercises-by-part-block__pick-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.exercises-by-part-block__pick-btn:active:not(:disabled) {
  background: var(--surface-pressed);
}

.exercises-by-part-block__li:last-child {
  border-bottom: none;
}

.exercises-by-part-block__exercise-name {
  display: block;
  width: 100%;
  min-width: 0;
  padding-top: 0.05em;
}
</style>

<style>
@import "~/assets/css/sessions.css";
</style>
