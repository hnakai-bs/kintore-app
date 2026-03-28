<script setup lang="ts">
import { bodyPartCalendarChipStyle } from "~/utils/trainingBodyPartColors";

const { getDay: getTrainingDay, saveDay: saveTrainingDay } =
  useTrainingFirestore();
const kintoreSessions = useKintoreSessions();
const exerciseCatalog = useTrainingExerciseCatalog();
const { user } = useFirebaseAuth();

const SOURCE_NEW = "__new__";

const DAY_MEMO_MAX = 300;

function clampDayMemo(s: string) {
  if (s.length <= DAY_MEMO_MAX) return s;
  return s.slice(0, DAY_MEMO_MAX);
}

type SetRow = { exercise: string; weight: number | ""; reps: number | "" };

/** 画面上の並び（配列順・連続する同一種目は1ブロック） */
type TrainingBlock =
  | { type: "exercise"; name: string; indices: number[] }
  | { type: "draft"; indices: number[] };

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

/** 戻る／リンクで query.date だけ変わったときも日付を合わせる（再マウントしないケース向け） */
watch(
  () => route.query.date,
  (d) => {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (d === ymd(currentDate.value)) return;
    const parsed = parseYmd(d);
    if (Number.isNaN(parsed.getTime())) return;
    parsed.setHours(12, 0, 0, 0);
    currentDate.value = parsed;
  },
);

const calendarViewMonth = ref(new Date(currentDate.value));
const calendarDialog = ref<HTMLDialogElement | null>(null);
const calendarExpanded = ref(false);
const persistError = ref<string | null>(null);

const sessionSource = ref(SOURCE_NEW);
const lastSessionSourceValue = ref(SOURCE_NEW);

/** 日付（YYYY-MM-DD）ごとのセッション選択。値はセッションID または SOURCE_NEW */
const SESSION_BY_DATE_STORAGE_PREFIX = "kintore-training-session-by-date";

function sessionByDateStorageKey(): string | null {
  const uid = user.value?.uid;
  return uid ? `${SESSION_BY_DATE_STORAGE_PREFIX}:${uid}` : null;
}

function loadAllSessionChoices(): Record<string, string> {
  const key = sessionByDateStorageKey();
  if (!key || import.meta.server) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return o as Record<string, string>;
  } catch {
    return {};
  }
}

function saveAllSessionChoices(map: Record<string, string>) {
  const key = sessionByDateStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

function loadSessionChoiceForDate(dateYmd: string): string {
  const map = loadAllSessionChoices();
  const v = map[dateYmd];
  return typeof v === "string" && v !== "" ? v : SOURCE_NEW;
}

function saveSessionChoiceForDate(dateYmd: string, sessionId: string) {
  const map = loadAllSessionChoices();
  map[dateYmd] = sessionId;
  saveAllSessionChoices(map);
}

/** 旧グローバル1件だけの保存から、初回のみ現在表示日へ引き継ぐ */
function migrateLegacyGlobalPreferenceOnce(dateYmd: string) {
  if (import.meta.server) return;
  const uid = user.value?.uid;
  if (!uid) return;
  const map = loadAllSessionChoices();
  if (Object.keys(map).length > 0) return;
  try {
    const oldKey = `kintore-preferred-training-session:${uid}`;
    const legacy = localStorage.getItem(oldKey);
    if (legacy == null || legacy === "" || legacy === SOURCE_NEW) return;
    saveAllSessionChoices({ [dateYmd]: legacy });
    localStorage.removeItem(oldKey);
  } catch {
    /* ignore */
  }
}

/** 現在の記録日に保存されているセッションをドロップダウンに反映（セット内容は変更しない） */
function applyStoredSessionForCurrentDate() {
  const dateYmd = ymd(currentDate.value);
  migrateLegacyGlobalPreferenceOnce(dateYmd);

  let raw = loadSessionChoiceForDate(dateYmd);
  if (raw === SOURCE_NEW) {
    sessionSource.value = SOURCE_NEW;
    lastSessionSourceValue.value = SOURCE_NEW;
    return;
  }
  if (!kintoreSessions.ready.value) {
    sessionSource.value = raw;
    lastSessionSourceValue.value = raw;
    return;
  }
  if (!kintoreSessions.getSession(raw)) {
    saveSessionChoiceForDate(dateYmd, SOURCE_NEW);
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
const dayMemo = ref("");

let memoPersistTimer: ReturnType<typeof setTimeout> | null = null;

function clearMemoPersistTimer() {
  if (memoPersistTimer) {
    clearTimeout(memoPersistTimer);
    memoPersistTimer = null;
  }
}

function scheduleMemoPersist() {
  clearMemoPersistTimer();
  memoPersistTimer = setTimeout(() => {
    memoPersistTimer = null;
    void persistSets();
  }, 450);
}

function flushMemoPersist() {
  clearMemoPersistTimer();
  void persistSets();
}

/** iOS 等でキーボード「完了」後に下に空きスクロールが残るのを抑える */
function onTrainingDayMemoBlur() {
  flushMemoPersist();
  if (import.meta.server) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.scrollingElement ?? document.documentElement;
        const max = Math.max(0, root.scrollHeight - window.innerHeight);
        if (root.scrollTop > max) root.scrollTop = max;
      });
    });
  });
}

