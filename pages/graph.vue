<script setup lang="ts">
/** .main / .page-title 用（チャート用トークンは ConditionLogPanel 側でも読み込み） */
import "~/assets/css/graph.css";

useHead({ title: "コンディションログ" });

const { fetchRange } = useDailyFirestore();
const { goals: chartGoals, refresh: refreshChartGoals } =
  useKintoreDisplayGoals();

async function fetchDaily(
  startYmd: string,
  endYmd: string,
): Promise<Record<string, Record<string, unknown>>> {
  return fetchRange(startYmd, endYmd);
}
</script>

<template>
  <main class="main">
    <h1 class="page-title">コンディションログ</h1>
    <ConditionLogPanel
      :fetch-daily="fetchDaily"
      :goals="chartGoals"
      persist-preferences
      dom-id-prefix=""
      :external-goals-refresh="refreshChartGoals"
    />
  </main>
</template>
