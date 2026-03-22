<script setup lang="ts">
import type { BodyLogEntry } from "~/composables/useBodyLog";

useHead({ title: "ボディログ" });

const PAGE_SIZE = 20;
const LOAD_DELAY_MS = 320;

const { entries, loadFromStorage } = useBodyLog();

/** 入力中（検索まで反映しない） */
const draftStart = ref("");
const draftEnd = ref("");
/** 検索適用後の条件 */
const appliedStart = ref("");
const appliedEnd = ref("");
const ready = ref(false);
const listLoading = ref(false);
const displayCount = ref(PAGE_SIZE);
let prepareToken = 0;

const lightbox = ref<{ src: string; alt: string } | null>(null);

function openLightbox(src: string, label: string) {
  lightbox.value = { src, alt: `${label}の写真（拡大）` };
}

function closeLightbox() {
  lightbox.value = null;
}

function onLightboxKey(e: KeyboardEvent) {
  if (e.key === "Escape") closeLightbox();
}

onUnmounted(() => {
  window.removeEventListener("keydown", onLightboxKey);
  document.body.style.overflow = "";
});

watch(lightbox, (v) => {
  if (import.meta.client) {
    document.body.style.overflow = v ? "hidden" : "";
  }
});

function formatDateLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  dt.setHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(dt);
}

const slots: { key: keyof Pick<BodyLogEntry, "front" | "back" | "side" | "extra">; label: string }[] =
  [
    { key: "front", label: "正面" },
    { key: "back", label: "背面" },
    { key: "side", label: "側面" },
    { key: "extra", label: "その他" },
  ];

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 開始 > 終了 のときは入れ替えて解釈 */
const effectiveFilter = computed(() => {
  let a = appliedStart.value.trim();
  let b = appliedEnd.value.trim();
  if (a && b && isYmd(a) && isYmd(b) && a > b) {
    const t = a;
    a = b;
    b = t;
  }
  return { start: a, end: b };
});

const filteredEntries = computed(() => {
  const { start, end } = effectiveFilter.value;
  return entries.value.filter((e) => {
    if (start && isYmd(start) && e.date < start) return false;
    if (end && isYmd(end) && e.date > end) return false;
    return true;
  });
});

const visibleEntries = computed(() =>
  filteredEntries.value.slice(0, displayCount.value),
);

const hasMore = computed(
  () => displayCount.value < filteredEntries.value.length,
);

const remainingCount = computed(
  () => filteredEntries.value.length - displayCount.value,
);

async function runPrepare(isInitialBoot: boolean) {
  const token = ++prepareToken;
  const n = filteredEntries.value.length;
  if (n > PAGE_SIZE) {
    if (!isInitialBoot) listLoading.value = true;
    displayCount.value = PAGE_SIZE;
    await new Promise<void>((r) => setTimeout(r, LOAD_DELAY_MS));
    if (token !== prepareToken) return;
    listLoading.value = false;
  } else {
    listLoading.value = false;
    displayCount.value = n;
  }
  if (isInitialBoot) ready.value = true;
}

function loadMore() {
  displayCount.value = Math.min(
    displayCount.value + PAGE_SIZE,
    filteredEntries.value.length,
  );
}

async function searchPeriod() {
  appliedStart.value = draftStart.value;
  appliedEnd.value = draftEnd.value;
  await runPrepare(false);
}

async function resetPeriod() {
  draftStart.value = "";
  draftEnd.value = "";
  appliedStart.value = "";
  appliedEnd.value = "";
  await runPrepare(false);
}

onMounted(async () => {
  await loadFromStorage();
  window.addEventListener("keydown", onLightboxKey);
  await runPrepare(true);
});

watch(entries, async () => {
  if (!ready.value) return;
  await runPrepare(false);
});
</script>