const trainingBlocks = computed((): TrainingBlock[] => {
  const blocks: TrainingBlock[] = [];
  let current: TrainingBlock | null = null;
  for (let i = 0; i < sets.value.length; i++) {
    const ex = normalizeExercise(sets.value[i]!.exercise);
    if (!ex) {
      if (current?.type === "draft") {
        current.indices.push(i);
      } else {
        current = { type: "draft", indices: [i] };
        blocks.push(current);
      }
    } else if (current?.type === "exercise" && current.name === ex) {
      current.indices.push(i);
    } else {
      current = { type: "exercise", name: ex, indices: [i] };
      blocks.push(current);
    }
  }
  return blocks;
});

/** 一覧から開いた種目ブロックの先頭行インデックス（null = 一覧表示） */
const detailAnchorIndex = ref<number | null>(null);

const detailBlockIndices = computed((): number[] | null => {
  const i0 = detailAnchorIndex.value;
  if (i0 == null || i0 < 0 || i0 >= sets.value.length) return null;
  const name = normalizeExercise(sets.value[i0]!.exercise);
  if (!name) return null;
  const out: number[] = [];
  for (let i = i0; i < sets.value.length; i++) {
    if (normalizeExercise(sets.value[i]!.exercise) === name) out.push(i);
    else break;
  }
  return out.length ? out : null;
});

const detailBlock = computed(() => {
  const indices = detailBlockIndices.value;
  if (!indices?.length) return null;
  const name = normalizeExercise(sets.value[indices[0]!]!.exercise);
  if (!name) return null;
  return { name, indices };
});

/** そのセット行が「重量・回数ともに記入済み」か（一覧の入力済み表示用） */
function setRowHasWeightAndReps(row: SetRow): boolean {
  if (row.weight === "" || row.weight == null) return false;
  const w = Number(row.weight);
  if (!Number.isFinite(w)) return false;
  if (row.reps === "" || row.reps == null) return false;
  const r = typeof row.reps === "number" ? row.reps : parseInt(String(row.reps), 10);
  return Number.isFinite(r) && r >= 0;
}

function exerciseBlockHasAnyLoggedSet(indices: number[]): boolean {
  for (const i of indices) {
    const row = sets.value[i];
    if (row && setRowHasWeightAndReps(row)) return true;
  }
  return false;
}

const exerciseListEntries = computed(() => {
  const entries: {
    anchorIndex: number;
    name: string;
    hasLoggedSets: boolean;
  }[] = [];
  for (const block of trainingBlocks.value) {
    if (block.type === "exercise") {
      entries.push({
        anchorIndex: block.indices[0]!,
        name: block.name,
        hasLoggedSets: exerciseBlockHasAnyLoggedSet(block.indices),
      });
    }
  }
  return entries;
});

/** トレーニングログの日セルチップと同じ色（部位ラベル→背景・文字色） */
function bodyPartChipStyleProps(exerciseName: string) {
  const s = bodyPartCalendarChipStyle(exerciseCatalog.bodyPart(exerciseName));
  return { background: s.bg, color: s.color };
}

function openExerciseDetail(anchorIndex: number) {
  detailAnchorIndex.value = anchorIndex;
}

function closeExerciseDetail() {
  detailAnchorIndex.value = null;
}

watch(detailBlock, (b) => {
  if (detailAnchorIndex.value != null && !b) detailAnchorIndex.value = null;
});

const shortDateDisplay = computed(() =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(currentDate.value),
);

async function persistSets() {
  const key = ymd(currentDate.value);
  const r = await saveTrainingDay(
    key,
    sets.value.map((s) => ({ ...s })),
    clampDayMemo(dayMemo.value),
  );
  if (!r.ok) {
    persistError.value = r.message;
    return;
  }
  persistError.value = null;
}

