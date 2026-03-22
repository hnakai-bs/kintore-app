<script setup lang="ts">
import {
  Chart,
  registerables,
  type Chart as ChartType,
} from "chart.js";
import { toValue, type MaybeRefOrGetter } from "vue";
import type { DisplayGoalKey } from "~/utils/displayGoalsFromProfile";
import {
  buildSeries,
  countPoints,
  parseYmd,
  rangeForPreset,
  resolveChartSpecs,
  type ConditionChartResolved,
  ymd,
  yRange,
} from "~/utils/conditionGraphCore";

Chart.register(...registerables);

const props = withDefaults(
  defineProps<{
    fetchDaily: (
      startYmd: string,
      endYmd: string,
    ) => Promise<Record<string, Record<string, unknown>>>;
    goals: MaybeRefOrGetter<Record<DisplayGoalKey, number>>;
    persistPreferences?: boolean;
    /** 空文字で従来の element id（graph ページ互換） */
    domIdPrefix?: string;
    chartsGrid?: boolean;
    /** タブ復帰時に親の目標キャッシュを更新（ログインユーザー向け） */
    externalGoalsRefresh?: () => void | Promise<void>;
  }>(),
  {
    persistPreferences: true,
    domIdPrefix: "",
    chartsGrid: false,
  },
);

const preferencesFirestore = usePreferencesFirestore();

const chartSpecs = computed(() =>
  resolveChartSpecs(toValue(props.goals), props.domIdPrefix),
);

const mode = ref<"week" | "month" | "custom">("week");
const rangeStart = ref("");
const rangeEnd = ref("");

const hintHidden = reactive<Record<string, boolean>>({});
const chartEntries = ref<Record<string, Record<string, unknown>>>({});
const chartInstances: Record<string, ChartType> = {};

const periodName = computed(
  () => `period-${props.domIdPrefix || "default"}`,
);

function destroyChart(id: string) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function initCustomDefaults() {
  const { start, end } = rangeForPreset("month");
  rangeStart.value = ymd(start);
  rangeEnd.value = ymd(end);
}

async function loadEntriesForRange(start: Date, end: Date) {
  const startYmd = ymd(start);
  const endYmd = ymd(end);
  chartEntries.value = await props.fetchDaily(startYmd, endYmd);
}

