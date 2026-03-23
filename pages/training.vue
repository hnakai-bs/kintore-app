<script setup lang="ts">
import {
  matchesExerciseSearch,
  resolveExerciseNameFromInput,
} from "~/utils/exerciseSearch";

const { getDay: getTrainingDay, saveDay: saveTrainingDay } =
  useTrainingFirestore();
const kintoreSessions = useKintoreSessions();
const exerciseCatalog = useTrainingExerciseCatalog();
const { user } = useFirebaseAuth();

const SOURCE_NEW = "__new__";

const exerciseNamesList = computed(() => exerciseCatalog.names.value);
const validExerciseNames = computed(() => exerciseCatalog.nameSet.value);

type SetRow = { exercise: string; weight: number | ""; reps: number | "" };

function emptySet(): SetRow {
  return { exercise: "", weight: "", reps: "" };
}

function normalizeExercise(v: unknown) {
  const s = v != null ? String(v).trim() : "";
  if (s === "" || exerciseCatalog.isValidName(s)) return s;
  return "";
}

function normalizeStoredSet(s: unknown): SetRow {
  if (!s || typeof s !== "object") return emptySet();
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

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatHeaderDate(d: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

useHead({ title: "トレーニングレコード" });

const route = useRoute();
const currentDate = ref(new Date());
currentDate.value.setHours(12, 0, 0, 0);

const q = route.query.date;
if (typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
  const d = parseYmd(q);
  if (!Number.isNaN(d.getTime())) {
    d.setHours(12, 0, 0, 0);
    currentDate.value = d;
  }
}

const calendarViewMonth = ref(new Date(currentDate.value));
const calendarDialog = ref<HTMLDialogElement | null>(null);
const calendarExpanded = ref(false);
const persistError = ref<string | null>(null);

const sessionSource = ref(SOURCE_NEW);
const lastSessionSourceValue = ref(SOURCE_NEW);

function preferredSessionStorageKey(): string | null {
  const uid = user.value?.uid;
  return uid ? `kintore-preferred-training-session:${uid}` : null;
}

function loadPreferredSessionFromStorage(): string {
  if (import.meta.server) return SOURCE_NEW;
  const key = preferredSessionStorageKey();
  if (!key) return SOURCE_NEW;
  try {
    const raw = localStorage.getItem(key);
    return raw ?? SOURCE_NEW;
  } catch {
    return SOURCE_NEW;
  }
}

function savePreferredSessionToStorage(id: string) {
  const key = preferredSessionStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, id);
  } catch {
    /* ignore quota / private mode */
  }
}

/** 保存済みのセッションIDがまだ存在するか確認し、ドロップダウンに反映（セット内容は変更しない） */
function applyPreferredSessionIfValid() {
  const raw = loadPreferredSessionFromStorage();
  if (raw === SOURCE_NEW) {
    sessionSource.value = SOURCE_NEW;
    lastSessionSourceValue.value = SOURCE_NEW;
    return;
  }
  if (!kintoreSessions.getSession(raw)) {
    savePreferredSessionToStorage(SOURCE_NEW);
    sessionSource.value = SOURCE_NEW;
    lastSessionSourceValue.value = SOURCE_NEW;
    return;
  }
  sessionSource.value = raw;
  lastSessionSourceValue.value = raw;
}

const sessionsTick = ref(0);
const sessionOptions = computed(() => {
  sessionsTick.value;
  return kintoreSessions.listSessions();
});

function bumpSessionOptions() {
  sessionsTick.value += 1;
}

const sets = ref<SetRow[]>([]);

const exerciseComboOpenIndex = ref<number | null>(null);
const exerciseComboQuery = ref("");
const exerciseComboBaseline = ref("");
let exerciseComboCloseTimer: ReturnType<typeof setTimeout> | null = null;

const filteredExerciseNamesForTraining = computed(() => {
  const q = exerciseComboQuery.value;
  const opts = exerciseNamesList.value;
  if (!q.trim()) return opts;
  return opts.filter((n) => matchesExerciseSearch(n, q));
});

