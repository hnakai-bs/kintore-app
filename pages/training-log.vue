<script setup lang="ts">
const exerciseCatalog = useTrainingExerciseCatalog();
const exerciseNamesList = computed(() => exerciseCatalog.names.value);

const EXERCISE_CHIP_STYLES = [
  { bg: "#e8f0fe", color: "#1967d2" },
  { bg: "#e6f4ea", color: "#137333" },
  { bg: "#fef7e0", color: "#b06000" },
  { bg: "#f3e8fd", color: "#7c2f9f" },
  { bg: "#fce8e6", color: "#c5221f" },
];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** カレンダーグリッドに表示される全日付の [startYmd, endYmd]（Firestore range 用） */
function monthGridYmdRange(viewMonth: Date): { startYmd: string; endYmd: string } {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();

  let start: Date;
  if (firstDow > 0) {
    const startDay = prevDim - firstDow + 1;
    start = new Date(y, m - 1, startDay);
  } else {
    start = new Date(y, m, 1);
  }
  start.setHours(12, 0, 0, 0);

  const rem = (firstDow + dim) % 7;
  const pad = rem === 0 ? 0 : 7 - rem;
  const end =
    pad === 0
      ? new Date(y, m, dim)
      : new Date(y, m + 1, pad);
  end.setHours(12, 0, 0, 0);

  return { startYmd: ymd(start), endYmd: ymd(end) };
}

function normalizeExercise(v: unknown) {
  const s = v != null ? String(v).trim() : "";
  if (s === "" || exerciseCatalog.isValidName(s)) return s;
  return "";
}

function hasRepsEntered(row: unknown) {
  if (!row || typeof row !== "object") return false;
  const r = (row as { reps?: unknown }).reps;
  if (r === "" || r == null) return false;
  const n = parseInt(String(r), 10);
  return Number.isFinite(n);
}

function topDistinctExercises(
  key: string,
  entries: Record<string, unknown[]>,
) {
  const raw = entries[key];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    if (!hasRepsEntered(row)) continue;
    const ex = normalizeExercise((row as { exercise?: unknown }).exercise);
    if (!ex) continue;
    if (seen.has(ex)) continue;
    seen.add(ex);
    out.push(ex);
    if (out.length >= 3) break;
  }
  return out;
}

function chipStyle(name: string) {
  const i = exerciseNamesList.value.indexOf(name);
  const idx = i >= 0 ? i : 0;
  return EXERCISE_CHIP_STYLES[idx % EXERCISE_CHIP_STYLES.length];
}

useHead({ title: "トレーニングログ" });

const trainingFs = useTrainingFirestore();
const route = useRoute();
const router = useRouter();

const monthPickerDialog = ref<HTMLDialogElement | null>(null);
const monthPickerExpanded = ref(false);
const pickerYear = ref(new Date().getFullYear());

const viewMonth = ref(new Date());
viewMonth.value.setDate(1);
viewMonth.value.setHours(12, 0, 0, 0);

const monthQ = route.query.month;
if (typeof monthQ === "string" && /^\d{4}-\d{2}$/.test(monthQ)) {
  const [yy, mm] = monthQ.split("-").map(Number);
  if (mm >= 1 && mm <= 12) {
    const d = new Date(yy, mm - 1, 1);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(12, 0, 0, 0);
      viewMonth.value = d;
    }
  }
}

const tick = ref(0);
const entries = ref<Record<string, unknown[]>>({});

const monthTitle = computed(() =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(viewMonth.value),
);

type Cell = {
  key: string;
  dayNum: number;
  muted: boolean;
  isToday: boolean;
  chips: string[];
};

const cells = computed((): Cell[] => {
  tick.value;
  const e = entries.value;
  const y = viewMonth.value.getFullYear();
  const m = viewMonth.value.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayKey = ymd(today);

  const parts: Cell[] = [];

  for (let i = 0; i < firstDow; i += 1) {
    const day = prevDim - firstDow + i + 1;
    const d = new Date(y, m - 1, day);
    d.setHours(12, 0, 0, 0);
    parts.push({
      key: ymd(d),
      dayNum: day,
      muted: true,
      isToday: ymd(d) === todayKey,
      chips: topDistinctExercises(ymd(d), e),
    });
  }

  for (let day = 1; day <= dim; day += 1) {
    const d = new Date(y, m, day);
    d.setHours(12, 0, 0, 0);
    const key = ymd(d);
    parts.push({
      key,
      dayNum: day,
      muted: false,
      isToday: key === todayKey,
      chips: topDistinctExercises(key, e),
    });
  }

  const rem = parts.length % 7;
  const pad = rem === 0 ? 0 : 7 - rem;
  for (let i = 0; i < pad; i += 1) {
    const day = i + 1;
    const d = new Date(y, m + 1, day);
    d.setHours(12, 0, 0, 0);
    const key = ymd(d);
    parts.push({
      key,
      dayNum: day,
      muted: true,
      isToday: key === todayKey,
      chips: topDistinctExercises(key, e),
    });
  }

  return parts;
});

async function loadVisibleRange() {
  const { startYmd, endYmd } = monthGridYmdRange(viewMonth.value);
  entries.value = await trainingFs.fetchRange(startYmd, endYmd);
  tick.value += 1;
}

