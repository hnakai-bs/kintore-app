<script setup lang="ts">
import { Chart, registerables, type Chart as ChartType } from "chart.js";
import { chartBackgroundColorForBodyPart } from "~/utils/trainingBodyPartColors";

Chart.register(...registerables);

const props = defineProps<{
  slices: { label: string; count: number }[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: ChartType | null = null;

const { isDark: userThemeIsDark } = useUserTheme();

function readChartTheme() {
  if (!import.meta.client) {
    return { legendColor: "#525252", sliceBorder: "#ffffff" };
  }
  const cs = getComputedStyle(document.documentElement);
  const legend =
    cs.getPropertyValue("--text-muted").trim() || "#737373";
  const sliceBorder =
    cs.getPropertyValue("--surface").trim() || "#ffffff";
  return { legendColor: legend, sliceBorder };
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  chart?.destroy();
  chart = null;
  if (!props.slices.length) return;
  const total = props.slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { legendColor, sliceBorder } = readChartTheme();
  chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: props.slices.map((s) => s.label),
      datasets: [
        {
          data: props.slices.map((s) => s.count),
          backgroundColor: props.slices.map((s) =>
            chartBackgroundColorForBodyPart(s.label),
          ),
          borderWidth: 1,
          borderColor: sliceBorder,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 12,
            font: { size: 11 },
            padding: 10,
            color: legendColor,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Number(ctx.raw);
              const pct =
                total > 0 ? ((v / total) * 100).toFixed(1) : "0";
              const label = ctx.label ?? "";
              return `${label}: ${v}セット（${pct}%）`;
            },
          },
        },
      },
    },
  });
}

watch(
  () => props.slices,
  () => void nextTick(() => draw()),
  { deep: true },
);

watch(userThemeIsDark, () => void nextTick(() => draw()));

onMounted(() => void nextTick(() => draw()));
onBeforeUnmount(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div class="admin-training-pie">
    <h3 class="admin-training-pie__title">部位別の割合（セット数）</h3>
    <div class="admin-training-pie__canvas-wrap">
      <canvas ref="canvasRef" aria-label="部位別セット数の円グラフ" />
    </div>
  </div>
</template>

<style scoped>
.admin-training-pie {
  margin-bottom: 20px;
}

.admin-training-pie__title {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-muted);
}

.admin-training-pie__canvas-wrap {
  position: relative;
  width: 100%;
  max-width: 520px;
  height: 280px;
  margin: 0;
}
</style>