async function loadSetsForCurrentDate() {
  const key = ymd(currentDate.value);
  const data = await getTrainingDay(key);
  if (!data) {
    sets.value = [emptySet()];
    dayMemo.value = "";
  } else {
    dayMemo.value = clampDayMemo(data.memo);
    const arr = data.sets;
    if (!Array.isArray(arr) || arr.length === 0) {
      sets.value = [emptySet()];
    } else {
      sets.value = arr.map((x) => normalizeStoredSet(x));
    }
  }
  ensureMinSetsBatch();
  applyStoredSessionForCurrentDate();
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
  ensureMinSetsBatch();
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
    if (hasAnySetInput()) {
      const ok = window.confirm(
        "入力中の情報が全て削除されますがいいでしょうか。",
      );
      if (!ok) {
        sessionSource.value = prev;
        return;
      }
      sets.value = [emptySet()];
      await persistSets();
      ensureMinSetsBatch();
    }
    lastSessionSourceValue.value = v;
    saveSessionChoiceForDate(ymd(currentDate.value), SOURCE_NEW);
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
  saveSessionChoiceForDate(ymd(currentDate.value), v);
}

/** 各種目で最初から並べるセット数 */
const MIN_SETS_PER_EXERCISE_DETAIL = 3;

/** 同一種目が min 未満なら、その種目ブロックの直後に空セットを足す（並び順を保つ） */
function ensureMinSetsForExercise(name: string, min: number): boolean {
  const n = normalizeExercise(name);
  if (!n) return false;
  const indices: number[] = [];
  sets.value.forEach((s, i) => {
    if (normalizeExercise(s.exercise) === n) indices.push(i);
  });
  if (indices.length >= min) return false;
  const need = min - indices.length;
  const insertAfter =
    indices.length > 0 ? Math.max(...indices) : sets.value.length - 1;
  const newRows: SetRow[] = Array.from({ length: need }, () => ({
    exercise: n,
    weight: "",
    reps: "",
  }));
  sets.value.splice(insertAfter + 1, 0, ...newRows);
  sets.value = [...sets.value];
  void persistSets();
  return true;
}

/** 読み込み・セッション適用後：登録済みの全種目を最低セット数にそろえる（1回だけ保存） */
function ensureMinSetsBatch() {
  const names = new Set<string>();
  for (const row of sets.value) {
    const ex = normalizeExercise(row.exercise);
    if (ex) names.add(ex);
  }
  let any = false;
  for (const name of names) {
    const n = name;
    const indices: number[] = [];
    sets.value.forEach((s, i) => {
      if (normalizeExercise(s.exercise) === n) indices.push(i);
    });
    if (indices.length >= MIN_SETS_PER_EXERCISE_DETAIL) continue;
    const need = MIN_SETS_PER_EXERCISE_DETAIL - indices.length;
    const insertAfter =
      indices.length > 0 ? Math.max(...indices) : sets.value.length - 1;
    const newRows: SetRow[] = Array.from({ length: need }, () => ({
      exercise: n,
      weight: "",
      reps: "",
    }));
    sets.value.splice(insertAfter + 1, 0, ...newRows);
    any = true;
  }
  if (any) {
    sets.value = [...sets.value];
    void persistSets();
  }
}

function addSetForExercise(name: string) {
  const n = normalizeExercise(name);
  if (!n) return;
  const indices: number[] = [];
  sets.value.forEach((s, i) => {
    if (normalizeExercise(s.exercise) === n) indices.push(i);
  });
  const insertAfter =
    indices.length > 0 ? Math.max(...indices) : sets.value.length - 1;
  sets.value.splice(insertAfter + 1, 0, {
    exercise: n,
    weight: "",
    reps: "",
  });
  sets.value = [...sets.value];
  void persistSets();
}

function removeSet(i: number) {
  sets.value.splice(i, 1);
  if (sets.value.length === 0) sets.value.push(emptySet());
  void persistSets();
}

function removeSetAt(i: number) {
  removeSet(i);
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

function clearWeightAt(i: number) {
  sets.value[i]!.weight = "";
  void persistSets();
}

function clearRepsAt(i: number) {
  sets.value[i]!.reps = "";
  void persistSets();
}

/** 同一種目ブロック内で、直前のセットの重量・回数をコピー（2セット目以降） */
function copyPrevSetInGroup(
  indices: number[],
  posInGroup: number,
) {
  const prev = indices[posInGroup - 1];
  const cur = indices[posInGroup];
  if (prev == null || cur == null) return;
  const pRow = sets.value[prev];
  const cRow = sets.value[cur];
  if (!pRow || !cRow) return;
  cRow.weight = pRow.weight === "" || pRow.weight == null ? "" : pRow.weight;
  cRow.reps = pRow.reps === "" || pRow.reps == null ? "" : pRow.reps;
  sets.value = [...sets.value];
  void persistSets();
}

function exerciseGuideUrl(ex: string) {
  const n = normalizeExercise(ex);
  if (!n) return null;
  const url = exerciseCatalog.guideUrl(n);
  return url || null;
}

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
    applyStoredSessionForCurrentDate();
  }
}

