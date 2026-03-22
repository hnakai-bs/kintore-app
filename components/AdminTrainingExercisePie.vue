<script setup lang="ts">
import { Chart, registerables, type Chart as ChartType } from "chart.js";

Chart.register(...registerables);

const props = defineProps<{
  slices: { label: string; count: number }[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: ChartType | null = null;

const PALETTE = [
  "#2563eb",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#7c3aed",
  "#0d9488",
  "#ca8a04",
  "#64748b",
  "#4f46e5",
  "#059669",
];

function colorsFor(n: number) {
  return Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);
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
  chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: props.slices.map((s) => s.label),
      datasets: [
        {
          data: props.slices.map((s) => s.count),
          backgroundColor: colorsFor(props.slices.length),
          borderWidth: 1,
          borderColor: "#ffffff",
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
            color: "#525252",
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Number(ctx.raw);
              const pct =
                total > 0 ? ((v / total) * 100).toFixed(1) : "0";
              const label = ctx.label ?? "";
              return `${label}: ${v}回（${pct}%）`;
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

onMounted(() => void nextTick(() => draw()));
onBeforeUnmount(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div class="admin-training-pie">
    <h3 class="admin-training-pie__title">種目別の割合（セット数）</h3>
    <div class="admin-training-pie__canvas-wrap">
      <canvas ref="canvasRef" aria-label="種目別セット数の円グラフ" />
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