function clearExerciseComboTimer() {
  if (exerciseComboCloseTimer) {
    clearTimeout(exerciseComboCloseTimer);
    exerciseComboCloseTimer = null;
  }
}

function closeTrainingExerciseCombo() {
  const i = exerciseComboOpenIndex.value;
  if (i == null) return;
  const q = exerciseComboQuery.value.trim();
  let next = exerciseComboBaseline.value;
  if (q === "") next = "";
  else if (validExerciseNames.value.has(q)) next = q;
  else {
    const resolved = resolveExerciseNameFromInput(
      q,
      validExerciseNames.value,
      exerciseNamesList.value,
    );
    next = resolved ?? exerciseComboBaseline.value;
  }
  const prev = sets.value[i]?.exercise ?? "";
  if (prev !== next) {
    sets.value[i].exercise = next;
    sets.value = [...sets.value];
    void persistSets();
  }
  exerciseComboOpenIndex.value = null;
}

function onTrainingExerciseComboFocus(i: number) {
  clearExerciseComboTimer();
  if (
    exerciseComboOpenIndex.value !== null &&
    exerciseComboOpenIndex.value !== i
  ) {
    closeTrainingExerciseCombo();
  }
  exerciseComboOpenIndex.value = i;
  exerciseComboBaseline.value = sets.value[i]?.exercise ?? "";
  exerciseComboQuery.value = sets.value[i]?.exercise ?? "";
}

function onTrainingExerciseComboBlur() {
  exerciseComboCloseTimer = setTimeout(() => {
    closeTrainingExerciseCombo();
    exerciseComboCloseTimer = null;
  }, 200);
}

function onTrainingExerciseComboInput(e: Event) {
  exerciseComboQuery.value = (e.target as HTMLInputElement).value;
}

function pickTrainingExercise(i: number, name: string) {
  clearExerciseComboTimer();
  sets.value[i].exercise = name;
  sets.value = [...sets.value];
  exerciseComboOpenIndex.value = null;
  void persistSets();
}

function onTrainingExerciseComboKeydown(i: number, e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    clearExerciseComboTimer();
    exerciseComboQuery.value = exerciseComboBaseline.value;
    exerciseComboOpenIndex.value = null;
    (e.target as HTMLInputElement).blur();
    return;
  }
  if (e.key === "Enter") {
    const filtered = filteredExerciseNamesForTraining.value;
    const t = exerciseComboQuery.value.trim();
    e.preventDefault();
    if (filtered.length === 1) {
      pickTrainingExercise(i, filtered[0]!);
    } else if (validExerciseNames.value.has(t)) {
      pickTrainingExercise(i, t);
    } else {
      const resolved = resolveExerciseNameFromInput(
        t,
        validExerciseNames.value,
        exerciseNamesList.value,
      );
      if (resolved) pickTrainingExercise(i, resolved);
    }
  }
}

async function persistSets() {
  const key = ymd(currentDate.value);
  const r = await saveTrainingDay(
    key,
    sets.value.map((s) => ({ ...s })),
  );
  if (!r.ok) {
    persistError.value = r.message;
    return;
  }
  persistError.value = null;
}

async function loadSetsForCurrentDate() {
  const key = ymd(currentDate.value);
  const raw = await getTrainingDay(key);
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    sets.value = [emptySet()];
  } else {
    sets.value = raw.map((x) => normalizeStoredSet(x));
  }
}

async function applySessionTemplate(sessionId: string) {
  if (!sessionId || sessionId === SOURCE_NEW) return;
  const sess = kintoreSessions.getSession(sessionId);
  if (!sess) return;
  const names = (sess.exercises || []).filter((n) =>
    exerciseCatalog.isValidName(String(n).trim()),
  );
  sets.value =
    names.length > 0
      ? names.map((exercise) => ({ exercise, weight: "", reps: "" }))
      : [emptySet()];
  await persistSets();
}

function hasAnySetInput() {
  return sets.value.some((s) => {
    if (String(s.exercise ?? "").trim() !== "") return true;
    if (s.weight !== "" && s.weight != null) return true;
    if (s.reps !== "" && s.reps != null) return true;
    return false;
  });
}

