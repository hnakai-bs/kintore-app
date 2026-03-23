<script setup lang="ts">
import type { DisplayGoalKey } from "~/utils/displayGoalsFromProfile";
import {
  CONDITION_LEVEL_LABELS,
  conditionLabelWithEmoji,
  isConditionLevelLabel,
} from "~/utils/conditionLevels";

const { getDay, mergeDay } = useDailyFirestore();
const { goals: displayGoals, refresh: refreshDisplayGoals } =
  useKintoreDisplayGoals();

const GOAL_DEFS = [
  {
    key: "weight",
    label: "体重",
    unit: "kg",
    step: "0.1",
    iconSrc: "/icons/weight.png",
  },
  {
    key: "calories",
    label: "カロリー",
    unit: "kcal",
    step: "1",
    iconSrc: "/icons/calorie.png",
  },
  {
    key: "protein",
    label: "タンパク質",
    unit: "g",
    step: "1",
    iconSrc: "/icons/protein.png",
  },
  {
    key: "fat",
    label: "脂質",
    unit: "g",
    step: "1",
    iconSrc: "/icons/lipid.png",
  },
  {
    key: "carbs",
    label: "炭水化物",
    unit: "g",
    step: "1",
    iconSrc: "/icons/carbohydrates.png",
  },
  {
    key: "fiber",
    label: "食物繊維",
    unit: "g",
    step: "1",
    iconSrc: "/icons/dietary_fiber.png",
  },
  {
    key: "sleep",
    label: "睡眠時間",
    unit: "h",
    step: "0.1",
    iconSrc: "/icons/sleep.png",
  },
] as const;

const DAILY_DEFS = [
  ...GOAL_DEFS.map((d) => ({ ...d, type: "number" as const })),
  {
    key: "condition",
    label: "体調",
    unit: "",
    type: "condition" as const,
    iconSrc: "/icons/condition.png",
  },
];

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

useHead({ title: "コンディションレコード" });

const dayData = ref<Record<string, unknown>>({});
const currentDate = ref(new Date());
currentDate.value.setHours(12, 0, 0, 0);

const calendarViewMonth = ref(new Date(currentDate.value));
const calendarDialog = ref<HTMLDialogElement | null>(null);
const calendarExpanded = ref(false);
const persistError = ref<string | null>(null);

async function loadDayForCurrentDate() {
  const key = ymd(currentDate.value);
  dayData.value = await getDay(key);
}

watch(currentDate, () => {
  persistError.value = null;
  loadDayForCurrentDate();
});

async function setEntry(key: string, patch: Record<string, unknown>) {
  const prev = { ...dayData.value };
  dayData.value = { ...dayData.value, ...patch };
  const r = await mergeDay(key, patch);
  if (!r.ok) {
    persistError.value = r.message;
    dayData.value = prev;
    return;
  }
  persistError.value = null;
}

const dateDisplay = computed(() => formatHeaderDate(currentDate.value));
const currentKey = computed(() => ymd(currentDate.value));

const entry = computed(() => dayData.value);

function formatGoalNumber(n: number | undefined) {
  if (n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : String(n);
}

function goalRowValue(key: string) {
  return formatGoalNumber(displayGoals.value[key as DisplayGoalKey]);
}

function monthFirst(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(12, 0, 0, 0);
  return x;
}

const calendarTitle = computed(() =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(calendarViewMonth.value),
);

type CalCell =
  | { kind: "pad" }
  | { kind: "day"; key: string; day: number; selected: boolean; today: boolean };

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

function onNumberChange(keyField: string, raw: string) {
  const num = raw === "" ? "" : Number(raw);
  void setEntry(currentKey.value, {
    [keyField]: Number.isFinite(num as number) ? num : "",
  });
}

function onConditionSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  void setEntry(currentKey.value, { condition: v });
}

/** 旧データなど、定義外の文字列が残っている場合 */
const legacyConditionLabel = computed(() => {
  const v = entry.value.condition;
  if (v === undefined || v === null || v === "") return "";
  const s = String(v);
  return isConditionLevelLabel(s) ? "" : s;
});