function renderChartForSpec(
  spec: ConditionChartResolved,
  start: Date,
  end: Date,
) {
  const canvas = document.getElementById(spec.id) as HTMLCanvasElement | null;
  const hintEl = document.getElementById(spec.emptyId);
  if (!canvas) return;

  destroyChart(spec.id);

  const entries = chartEntries.value;
  const { labels, values } = buildSeries(start, end, spec.field, entries);
  const n = countPoints(values);
  if (hintEl) hintEl.hidden = n > 0;
  hintHidden[spec.emptyId] = n > 0;

  if (n === 0) return;

  const yr = yRange(values, spec.goal);
  const goalLine = labels.map(() => spec.goal);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  chartInstances[spec.id] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: spec.legendLabel,
          data: values,
          borderColor: spec.color,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: spec.color,
          fill: false,
        },
        {
          label: "目標",
          data: goalLine,
          borderColor: "#dc2626",
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: 12,
            font: { size: 11 },
            color: "#525252",
          },
        },
        tooltip: {
          filter: (item) => item.datasetIndex === 0 && item.raw != null,
          callbacks: {
            label(ctx) {
              return `${spec.title}: ${ctx.raw} ${spec.unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: mode.value === "week" ? 8 : 12,
            font: { size: 10 },
            color: "#737373",
          },
        },
        y: {
          beginAtZero: false,
          min: yr.min,
          max: yr.max,
          ticks: {
            font: { size: 10 },
            color: "#737373",
          },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });
}

function renderAllCharts(start: Date, end: Date) {
  chartSpecs.value.forEach((spec) => {
    renderChartForSpec(spec, start, end);
  });
}

async function refresh() {
  let start: Date;
  let end: Date;
  if (mode.value === "custom") {
    if (!rangeStart.value || !rangeEnd.value) return;
    start = parseYmd(rangeStart.value);
    end = parseYmd(rangeEnd.value);
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }
  } else {
    const r = rangeForPreset(mode.value);
    start = r.start;
    end = r.end;
  }
  await loadEntriesForRange(start, end);
  nextTick(() => renderAllCharts(start, end));
}

function onPeriodChange() {
  if (mode.value === "custom") {
    initCustomDefaults();
  }
  void nextTick(() => refresh());
}

function applyCustomRange() {
  void refresh();
}

const prefsHydrated = ref(false);
let prefSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSavePreferences() {
  if (!props.persistPreferences || !prefsHydrated.value) return;
  if (prefSaveTimer) clearTimeout(prefSaveTimer);
  prefSaveTimer = setTimeout(() => {
    void preferencesFirestore.merge({
      graphMode: mode.value,
      graphRangeStart: rangeStart.value,
      graphRangeEnd: rangeEnd.value,
    });
  }, 500);
}

function onVisibility() {
  if (document.visibilityState === "visible" && props.externalGoalsRefresh) {
    void props.externalGoalsRefresh();
  }
}

onMounted(async () => {
  if (props.persistPreferences) {
    const p = await preferencesFirestore.load();
    if (
      p.graphMode === "week" ||
      p.graphMode === "month" ||
      p.graphMode === "custom"
    ) {
      mode.value = p.graphMode;
    }
    if (p.graphRangeStart && p.graphRangeEnd) {
      rangeStart.value = p.graphRangeStart;
      rangeEnd.value = p.graphRangeEnd;
    } else {
      initCustomDefaults();
    }
    prefsHydrated.value = true;
  } else {
    initCustomDefaults();
  }

  if (props.externalGoalsRefresh) {
    await props.externalGoalsRefresh();
    document.addEventListener("visibilitychange", onVisibility);
  }
  void refresh();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibility);
  if (prefSaveTimer) clearTimeout(prefSaveTimer);
  chartSpecs.value.forEach((s) => destroyChart(s.id));
});

watch(mode, () => {
  void nextTick(() => refresh());
});

watch([mode, rangeStart, rangeEnd], () => {
  scheduleSavePreferences();
});

watch(
  () => toValue(props.goals),
  () => {
    void nextTick(() => void refresh());
  },
  { deep: true },
);
</script>

<template>
  <div class="condition-log-panel">
    <div class="period-seg" role="group" aria-label="表示期間">
      <input
        :id="`${domIdPrefix || 'graph'}__period-week`"
        v-model="mode"
        type="radio"
        :name="periodName"
        value="week"
        @change="onPeriodChange"
      />
      <label :for="`${domIdPrefix || 'graph'}__period-week`">1週間</label>
      <input
        :id="`${domIdPrefix || 'graph'}__period-month`"
        v-model="mode"
        type="radio"
        :name="periodName"
        value="month"
        @change="onPeriodChange"
      />
      <label :for="`${domIdPrefix || 'graph'}__period-month`">1ヶ月</label>
      <input
        :id="`${domIdPrefix || 'graph'}__period-custom`"
        v-model="mode"
        type="radio"
        :name="periodName"
        value="custom"
        @change="onPeriodChange"
      />
      <label :for="`${domIdPrefix || 'graph'}__period-custom`">期間指定</label>
    </div>

    <div v-show="mode === 'custom'" class="custom-range">
      <div class="range-row">
        <label :for="`${domIdPrefix || 'graph'}__range-start`">開始日</label>
        <div class="range-input-shell">
          <input
            :id="`${domIdPrefix || 'graph'}__range-start`"
            v-model="rangeStart"
            type="date"
          >
        </div>
      </div>
      <div class="range-row">
        <label :for="`${domIdPrefix || 'graph'}__range-end`">終了日</label>
        <div class="range-input-shell">
          <input
            :id="`${domIdPrefix || 'graph'}__range-end`"
            v-model="rangeEnd"
            type="date"
          >
        </div>
      </div>
      <button type="button" class="btn-apply" @click="applyCustomRange">
        この期間で表示
      </button>
    </div>

    <div
      :class="[
        'condition-log-charts',
        chartsGrid ? 'admin-condition-chart-grid' : undefined,
      ]"
    >
      <section
        v-for="spec in chartSpecs"
        :key="spec.id"
        class="chart-card"
        :aria-labelledby="'chart-h-' + spec.id"
      >
        <h2 :id="'chart-h-' + spec.id" class="chart-heading">
          {{ spec.title }}
        </h2>
        <div
          class="chart-wrap"
          :class="
            spec.field === 'weight'
              ? 'chart-wrap--tall'
              : 'chart-wrap--compact'
          "
        >
          <canvas :id="spec.id" :aria-label="`${spec.title}の折れ線グラフ`" />
        </div>
        <p
          :id="spec.emptyId"
          class="empty-hint"
          :hidden="hintHidden[spec.emptyId]"
        >
          この期間に{{ spec.title }}の記録がありません
        </p>
      </section>
    </div>
  </div>
</template>

<style>
@import "~/assets/css/graph.css";
</style>