async function onSessionSourceChange() {
  const v = sessionSource.value;
  const prev = lastSessionSourceValue.value;
  if (v === prev) return;
  if (v === SOURCE_NEW) {
    lastSessionSourceValue.value = v;
    savePreferredSessionToStorage(SOURCE_NEW);
    return;
  }
  if (hasAnySetInput()) {
    const ok = window.confirm(
      "入力中の情報が全て削除されますがいいでしょうか。",
    );
    if (!ok) {
      sessionSource.value = prev;
      return;
    }
  }
  await applySessionTemplate(v);
  lastSessionSourceValue.value = v;
  savePreferredSessionToStorage(v);
}

function addSet() {
  sets.value.push(emptySet());
  void persistSets();
}

function removeSet(i: number) {
  sets.value.splice(i, 1);
  if (sets.value.length === 0) sets.value.push(emptySet());
  void persistSets();
}

function formatWeightForInput(w: number | "") {
  if (w === "" || w == null) return "";
  return String(w);
}

function formatRepsForInput(r: number | "") {
  if (r === "" || r == null) return "";
  return String(r);
}

function onWeightChange(i: number, raw: string) {
  const num = raw === "" ? "" : Number(raw);
  sets.value[i].weight = Number.isFinite(num as number) ? (num as number) : "";
  void persistSets();
}

function onRepsChange(i: number, raw: string) {
  const num = raw === "" ? "" : parseInt(raw, 10);
  sets.value[i].reps = Number.isFinite(num as number) ? (num as number) : "";
  void persistSets();
}

function onWeightInput(i: number, e: Event) {
  onWeightChange(i, (e.target as HTMLInputElement).value);
}

function onRepsInput(i: number, e: Event) {
  onRepsChange(i, (e.target as HTMLInputElement).value);
}

function exerciseGuideUrl(ex: string) {
  const n = normalizeExercise(ex);
  if (!n) return null;
  const url = exerciseCatalog.guideUrl(n);
  return url || null;
}

const dateDisplay = computed(() => formatHeaderDate(currentDate.value));

const trainingLogTo = computed(() => ({
  path: "/training-log",
  query: { month: ymd(currentDate.value).slice(0, 7) },
}));

const calendarTitle = computed(() =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(calendarViewMonth.value),
);

function monthFirst(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(12, 0, 0, 0);
  return x;
}

type CalCell =
  | { kind: "pad" }
  | { kind: "day"; key: string; day: number; selected: boolean; today: boolean };

const currentKey = computed(() => ymd(currentDate.value));

const calendarCells = computed((): CalCell[] => {
  const y = calendarViewMonth.value.getFullYear();
  const m = calendarViewMonth.value.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayKey = ymd(today);
  const selectedKey = currentKey.value;

  const parts: CalCell[] = [];
  for (let i = 0; i < firstDow; i += 1) parts.push({ kind: "pad" });
  for (let day = 1; day <= dim; day += 1) {
    const cell = new Date(y, m, day);
    cell.setHours(12, 0, 0, 0);
    const key = ymd(cell);
    parts.push({
      kind: "day",
      key,
      day,
      selected: key === selectedKey,
      today: key === todayKey,
    });
  }
  return parts;
});

function shiftCalendarMonth(delta: number) {
  const y = calendarViewMonth.value.getFullYear();
  const m = calendarViewMonth.value.getMonth() + delta;
  calendarViewMonth.value = new Date(y, m, 1);
  calendarViewMonth.value.setHours(12, 0, 0, 0);
}

function openCalendar() {
  calendarViewMonth.value = monthFirst(currentDate.value);
  calendarDialog.value?.showModal();
  calendarExpanded.value = true;
}

function closeCalendar() {
  calendarDialog.value?.close();
}

function selectCalendarDay(key: string) {
  const d = parseYmd(key);
  d.setHours(12, 0, 0, 0);
  currentDate.value = d;
  closeCalendar();
}

function goToday() {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  currentDate.value = t;
  closeCalendar();
}

function goDay(delta: number) {
  const d = new Date(currentDate.value);
  d.setDate(d.getDate() + delta);
  d.setHours(12, 0, 0, 0);
  currentDate.value = d;
}

