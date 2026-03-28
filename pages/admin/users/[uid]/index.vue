<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { displayGoalsFromProfile } from "~/utils/displayGoalsFromProfile";
import { formatTrainingDaySummary } from "~/utils/formatTrainingDaySummary";
import {
  countTrainingDaysInMonth,
  bodyPartSetCountsForMonth,
  monthBoundsYmd,
} from "~/utils/trainingMetrics";
import {
  fetchBodyLogsForUserId,
  type BodyLogEntry,
} from "~/composables/useBodyLog";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { fetchTrainerCommentReactionsMap } from "~/composables/fetchTrainerCommentReactionsMap";
import {
  addAdminUserComment,
  adminCommentTodayYmd,
  ADMIN_COMMENTS_PAGE_SIZE,
  fetchAdminUserCommentsPage,
  updateAdminUserComment,
  type AdminUserComment,
} from "~/composables/useAdminUserComments";

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

const detailPageTitle = computed(() => {
  if (profileLoading.value) return "読み込み中…";
  const n = nickname.value.trim();
  if (n && n !== "—") return `${n}さんの詳細画面`;
  return "ニックネーム未登録の詳細画面";
});

const chartGoals = ref(displayGoalsFromProfile({}));

const activeTab = ref<"condition" | "training" | "body" | "comments">(
  "condition",
);

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

/** 内容（重量・回数ありのセット要約）が1件以上ある日だけテーブルに出す */
const trainingRowsWithContent = computed(() =>
  trainingRows.value.filter((r) => r.summary !== "—"),
);
/** `<input type="month">` 用 `yyyy-MM` */
const trainingMonthYm = ref("");
const trainingDaysInMonth = ref(0);
const trainingBodyPartSlices = ref<{ label: string; count: number }[]>([]);

const bodyLoading = ref(false);
const bodyError = ref("");
const bodyEntries = ref<BodyLogEntry[]>([]);
const bodyLoaded = ref(false);

const commentsLoading = ref(false);
const commentsLoadingMore = ref(false);
const commentsError = ref("");
const comments = ref<AdminUserComment[]>([]);
const commentsLoaded = ref(false);
const commentsLastCursor = ref<QueryDocumentSnapshot<DocumentData> | null>(
  null,
);
const commentsHasMore = ref(false);
/** コメント ID → ユーザーが付けたリアクション絵文字 */
const commentReactions = ref<Record<string, string>>({});

const commentModalOpen = ref(false);
const commentModalMode = ref<"create" | "edit">("create");
const commentModalEditingId = ref<string | null>(null);
const commentModalDate = ref("");
const commentModalText = ref("");
const commentModalSaving = ref(false);
const commentModalError = ref("");

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
  trainingDaysInMonth.value = 0;
  trainingBodyPartSlices.value = [];
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
    trainingDaysInMonth.value = countTrainingDaysInMonth(map, year, month);
    trainingBodyPartSlices.value = bodyPartSetCountsForMonth(
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
    trainingBodyPartSlices.value = [];
  } finally {
    trainingLoading.value = false;
  }
}

async function loadBodyLogsForUser() {
  bodyLoading.value = true;
  bodyError.value = "";
  if (!uid.value) {
    bodyEntries.value = [];
    bodyLoading.value = false;
    return;
  }
  try {
    bodyEntries.value = await fetchBodyLogsForUserId(uid.value);
    bodyLoaded.value = true;
  } catch {
    bodyError.value = "ボディログの取得に失敗しました。";
    bodyEntries.value = [];
  } finally {
    bodyLoading.value = false;
  }
}

async function loadAdminCommentsFirstPage() {
  commentsLoading.value = true;
  commentsError.value = "";
  comments.value = [];
  commentsLastCursor.value = null;
  commentsHasMore.value = false;
  if (!uid.value) {
    commentReactions.value = {};
    commentsLoading.value = false;
    return;
  }
  try {
    const [r, reactMap] = await Promise.all([
      fetchAdminUserCommentsPage(
        uid.value,
        ADMIN_COMMENTS_PAGE_SIZE,
        null,
      ),
      fetchTrainerCommentReactionsMap(uid.value),
    ]);
    comments.value = r.items;
    commentsLastCursor.value = r.lastDoc;
    commentsHasMore.value = r.hasMore;
    commentReactions.value = reactMap;
    commentsLoaded.value = true;
  } catch {
    commentsError.value = "コメントの取得に失敗しました。";
    comments.value = [];
    commentReactions.value = {};
  } finally {
    commentsLoading.value = false;
  }
}