const conditionSelectToneClass = computed(() => {
  const v = entry.value.condition;
  if (v === undefined || v === null || v === "") return "condition-select--tone-empty";
  const s = String(v);
  const map: Record<string, string> = {
    絶好調: "condition-select--tone-excellent",
    好調: "condition-select--tone-good",
    普通: "condition-select--tone-normal",
    不調: "condition-select--tone-poor",
    絶不調: "condition-select--tone-awful",
  };
  return map[s] ?? "condition-select--tone-empty";
});

function onVisibilityGoals() {
  if (document.visibilityState === "visible") void refreshDisplayGoals();
}

onMounted(() => {
  void refreshDisplayGoals();
  loadDayForCurrentDate();
  document.addEventListener("visibilitychange", onVisibilityGoals);
  const el = calendarDialog.value;
  if (!el) return;
  el.addEventListener("close", () => {
    calendarExpanded.value = false;
  });
  el.addEventListener("click", (e) => {
    if (e.target === el) closeCalendar();
  });
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityGoals);
});
</script>

<template>
  <main class="main">
    <h1 class="page-title">コンディションレコード</h1>
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
          aria-controls="calendar-dialog"
          @click="openCalendar"
        >
          <span class="date-label" aria-live="polite">{{ dateDisplay }}</span>
        </button>
      </div>
      <button type="button" class="nav-btn" aria-label="次の日" @click="goDay(1)">
        ›
      </button>
    </div>

    <section class="card goals-card" aria-labelledby="goals-heading">
      <details class="goals-accordion">
        <summary class="goals-accordion-summary" id="goals-heading">
          <span class="goals-accordion-title">目標</span>
        </summary>
        <div class="goals-accordion-panel">
          <div class="goals-grid">
            <div
              v-for="d in GOAL_DEFS"
              :key="d.key"
              class="goal-row"
              :data-goal="d.key"
            >
              <span class="field-label">
                <img class="field-label__icon" :src="d.iconSrc" alt="">
                {{ d.label }}<span class="unit">（{{ d.unit }}）</span>
              </span>
              <span class="goal-value">{{ goalRowValue(d.key) }}</span>
            </div>
          </div>
        </div>
      </details>
    </section>

    <section class="card" aria-labelledby="daily-heading">
      <h2 id="daily-heading" class="section-title">この日の記録</h2>
      <form class="daily-form" autocomplete="off" @submit.prevent>
        <div class="fields">
          <template v-for="d in DAILY_DEFS" :key="d.key">
            <div
              v-if="d.type === 'condition'"
              class="field"
              data-daily="condition"
            >
              <span class="field-label">
                <img class="field-label__icon" :src="d.iconSrc" alt="">
                {{ d.label }}
              </span>
              <select
                :id="'condition-select-' + currentKey"
                class="condition-select"
                :class="conditionSelectToneClass"
                aria-label="体調"
                :value="
                  entry.condition === undefined || entry.condition === null
                    ? ''
                    : String(entry.condition)
                "
                @change="onConditionSelect"
              >
                <option value="">—</option>
                <option
                  v-if="legacyConditionLabel"
                  :value="legacyConditionLabel"
                >
                  {{ legacyConditionLabel }}
                </option>
                <option
                  v-for="opt in CONDITION_LEVEL_LABELS"
                  :key="opt"
                  :value="opt"
                >
                  {{ conditionLabelWithEmoji(opt) }}
                </option>
              </select>
            </div>
            <div v-else class="field" :data-daily="d.key">
              <span class="field-label">
                <img class="field-label__icon" :src="d.iconSrc" alt="">
                {{ d.label }}<span class="unit">（{{ d.unit }}）</span>
              </span>
              <input
                type="number"
                inputmode="decimal"
                :step="d.step"
                placeholder="—"
                :value="
                  entry[d.key] === undefined || entry[d.key] === ''
                    ? ''
                    : String(entry[d.key])
                "
                @change="
                  (e) =>
                    onNumberChange(
                      d.key,
                      (e.target as HTMLInputElement).value,
                    )
                "
              />
            </div>
          </template>
        </div>
        <p
          v-if="persistError"
          class="firestore-alert"
          role="alert"
        >
          {{ persistError }}
        </p>
      </form>
    </section>
  </main>

  <dialog
    id="calendar-dialog"
    ref="calendarDialog"
    class="calendar-dialog"
    aria-labelledby="calendar-title"
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
        <h2 id="calendar-title" class="calendar-title">
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