async function onVisibility() {
  if (document.visibilityState === "visible") {
    await kintoreSessions.refresh();
    await exerciseCatalog.refresh();
    bumpSessionOptions();
    applyPreferredSessionIfValid();
  }
}

watch(
  () => [kintoreSessions.ready.value, user.value?.uid] as const,
  () => {
    if (!kintoreSessions.ready.value) return;
    applyPreferredSessionIfValid();
  },
  { immediate: true },
);

watch(currentDate, () => {
  persistError.value = null;
  clearExerciseComboTimer();
  exerciseComboOpenIndex.value = null;
  void loadSetsForCurrentDate();
});

onMounted(() => {
  void loadSetsForCurrentDate();
  const el = calendarDialog.value;
  if (el) {
    el.addEventListener("close", () => {
      calendarExpanded.value = false;
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) closeCalendar();
    });
  }
  document.addEventListener("visibilitychange", onVisibility);
});

onUnmounted(() => {
  clearExerciseComboTimer();
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <main class="main">
    <div class="training-title-row">
      <h1 class="page-title">トレーニングレコード</h1>
      <NuxtLink
        :to="trainingLogTo"
        class="training-cal-btn"
        aria-label="トレーニングログのカレンダーを開く"
      >
        <svg
          class="training-cal-btn__icon"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        カレンダー
      </NuxtLink>
    </div>

    <div class="app-header">
      <button type="button" class="nav-btn" aria-label="前の日" @click="goDay(-1)">
        ‹
      </button>
      <div class="header-date">
        <button
          type="button"
          class="date-picker-trigger"
          aria-haspopup="dialog"
          :aria-expanded="calendarExpanded ? 'true' : 'false'"
          aria-controls="calendar-dialog-training"
          @click="openCalendar"
        >
          <span class="date-label" aria-live="polite">{{ dateDisplay }}</span>
        </button>
      </div>
      <button type="button" class="nav-btn" aria-label="次の日" @click="goDay(1)">
        ›
      </button>
    </div>

    <section class="card training-source-card" aria-labelledby="training-source-heading">
      <h2 id="training-source-heading" class="section-title">セッションを選択</h2>
      <div class="field">
        <select
          id="training-source-select"
          v-model="sessionSource"
          class="training-select"
          aria-labelledby="training-source-heading"
          @change="onSessionSourceChange"
        >
          <option
            v-for="row in sessionOptions"
            :key="row.id"
            :value="row.id"
          >
            {{ row.title }}
          </option>
          <option :value="SOURCE_NEW">種目を自分で選ぶ</option>
        </select>
      </div>
    </section>

    <section class="card" aria-labelledby="training-sets-heading">
      <h2 id="training-sets-heading" class="section-title">この日のセット</h2>
      <div id="training-sets" class="training-sets">
        <div
          v-for="(s, i) in sets"
          :key="i"
          class="training-set"
          :data-set-index="i"
        >
          <div class="training-set__toolbar">
            <span class="training-set__num">セット {{ i + 1 }}</span>
            <button
              v-if="sets.length > 1"
              type="button"
              class="training-set__rm"
              :aria-label="`セット${i + 1}を削除`"
              @click="removeSet(i)"
            >
              削除
            </button>
          </div>
          <div class="field training-set__field-exercise">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--accent)" />
              トレーニング種目
            </span>
            <div
              class="session-exercise-combo"
              :class="{
                'session-exercise-combo--open': exerciseComboOpenIndex === i,
              }"
            >
              <input
                :id="`training-exercise-combo-${i}`"
                type="text"
                enterkeyhint="search"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                class="session-exercise-combo-input"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="
                  exerciseComboOpenIndex === i ? 'true' : 'false'
                "
                :aria-controls="`training-exercise-listbox-${i}`"
                :aria-label="`セット${i + 1}の種目を検索`"
                placeholder="種目を検索"
                :value="
                  exerciseComboOpenIndex === i ? exerciseComboQuery : s.exercise
                "
                @focus="onTrainingExerciseComboFocus(i)"
                @blur="onTrainingExerciseComboBlur"
                @input="onTrainingExerciseComboInput($event)"
                @keydown="onTrainingExerciseComboKeydown(i, $event)"
              />
              <ul
                v-show="exerciseComboOpenIndex === i"
                :id="`training-exercise-listbox-${i}`"
                class="session-exercise-combo-list"
                role="listbox"
                :aria-label="`セット${i + 1}の候補`"
                @mousedown.prevent
              >
                <li
                  v-for="name in filteredExerciseNamesForTraining"
                  :key="name"
                  class="session-exercise-combo-option"
                  role="option"
                  :aria-selected="s.exercise === name ? 'true' : 'false'"
                  @mousedown="pickTrainingExercise(i, name)"
                >
                  {{ name }}
                </li>
                <li
                  v-if="filteredExerciseNamesForTraining.length === 0"
                  class="session-exercise-combo-empty"
                  role="presentation"
                >
                  該当する種目がありません
                </li>
              </ul>
            </div>
            <div class="training-set__guide" aria-live="polite">
              <span
                v-if="!normalizeExercise(s.exercise)"
                class="training-set__guide-muted"
              >種目を選択するとフォーム解説が表示されます</span>
              <span
                v-else-if="!exerciseGuideUrl(s.exercise)"
                class="training-set__guide-muted"
              >この種目の解説リンクは未登録です</span>
              <a
                v-else
                :href="exerciseGuideUrl(s.exercise)!"
                class="training-set__guide-link"
                target="_blank"
                rel="noopener noreferrer"
              >フォーム解説を見る</a>
            </div>
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-weight)" />
              重量<span class="unit">（kg）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              data-training="weight"
              placeholder="—"
              :value="formatWeightForInput(s.weight)"
              @change="onWeightInput(i, $event)"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-protein)" />
              回数<span class="unit">（回）</span>
            </span>
            <input
              type="number"
              inputmode="numeric"
              step="1"
              min="0"
              data-training="reps"
              placeholder="—"
              :value="formatRepsForInput(s.reps)"
              @change="onRepsInput(i, $event)"
            />
          </div>
        </div>
      </div>
      <button
        id="btn-add-set"
        type="button"
        class="training-add-set"
        @click="addSet"
      >
        ＋ セットを追加
      </button>
      <p v-if="persistError" class="firestore-alert" role="alert">
        {{ persistError }}
      </p>
    </section>
  </main>

  <dialog
    id="calendar-dialog-training"
    ref="calendarDialog"
    class="calendar-dialog"
    aria-labelledby="calendar-title-training"
  >
    <div class="calendar-sheet">
      <div class="calendar-toolbar">
        <button
          type="button"
          class="cal-nav-btn"
          aria-label="前の月"
          @click="shiftCalendarMonth(-1)"
        >
          ‹
        </button>
        <h2 id="calendar-title-training" class="calendar-title">
          {{ calendarTitle }}
        </h2>
        <button
          type="button"
          class="cal-nav-btn"
          aria-label="次の月"
          @click="shiftCalendarMonth(1)"
        >
          ›
        </button>
      </div>
      <div class="calendar-weekdays">
        <span>日</span><span>月</span><span>火</span><span>水</span
        ><span>木</span><span>金</span><span>土</span>
      </div>
      <div class="calendar-grid">
        <template v-for="(c, i) in calendarCells" :key="i">
          <span v-if="c.kind === 'pad'" class="cal-pad" aria-hidden="true" />
          <button
            v-else
            type="button"
            class="cal-day"
            :class="{
              'cal-day--selected': c.selected,
              'cal-day--today': c.today,
            }"
            :aria-label="`${c.day}日`"
            :aria-pressed="c.selected ? 'true' : 'false'"
            @click="selectCalendarDay(c.key)"
          >
            {{ c.day }}
          </button>
        </template>
      </div>
      <div class="calendar-footer">
        <button type="button" class="cal-today-btn" @click="goToday">
          今日
        </button>
        <button type="button" class="cal-close-btn" @click="closeCalendar">
          閉じる
        </button>
      </div>
    </div>
  </dialog>
</template>

<style>
@import "~/assets/css/training.css";
</style>