async function loadAdminCommentsMore() {
  if (!uid.value || !commentsHasMore.value || !commentsLastCursor.value) {
    return;
  }
  commentsLoadingMore.value = true;
  try {
    const [r, reactMap] = await Promise.all([
      fetchAdminUserCommentsPage(
        uid.value,
        ADMIN_COMMENTS_PAGE_SIZE,
        commentsLastCursor.value,
      ),
      fetchTrainerCommentReactionsMap(uid.value),
    ]);
    comments.value = [...comments.value, ...r.items];
    commentsLastCursor.value = r.lastDoc;
    commentsHasMore.value = r.hasMore;
    commentReactions.value = reactMap;
  } catch {
    commentsError.value = "追加の取得に失敗しました。";
  } finally {
    commentsLoadingMore.value = false;
  }
}

function openCommentModalCreate() {
  commentModalMode.value = "create";
  commentModalEditingId.value = null;
  commentModalDate.value = adminCommentTodayYmd();
  commentModalText.value = "";
  commentModalError.value = "";
  commentModalOpen.value = true;
}

function openCommentModalEdit(c: AdminUserComment) {
  commentModalMode.value = "edit";
  commentModalEditingId.value = c.id;
  commentModalDate.value = c.date;
  commentModalText.value = c.text;
  commentModalError.value = "";
  commentModalOpen.value = true;
}

function closeCommentModal() {
  commentModalOpen.value = false;
}

async function submitCommentModal() {
  commentModalError.value = "";
  if (!uid.value) return;
  commentModalSaving.value = true;
  try {
    if (commentModalMode.value === "create") {
      await addAdminUserComment(uid.value, {
        date: commentModalDate.value,
        text: commentModalText.value,
      });
    } else if (commentModalEditingId.value) {
      await updateAdminUserComment(uid.value, commentModalEditingId.value, {
        date: commentModalDate.value,
        text: commentModalText.value,
      });
    }
    closeCommentModal();
    await loadAdminCommentsFirstPage();
  } catch (e) {
    commentModalError.value =
      e instanceof Error ? e.message : "保存に失敗しました。";
  } finally {
    commentModalSaving.value = false;
  }
}

function onCommentModalKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeCommentModal();
}

watch(commentModalOpen, (open) => {
  if (!import.meta.client) return;
  document.body.style.overflow = open ? "hidden" : "";
});

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener("keydown", onCommentModalKeydown);
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener("keydown", onCommentModalKeydown);
    document.body.style.overflow = "";
  }
});

watch(
  uid,
  (u) => {
    if (!u) return;
    activeTab.value = "condition";
    trainingRows.value = [];
    trainingError.value = "";
    trainingDaysInMonth.value = 0;
    trainingBodyPartSlices.value = [];
    bodyEntries.value = [];
    bodyError.value = "";
    bodyLoaded.value = false;
    comments.value = [];
    commentsError.value = "";
    commentsLoaded.value = false;
    commentsLastCursor.value = null;
    commentsHasMore.value = false;
    commentReactions.value = {};
    commentModalOpen.value = false;
    initTrainingMonthYm();
    void loadProfile();
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (!uid.value) return;
  if (tab === "training") {
    if (!trainingMonthYm.value) initTrainingMonthYm();
    void loadTrainingForSelectedMonth();
  }
  if (tab === "body" && !bodyLoaded.value) {
    void loadBodyLogsForUser();
  }
  if (tab === "comments" && !commentsLoaded.value) {
    void loadAdminCommentsFirstPage();
  }
});

