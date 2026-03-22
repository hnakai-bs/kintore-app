<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { displayGoalsFromProfile } from "~/utils/displayGoalsFromProfile";
import { formatTrainingDaySummary } from "~/utils/formatTrainingDaySummary";
import {
  countTrainingSetsInMonth,
  exerciseSetCountsForMonth,
  monthBoundsYmd,
} from "~/utils/trainingMetrics";

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
});

const route = useRoute();
const rawUid = computed(() => {
  const u = route.params.uid;
  return typeof u === "string" ? u : Array.isArray(u) ? u[0] ?? "" : "";
});

const uid = computed(() => rawUid.value.trim());

const nuxtApp = useNuxtApp();
const dailyFs = useDailyFirestore();
const trainingFs = useTrainingFirestore();

const nickname = ref("—");
const profileLoading = ref(true);
const profileError = ref("");

const chartGoals = ref(displayGoalsFromProfile({}));

const activeTab = ref<"condition" | "training">("condition");

const chartDomPrefix = computed(() => {
  const u = uid.value;
  if (!u) return "adm_empty";
  return `adm_${u.replace(/[^a-zA-Z0-9]/g, "_")}`;
});

async function fetchDailyForUser(
  startYmd: string,
  endYmd: string,
): Promise<Record<string, Record<string, unknown>>> {
  return dailyFs.fetchRange(startYmd, endYmd, { forUserId: uid.value });
}

type TrainingRow = { dateYmd: string; labelJa: string; summary: string };

const trainingLoading = ref(false);
const trainingError = ref("");
const trainingRows = ref<TrainingRow[]>([]);
/** `<input type="month">` 用 `yyyy-MM` */
const trainingMonthYm = ref("");
const trainingSetCountMonth = ref(0);
const trainingExerciseSlices = ref<{ label: string; count: number }[]>([]);

function initTrainingMonthYm() {
  const d = new Date();
  trainingMonthYm.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatYearMonthJa(ym: string): string {
  const parts = ym.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m || m < 1 || m > 12) return ym;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, 1, 12, 0, 0, 0));
}

function formatDateJa(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return dateYmd;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(y, m - 1, d, 12, 0, 0, 0));
}