function shiftMonth(delta: number) {
  const y = viewMonth.value.getFullYear();
  const m = viewMonth.value.getMonth() + delta;
  viewMonth.value = new Date(y, m, 1);
  viewMonth.value.setHours(12, 0, 0, 0);
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function openMonthPicker() {
  pickerYear.value = viewMonth.value.getFullYear();
  monthPickerExpanded.value = true;
  monthPickerDialog.value?.showModal();
}

function closeMonthPicker() {
  monthPickerDialog.value?.close();
  monthPickerExpanded.value = false;
}

function shiftPickerYear(delta: number) {
  const next = pickerYear.value + delta;
  pickerYear.value = Math.min(2100, Math.max(2000, next));
}

function applyPickerMonth(monthIndex: number) {
  const d = new Date(pickerYear.value, monthIndex, 1);
  d.setHours(12, 0, 0, 0);
  viewMonth.value = d;
  closeMonthPicker();
}

watch(viewMonth, (vm) => {
  void loadVisibleRange();
  const key = monthKeyFromDate(vm);
  if (String(route.query.month || "") !== key) {
    void router.replace({ path: "/training-log", query: { month: key } });
  }
});

watch(
  () => route.query.month,
  (m) => {
    if (typeof m !== "string" || !/^\d{4}-\d{2}$/.test(m)) return;
    const [yy, mm] = m.split("-").map(Number);
    if (mm < 1 || mm > 12) return;
    const d = new Date(yy, mm - 1, 1);
    if (Number.isNaN(d.getTime())) return;
    d.setHours(12, 0, 0, 0);
    const cur = viewMonth.value;
    if (
      cur.getFullYear() === d.getFullYear() &&
      cur.getMonth() === d.getMonth()
    ) {
      return;
    }
    viewMonth.value = d;
  },
);

onMounted(() => {
  void loadVisibleRange();
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibility);
  const dlg = monthPickerDialog.value;
  if (dlg) {
    dlg.addEventListener("close", () => {
      monthPickerExpanded.value = false;
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) closeMonthPicker();
    });
  }
});

onUnmounted(() => {
  window.removeEventListener("pageshow", onPageShow);
  document.removeEventListener("visibilitychange", onVisibility);
});

function onPageShow(e: PageTransitionEvent) {
  if (e.persisted) void loadVisibleRange();
}

async function onVisibility() {
  if (document.visibilityState !== "visible") return;
  await exerciseCatalog.refresh();
  void loadVisibleRange();
}
</script>

<template>
  <main class="main">
    <h1 class="page-title">トレーニングログ</h1>

    <div class="app-header tl-cal-toolbar" role="toolbar" aria-label="表示月">
      <button
        id="tl-prev-month"
        type="button"
        class="nav-btn"
        aria-label="前の月"
        @click="shiftMonth(-1)"
      >
        ‹
      </button>
      <div class="header-date">
        <button
          id="tl-month-title"
          type="button"
          class="date-picker-trigger"
          aria-haspopup="dialog"
          :aria-expanded="monthPickerExpanded ? 'true' : 'false'"
          aria-controls="tl-month-picker-dialog"
          @click="openMonthPicker"
        >
          <span class="date-label">{{ monthTitle }}</span>
        </button>
      </div>
      <button
        id="tl-next-month"
        type="button"
        class="nav-btn"
        aria-label="次の月"
        @click="shiftMonth(1)"
      >
        ›
      </button>
    </div>

    <div id="tl-cal-grid" class="tl-cal-grid">
      <NuxtLink
        v-for="(c, i) in cells"
        :key="i"
        class="tl-cell"
        :class="{
          'tl-cell--muted': c.muted,
          'tl-cell--today': c.isToday,
        }"
        :to="{ path: '/training', query: { date: c.key } }"
        :aria-label="`${c.dayNum}日、トレーニングを記録`"
      >
        <span class="tl-cell__num">{{ c.dayNum }}</span>
        <div class="tl-cell__chips">
          <span
            v-for="name in c.chips"
            :key="name"
            class="tl-chip"
            :style="{
              background: chipStyle(name).bg,
              color: chipStyle(name).color,
            }"
          >{{ name }}</span>
        </div>
      </NuxtLink>
    </div>
  </main>

  <dialog
    id="tl-month-picker-dialog"
    ref="monthPickerDialog"
    class="calendar-dialog"
    aria-labelledby="tl-month-picker-title"
  >
    <div class="calendar-sheet">
      <div class="calendar-toolbar">
        <button
          type="button"
          class="cal-nav-btn"
          aria-label="前年"
          @click="shiftPickerYear(-1)"
        >
          ‹
        </button>
        <h2 id="tl-month-picker-title" class="calendar-title">
          {{ pickerYear }}年
        </h2>
        <button
          type="button"
          class="cal-nav-btn"
          aria-label="翌年"
          @click="shiftPickerYear(1)"
        >
          ›
        </button>
      </div>
      <div class="tl-month-picker-grid" role="listbox" aria-label="月を選択">
        <button
          v-for="mi in 12"
          :key="mi"
          type="button"
          class="tl-month-picker-cell"
          :class="{
            'tl-month-picker-cell--selected':
              viewMonth.getFullYear() === pickerYear &&
              viewMonth.getMonth() === mi - 1,
          }"
          role="option"
          :aria-selected="
            viewMonth.getFullYear() === pickerYear &&
            viewMonth.getMonth() === mi - 1
              ? 'true'
              : 'false'
          "
          @click="applyPickerMonth(mi - 1)"
        >
          {{ mi }}月
        </button>
      </div>
      <div class="calendar-footer tl-month-picker-footer">
        <button type="button" class="cal-close-btn" @click="closeMonthPicker">
          閉じる
        </button>
      </div>
    </div>
  </dialog>
</template>

<style>
@import "~/assets/css/training-log.css";
</style>