useHead(
  computed(() => {
    if (!uid.value) return { title: "管理 — 詳細" };
    const n = nickname.value.trim();
    if (profileLoading.value) return { title: "管理 — 読み込み中" };
    if (n && n !== "—") return { title: `管理 — ${n}さんの詳細` };
    return { title: "管理 — ニックネーム未登録の詳細" };
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
      <h1 class="admin-user-detail__title page-title">
        {{ detailPageTitle }}
      </h1>
    </header>

    <p v-if="profileError" class="admin-page__error" role="alert">
      {{ profileError }}
    </p>

    <div class="admin-user-detail__tabs-wrap">
      <div
        class="admin-user-detail__tabs admin-user-detail__tabs--four"
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
        <button
          id="admin-tab-body"
          type="button"
          role="tab"
          class="admin-user-detail__tab"
          :class="{
            'admin-user-detail__tab--active': activeTab === 'body',
          }"
          :aria-selected="activeTab === 'body'"
          @click="activeTab = 'body'"
        >
          ボディログ
        </button>
        <button
          id="admin-tab-comments"
          type="button"
          role="tab"
          class="admin-user-detail__tab"
          :class="{
            'admin-user-detail__tab--active': activeTab === 'comments',
          }"
          :aria-selected="activeTab === 'comments'"
          @click="activeTab = 'comments'"
        >
          コメント
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
          対象ユーザーの日次記録（1週間／1ヶ月／期間指定）。1週間は月曜〜日曜のカレンダー週、1ヶ月は暦の月です。前後・一覧から週や月を選べます。グラフはこのタブ表示中のみ読み込みます。
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
          :show-mood-legend="true"
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
              {{ formatYearMonthJa(trainingMonthYm) }}のトレーニング日数
            </span>
            <span class="admin-training-summary__num">{{ trainingDaysInMonth }}</span>
            <span class="admin-training-summary__unit">日</span>
          </p>
          <AdminTrainingExercisePie
            v-if="trainingBodyPartSlices.length > 0"
            :key="`${uid}-${trainingMonthYm}-pie`"
            :slices="trainingBodyPartSlices"
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
          v-else-if="
            !trainingLoading &&
              !trainingError &&
              trainingRows.length > 0 &&
              trainingRowsWithContent.length === 0
          "
          class="admin-user-detail__empty"
        >
          この月は、重量・回数が入力されたセットがある日はありません。
        </div>
        <div
          v-else-if="
            !trainingLoading &&
              !trainingError &&
              trainingRowsWithContent.length > 0
          "
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
              <tr v-for="r in trainingRowsWithContent" :key="r.dateYmd">
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

      <div
        v-if="activeTab === 'body'"
        role="tabpanel"
        class="admin-user-detail__tab-panel"
        aria-labelledby="admin-tab-body"
      >
        <p class="admin-user-detail__section-lead">
          対象ユーザーのボディログ（閲覧のみ）。表示期間の絞り込み・サムネイルの拡大はアプリのボディログと同様です。
        </p>
        <p v-if="bodyError" class="admin-page__error" role="alert">
          {{ bodyError }}
        </p>
        <p v-else-if="bodyLoading" class="admin-user-detail__loading">
          読み込み中…
        </p>
        <AdminUserBodyLogPanel
          v-else-if="bodyLoaded"
          :key="`${uid}-body`"
          :entries="bodyEntries"
        />
      </div>

      <div
        v-if="activeTab === 'comments'"
        role="tabpanel"
        class="admin-user-detail__tab-panel"
        aria-labelledby="admin-tab-comments"
      >
        <p class="admin-user-detail__section-lead">
          一覧は新しい順（登録日時）で最大 {{ ADMIN_COMMENTS_PAGE_SIZE }} 件ずつ表示します。登録内容はユーザーの<strong>プロフィール</strong>にも表示されます。
        </p>

        <div class="admin-user-comments-toolbar">
          <button
            type="button"
            class="admin-user-comments-toolbar__new"
            @click="openCommentModalCreate"
          >
            新規コメント
          </button>
        </div>

        <p v-if="commentsError" class="admin-page__error" role="alert">
          {{ commentsError }}
        </p>
        <p v-else-if="commentsLoading" class="admin-user-detail__loading">
          読み込み中…
        </p>
        <p
          v-else-if="commentsLoaded && comments.length === 0"
          class="admin-user-detail__empty"
        >
          まだコメントがありません。「新規コメント」から追加できます。
        </p>
        <div
          v-else-if="commentsLoaded && comments.length > 0"
          class="admin-user-comments-table-wrap"
        >
          <table class="admin-user-comments-table">
            <thead>
              <tr>
                <th scope="col">表示日付</th>
                <th scope="col">コメント</th>
                <th scope="col" class="admin-user-comments-table__th-reaction">
                  反応
                </th>
                <th scope="col" class="admin-user-comments-table__th-actions">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in comments" :key="c.id">
                <td class="admin-user-comments-table__date">
                  <span class="admin-user-comments-table__date-primary">{{
                    formatDateJa(c.date)
                  }}</span>
                  <span class="admin-user-comments-table__date-sub">{{
                    c.date
                  }}</span>
                  <span
                    v-if="c.updatedAt"
                    class="admin-user-comments-table__edited"
                  >更新 {{ c.updatedAt.toLocaleString("ja-JP") }}</span>
                </td>
                <td class="admin-user-comments-table__body">
                  <span class="admin-user-comments-table__preview">{{
                    c.text
                  }}</span>
                </td>
                <td
                  class="admin-user-comments-table__reaction"
                  :title="
                    commentReactions[c.id]
                      ? `反応: ${commentReactions[c.id]}`
                      : '反応なし'
                  "
                >
                  <span
                    v-if="commentReactions[c.id]"
                    class="admin-user-comments-table__reaction-emoji"
                    aria-hidden="true"
                  >{{ commentReactions[c.id] }}</span>
                  <span v-else class="admin-user-comments-table__reaction-empty"
                    >—</span
                  >
                </td>
                <td class="admin-user-comments-table__actions">
                  <button
                    type="button"
                    class="admin-user-comments-table__edit-btn"
                    @click="openCommentModalEdit(c)"
                  >
                    編集
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="commentsLoaded && commentsHasMore"
          class="admin-user-comments-load-more-wrap"
        >
          <button
            type="button"
            class="admin-user-comments-load-more"
            :disabled="commentsLoadingMore"
            @click="loadAdminCommentsMore"
          >
            {{
              commentsLoadingMore
                ? "読み込み中…"
                : `さらに読み込む（${ADMIN_COMMENTS_PAGE_SIZE} 件ずつ）`
            }}
          </button>
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="commentModalOpen"
          class="admin-comment-modal-backdrop"
          aria-hidden="true"
          @click.self="closeCommentModal"
        />
        <div
          v-if="commentModalOpen"
          class="admin-comment-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-comment-modal-title"
        >
          <div class="admin-comment-modal__panel card">
            <div class="admin-comment-modal__head">
              <h2
                id="admin-comment-modal-title"
                class="admin-comment-modal__title"
              >
                {{ commentModalMode === "create" ? "新規コメント" : "コメントを編集" }}
              </h2>
              <button
                type="button"
                class="admin-comment-modal__close"
                aria-label="閉じる"
                @click="closeCommentModal"
              >
                ×
              </button>
            </div>
            <form class="admin-comment-modal__form" @submit.prevent="submitCommentModal">
              <div class="admin-user-comments-form__row">
                <label
                  class="admin-user-comments-form__label"
                  for="admin-comment-modal-date"
                >日付</label>
                <input
                  id="admin-comment-modal-date"
                  v-model="commentModalDate"
                  class="admin-user-comments-form__input admin-user-comments-form__input--date"
                  type="date"
                  :disabled="commentModalSaving"
                  required
                >
              </div>
              <div class="admin-user-comments-form__row">
                <label
                  class="admin-user-comments-form__label"
                  for="admin-comment-modal-text"
                >コメント</label>
                <textarea
                  id="admin-comment-modal-text"
                  v-model="commentModalText"
                  class="admin-user-comments-form__textarea"
                  rows="5"
                  placeholder="表示する内容を入力"
                  :disabled="commentModalSaving"
                  required
                />
              </div>
              <p v-if="commentModalError" class="admin-page__error" role="alert">
                {{ commentModalError }}
              </p>
              <div class="admin-comment-modal__actions">
                <button
                  type="button"
                  class="admin-comment-modal__btn admin-comment-modal__btn--ghost"
                  :disabled="commentModalSaving"
                  @click="closeCommentModal"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  class="admin-comment-modal__btn admin-comment-modal__btn--primary"
                  :disabled="commentModalSaving"
                >
                  {{ commentModalSaving ? "保存中…" : "保存" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Teleport>
    </section>
  </main>
</template>

<style>
@import "~/assets/css/sessions.css";
</style>