async function loadProfile() {
  profileLoading.value = true;
  profileError.value = "";
  if (!uid.value) {
    profileError.value = "ユーザー ID が不正です。";
    profileLoading.value = false;
    return;
  }
  const db = nuxtApp.$firestoreDb;
  if (!db) {
    profileError.value = "Firestore に接続できません。";
    profileLoading.value = false;
    return;
  }
  try {
    const snap = await getDoc(
      doc(db, "users", uid.value, "settings", "profile"),
    );
    if (!snap.exists()) {
      nickname.value = "—";
      chartGoals.value = displayGoalsFromProfile({});
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    const nn = data.nickname;
    nickname.value =
      nn != null && String(nn).trim() ? String(nn).trim() : "—";
    chartGoals.value = displayGoalsFromProfile(data);
  } catch {
    profileError.value = "プロフィールの取得に失敗しました。";
  } finally {
    profileLoading.value = false;
  }
}

async function loadTrainingForSelectedMonth() {
  trainingLoading.value = true;
  trainingError.value = "";
  trainingRows.value = [];
  trainingSetCountMonth.value = 0;
  trainingExerciseSlices.value = [];
  if (!uid.value) {
    trainingLoading.value = false;
    return;
  }
  if (!trainingMonthYm.value) initTrainingMonthYm();
  const parts = trainingMonthYm.value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  if (!year || !month || month < 1 || month > 12) {
    trainingLoading.value = false;
    return;
  }
  try {
    const { startYmd, endYmd } = monthBoundsYmd(year, month);
    const map = await trainingFs.fetchRange(startYmd, endYmd, {
      forUserId: uid.value,
    });
    trainingSetCountMonth.value = countTrainingSetsInMonth(map, year, month);
    trainingExerciseSlices.value = exerciseSetCountsForMonth(
      map,
      year,
      month,
    );
    const keys = Object.keys(map).sort((a, b) => b.localeCompare(a));
    trainingRows.value = keys.map((dateYmd) => ({
      dateYmd,
      labelJa: formatDateJa(dateYmd),
      summary: formatTrainingDaySummary(map[dateYmd]),
    }));
  } catch {
    trainingError.value = "トレーニングログの取得に失敗しました。";
    trainingExerciseSlices.value = [];
  } finally {
    trainingLoading.value = false;
  }
}

watch(
  uid,
  (u) => {
    if (!u) return;
    activeTab.value = "condition";
    trainingRows.value = [];
    trainingError.value = "";
    trainingSetCountMonth.value = 0;
    trainingExerciseSlices.value = [];
    initTrainingMonthYm();
    void loadProfile();
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (tab !== "training" || !uid.value) return;
  if (!trainingMonthYm.value) initTrainingMonthYm();
  void loadTrainingForSelectedMonth();
});

useHead(
  computed(() => {
    const u = uid.value;
    if (!u) return { title: "管理 — ユーザー詳細" };
    if (nickname.value !== "—") return { title: `管理 — ${nickname.value}` };
    return { title: `管理 — ユーザー ${u.slice(0, 8)}…` };
  }),
);
</script>

<template>
  <main class="admin-user-detail">
    <nav class="admin-user-detail__nav" aria-label="パンくず">
      <div class="sessions-back-wrap">
        <NuxtLink
          to="/admin"
          class="sessions-back-btn"
          aria-label="ユーザー一覧に戻る"
        >
          <span class="sessions-back-btn__mark" aria-hidden="true">＜</span>戻る
        </NuxtLink>
      </div>
    </nav>

    <header class="admin-user-detail__header">
      <h1 class="admin-user-detail__title page-title">ユーザー詳細</h1>
      <p class="admin-user-detail__meta">
        <span class="admin-user-detail__nick">{{ nickname }}</span>
        <code class="admin-user-detail__uid">{{ uid }}</code>
      </p>
    </header>

    <p v-if="profileError" class="admin-page__error" role="alert">
      {{ profileError }}
    </p>

    <div class="admin-user-detail__tabs-wrap">
      <div
        class="admin-user-detail__tabs"
        role="tablist"
        aria-label="表示するログ"
      >
        <button
          id="admin-tab-condition"
          type="button"
          role="tab"
          class="admin-user-detail__tab"
          :class="{
            'admin-user-detail__tab--active': activeTab === 'condition',
          }"
          :aria-selected="activeTab === 'condition'"
          @click="activeTab = 'condition'"
        >
          コンディションログ
        </button>
        <button
          id="admin-tab-training"
          type="button"
          role="tab"
          class="admin-user-detail__tab"
          :class="{
            'admin-user-detail__tab--active': activeTab === 'training',
          }"
          :aria-selected="activeTab === 'training'"
          @click="activeTab = 'training'"
        >
          トレーニングログ
        </button>
      </div>
    </div>

    <section
      class="admin-user-detail__section card admin-detail-card"
      aria-label="ユーザーログ"
    >
      <div
        v-if="activeTab === 'condition'"
        role="tabpanel"
        class="admin-user-detail__tab-panel"
        aria-labelledby="admin-tab-condition"
      >
        <p class="admin-user-detail__section-lead">
          対象ユーザーの日次記録（1週間／1ヶ月／期間指定）。グラフはこのタブ表示中のみ読み込みます。
        </p>
        <div v-if="profileLoading" class="admin-user-detail__loading">
          プロフィールを読み込み中…
        </div>
        <ConditionLogPanel
          v-else-if="uid"
          :key="`${uid}-condition`"
          :fetch-daily="fetchDailyForUser"
          :goals="chartGoals"
          :dom-id-prefix="chartDomPrefix"
          :persist-preferences="false"
          charts-grid
        />
      </div>

      <div
        v-if="activeTab === 'training'"
        role="tabpanel"
        class="admin-user-detail__tab-panel"
        aria-labelledby="admin-tab-training"
      >
        <p class="admin-user-detail__section-lead">
          表示する月を選ぶと、その月の記録を取得します（日付は新しい順）。
        </p>

        <div class="admin-training-month-bar">
          <label class="admin-training-month-bar__label" for="admin-training-month">
            表示月
          </label>
          <input
            id="admin-training-month"
            v-model="trainingMonthYm"
            class="admin-training-month-bar__input"
            type="month"
            @change="loadTrainingForSelectedMonth"
          >
        </div>

        <p v-if="trainingError" class="admin-page__error" role="alert">
          {{ trainingError }}
        </p>
        <template v-else-if="!trainingLoading && trainingMonthYm">
          <p class="admin-training-summary" role="status">
            <span class="admin-training-summary__label">
              {{ formatYearMonthJa(trainingMonthYm) }}のトレーニング回数
            </span>
            <span class="admin-training-summary__num">{{ trainingSetCountMonth }}</span>
            <span class="admin-training-summary__unit">回</span>
          </p>
          <AdminTrainingExercisePie
            v-if="trainingExerciseSlices.length > 0"
            :key="`${uid}-${trainingMonthYm}-pie`"
            :slices="trainingExerciseSlices"
          />
        </template>
        <p v-else-if="trainingLoading" class="admin-user-detail__loading">
          読み込み中…
        </p>
        <div
          v-if="!trainingLoading && !trainingError && trainingRows.length === 0"
          class="admin-user-detail__empty"
        >
          この月のトレーニング記録はありません。
        </div>
        <div
          v-else-if="!trainingLoading && !trainingError && trainingRows.length > 0"
          class="admin-training-table-wrap"
        >
          <table class="admin-training-table">
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">内容</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in trainingRows" :key="r.dateYmd">
                <td class="admin-training-table__date">
                  <span class="admin-training-table__date-primary">{{
                    r.labelJa
                  }}</span>
                  <span class="admin-training-table__date-sub">{{
                    r.dateYmd
                  }}</span>
                </td>
                <td class="admin-training-table__summary">{{ r.summary }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
</template>

<style>
@import "~/assets/css/sessions.css";
</style>