<template>
  <main class="main body-log-main">
    <h1 class="page-title">ボディログ</h1>

    <div v-if="!ready" class="body-log-page-loading" aria-busy="true">
      <span class="body-log-page-loading__spinner" aria-hidden="true" />
      <p class="body-log-page-loading__text">
        読み込み中…
      </p>
    </div>

    <template v-else>
      <details
        v-if="entries.length > 0"
        class="card body-log-filters body-log-filters-accordion"
        aria-label="表示期間の絞り込み（タップで開閉）"
      >
        <summary class="body-log-filters-accordion__summary">
          <span class="body-log-filters-accordion__title">表示期間</span>
          <span class="body-log-filters-accordion__chevron" aria-hidden="true">
            <svg
              class="body-log-filters-accordion__chevron-svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </span>
        </summary>
        <div class="body-log-filters-accordion__panel">
          <div class="body-log-filters__row">
            <div class="field body-log-filter-field">
              <span class="field-label">
                開始
              </span>
              <div class="body-log-date-shell">
                <input
                  v-model="draftStart"
                  class="body-log-date-input"
                  type="date"
                  aria-label="開始日"
                >
              </div>
            </div>
            <div class="field body-log-filter-field">
              <span class="field-label">
                終了
              </span>
              <div class="body-log-date-shell">
                <input
                  v-model="draftEnd"
                  class="body-log-date-input"
                  type="date"
                  aria-label="終了日"
                >
              </div>
            </div>
          </div>
          <div class="body-log-filters__actions">
            <button
              type="button"
              class="body-log-filters__btn body-log-filters__btn--primary"
              @click="searchPeriod"
            >
              検索
            </button>
            <button
              type="button"
              class="body-log-filters__btn body-log-filters__btn--ghost"
              @click="resetPeriod"
            >
              リセット
            </button>
          </div>
        </div>
      </details>

      <div v-if="entries.length === 0" class="body-log-empty">
        まだ記録がありません。<br >
        右下の「新規登録」から追加できます。
      </div>

      <div
        v-else-if="filteredEntries.length === 0"
        class="body-log-empty"
      >
        この期間に該当する記録がありません。<br >
        期間を変えて「検索」するか、「リセット」で全件に戻してください。
      </div>

      <div v-else class="body-log-list-block">
        <div
          v-if="listLoading"
          class="body-log-list-loading"
          aria-busy="true"
          aria-live="polite"
        >
          <span class="body-log-page-loading__spinner" aria-hidden="true" />
          <p class="body-log-list-loading__text">
            一覧を読み込み中…
          </p>
        </div>
        <div
          class="body-log-list"
          :class="{ 'body-log-list--muted': listLoading }"
        >
          <article
            v-for="e in visibleEntries"
            :key="e.id"
            class="body-log-row"
          >
            <div class="body-log-row__head">
              <div class="body-log-row__date">
                {{ formatDateLabel(e.date) }}
              </div>
              <NuxtLink
                :to="`/body-log/edit/${e.id}`"
                class="body-log-row__edit"
              >
                編集
              </NuxtLink>
            </div>
            <div class="body-log-row__photos">
              <template v-for="s in slots" :key="s.key">
                <button
                  v-if="e[s.key]"
                  type="button"
                  class="body-log-thumb"
                  :aria-label="`${s.label}の写真を拡大`"
                  @click="openLightbox(e[s.key]!, s.label)"
                >
                  <img
                    class="body-log-thumb__img"
                    :src="e[s.key]!"
                    :alt="`${s.label}の写真`"
                  >
                  <span class="body-log-thumb__label">{{ s.label }}</span>
                </button>
              </template>
            </div>
          </article>
        </div>
        <button
          v-if="hasMore"
          type="button"
          class="body-log-load-more"
          @click="loadMore"
        >
          さらに表示（あと {{ remainingCount }} 件）
        </button>
      </div>
    </template>

    <NuxtLink
      to="/body-log/new"
      class="body-log-fab"
      aria-label="ボディログを新規登録"
    >
      ＋ 新規登録
    </NuxtLink>

    <Teleport to="body">
      <div
        v-if="lightbox"
        class="body-log-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="写真の拡大表示"
        @click="closeLightbox"
      >
        <button
          type="button"
          class="body-log-lightbox__close"
          aria-label="閉じる"
          @click.stop="closeLightbox"
        >
          ×
        </button>
        <img
          class="body-log-lightbox__img"
          :src="lightbox.src"
          :alt="lightbox.alt"
          @click.stop
        >
      </div>
    </Teleport>
  </main>
</template>

<style>
@import "~/assets/css/body-log.css";
</style>