watch(
  () => [kintoreSessions.ready.value, user.value?.uid] as const,
  () => {
    if (!kintoreSessions.ready.value) return;
    applyStoredSessionForCurrentDate();
  },
  { immediate: true },
);

watch(currentDate, async (_newDate, oldDate) => {
  persistError.value = null;
  clearMemoPersistTimer();
  detailAnchorIndex.value = null;

  if (oldDate) {
    const key = ymd(oldDate);
    const r = await saveTrainingDay(
      key,
      sets.value.map((s) => ({ ...s })),
      clampDayMemo(dayMemo.value),
    );
    if (!r.ok) persistError.value = r.message;
    else persistError.value = null;
  }

  await loadSetsForCurrentDate();
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
  flushMemoPersist();
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <main class="main training-page">
    <div class="training-page__top">
      <div class="training-page__title-row training-title-row">
        <h1 class="training-page__title">トレーニング</h1>
        <NuxtLink
          v-if="!detailBlock"
          :to="trainingLogTo"
          class="training-cal-btn"
          aria-label="トレーニングログ（カレンダー）へ"
        >
          <svg
            class="training-cal-btn__icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>カレンダー</span>
        </NuxtLink>
      </div>
      <div v-if="detailBlock" class="training-page__detail-nav">
        <button
          type="button"
          class="training-back-btn"
          aria-label="種目一覧に戻る"
          @click="closeExerciseDetail"
        >
          <span class="training-back-btn__chev" aria-hidden="true">‹</span>
          <span>戻る</span>
        </button>
      </div>
    </div>

    <div
      v-if="!detailBlock"
      class="app-header"
      role="group"
      aria-label="記録する日"
    >
      <button
        type="button"
        class="nav-btn"
        aria-label="前の日"
        @click="goDay(-1)"
      >
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
          <span class="date-label" aria-live="polite">{{ shortDateDisplay }}</span>
        </button>
      </div>
      <button
        type="button"
        class="nav-btn"
        aria-label="次の日"
        @click="goDay(1)"
      >
        ›
      </button>
    </div>

    <section
      class="card training-entry-card"
      aria-labelledby="training-entry-heading"
    >
      <template v-if="detailBlock">
        <div class="training-detail-card">
          <div class="training-detail-title-row">
            <h2
              id="training-entry-heading"
              class="training-detail-title"
            >
              {{ detailBlock.name }}
            </h2>
            <span
              class="training-bodypart-chip training-bodypart-chip--log"
              :style="bodyPartChipStyleProps(detailBlock.name)"
            >{{ exerciseCatalog.bodyPart(detailBlock.name) }}</span>
          </div>
          <div class="training-detail-guide" aria-live="polite">
            <span
              v-if="!exerciseGuideUrl(detailBlock.name)"
              class="training-set__guide-muted"
            >解説リンク未登録</span>
            <a
              v-else
              :href="exerciseGuideUrl(detailBlock.name)!"
              class="training-set__guide-link"
              target="_blank"
              rel="noopener noreferrer"
            >フォーム解説</a>
          </div>
          <div
            class="training-set-log"
            role="table"
            :aria-label="`${detailBlock.name}のセット`"
          >
            <div
              class="training-set-log__row training-set-log__row--head"
              role="row"
            >
              <span
                class="training-set-log__cell training-set-log__cell--set"
                role="columnheader"
              >set</span>
              <span
                class="training-set-log__cell training-set-log__cell--copy"
                role="columnheader"
                aria-hidden="true"
              />
              <span class="training-set-log__cell" role="columnheader">重量</span>
              <span class="training-set-log__cell" role="columnheader">回数</span>
              <span
                class="training-set-log__cell training-set-log__cell--rm"
                role="columnheader"
                aria-hidden="true"
              />
            </div>
            <div
              v-for="(globalIdx, pos) in detailBlock.indices"
              :key="globalIdx"
              class="training-set-log__row"
              role="row"
              :data-set-index="globalIdx"
            >
              <span
                class="training-set-log__cell training-set-log__cell--set"
                role="cell"
              >{{ pos + 1 }}</span>
              <div
                class="training-set-log__cell training-set-log__cell--copy"
                role="cell"
              >
                <button
                  v-if="pos > 0"
                  type="button"
                  class="training-set-log__copy"
                  aria-label="前のセットの重量と回数をコピー"
                  @click="copyPrevSetInGroup(detailBlock.indices, pos)"
                >
                  <svg
                    class="training-set-log__copy-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h10.5a4.5 4.5 0 0 1 0 9H11" />
                  </svg>
                </button>
              </div>
              <div
                class="training-set-log__cell training-set-log__cell--field"
                role="cell"
              >
                <div class="training-inline-input">
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.1"
                    class="training-inline-input__input"
                    data-training="weight"
                    placeholder="—"
                    :value="formatWeightForInput(sets[globalIdx]!.weight)"
                    @change="onWeightInput(globalIdx, $event)"
                  >
                  <button
                    type="button"
                    class="training-inline-input__clear"
                    aria-label="重量をクリア"
                    @click="clearWeightAt(globalIdx)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div
                class="training-set-log__cell training-set-log__cell--field"
                role="cell"
              >
                <div class="training-inline-input">
                  <input
                    type="number"
                    inputmode="numeric"
                    step="1"
                    min="0"
                    class="training-inline-input__input"
                    data-training="reps"
                    placeholder="—"
                    :value="formatRepsForInput(sets[globalIdx]!.reps)"
                    @change="onRepsInput(globalIdx, $event)"
                  >
                  <button
                    type="button"
                    class="training-inline-input__clear"
                    aria-label="回数をクリア"
                    @click="clearRepsAt(globalIdx)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div
                class="training-set-log__cell training-set-log__cell--rm"
                role="cell"
              >
                <button
                  v-if="sets.length > 1"
                  type="button"
                  class="training-set-log__rm"
                  :aria-label="`セット${pos + 1}を削除`"
                  @click="removeSetAt(globalIdx)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="training-add-set training-add-set--outline training-add-set--compact"
            @click="addSetForExercise(detailBlock.name)"
          >
            ＋ セットを追加
          </button>
          <div class="field training-day-memo-field">
            <label class="field-label" for="training-day-memo">メモ</label>
            <textarea
              id="training-day-memo"
              v-model="dayMemo"
              class="training-day-memo"
              maxlength="300"
              rows="7"
              enterkeyhint="done"
              autocomplete="off"
              placeholder="今日のメモ（任意・最大300文字）"
              @input="scheduleMemoPersist"
              @blur="onTrainingDayMemoBlur"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="field training-source-field">
          <span class="field-label">
            <span
              class="field-label-dot"
              style="background: var(--accent)"
            ></span>
            セッション選択
          </span>
          <select
            id="training-source-select"
            v-model="sessionSource"
            class="training-select"
            aria-label="セッション選択"
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

        <h2 id="training-entry-heading" class="training-entry-card__title">
          種目一覧
        </h2>

        <ul
          class="training-exercise-list"
          aria-label="この日の種目"
        >
          <li
            v-for="(entry, ei) in exerciseListEntries"
            :key="`${entry.anchorIndex}-${entry.name}-${ei}`"
            class="training-exercise-list__li"
          >
            <button
              type="button"
              class="training-exercise-list-item"
              :aria-label="
                entry.hasLoggedSets
                  ? `${entry.name}、入力済み`
                  : `${entry.name}、未入力`
              "
              @click="openExerciseDetail(entry.anchorIndex)"
            >
              <span class="training-exercise-list-item__name">{{
                entry.name
              }}</span>
              <span
                class="training-exercise-list-item__status-badge"
                :class="
                  entry.hasLoggedSets
                    ? 'training-exercise-list-item__status-badge--done'
                    : 'training-exercise-list-item__status-badge--pending'
                "
                aria-hidden="true"
              >{{ entry.hasLoggedSets ? "済" : "未" }}</span>
              <span
                class="training-bodypart-chip training-bodypart-chip--log"
                :style="bodyPartChipStyleProps(entry.name)"
              >{{ exerciseCatalog.bodyPart(entry.name) }}</span>
              <span class="training-exercise-list-item__chev" aria-hidden="true"
              >›</span>
            </button>
          </li>
        </ul>
        <div class="training-pick-exercises-wrap">
          <NuxtLink
            class="training-add-set training-add-set--outline training-add-set--compact training-pick-exercises-link"
            :to="{
              path: '/exercises/by-part',
              query: { pick: '1', date: currentKey },
            }"
          >
            種目追加
          </NuxtLink>
        </div>
      </template>
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
