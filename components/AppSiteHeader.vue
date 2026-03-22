<script setup lang="ts">
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const { user, isConfigured, signOut } = useFirebaseAuth();
const { isAdmin, refresh: refreshAdmin } = useAdminAccess();
const inbox = useTrainerCommentsInbox();

const menuOpen = ref(false);
const menuBtn = ref<HTMLButtonElement | null>(null);
const commentsPanelOpen = ref(false);

const baseNav = [
  { to: "/", label: "コンディションレコード", match: (p: string) => p === "/" },
  { to: "/graph", label: "コンディションログ", match: (p: string) => p === "/graph" },
  {
    to: "/training",
    label: "トレーニングレコード",
    match: (p: string) => p === "/training",
  },
  {
    to: "/training-log",
    label: "トレーニングログ",
    match: (p: string) => p === "/training-log",
  },
  {
    to: "/training-sessions",
    label: "トレーニングセッション",
    match: (p: string) => p.startsWith("/training-sessions"),
  },
  {
    to: "/body-log",
    label: "ボディログ",
    match: (p: string) => p.startsWith("/body-log"),
  },
  { to: "/vision", label: "ビジョン", match: (p: string) => p === "/vision" },
  { to: "/profile", label: "プロフィール", match: (p: string) => p === "/profile" },
];

const nav = computed(() => {
  const items = [...baseNav];
  if (isAdmin.value) {
    items.push({
      to: "/admin",
      label: "管理",
      match: (p: string) => p.startsWith("/admin"),
    });
  }
  return items;
});

onMounted(() => {
  void refreshAdmin();
  if (user.value?.uid) void inbox.refreshInbox();
});

watch(user, () => {
  void refreshAdmin();
  void inbox.refreshInbox();
});

function isCurrent(item: (typeof nav)[0]) {
  return item.match(route.path);
}

function openMenu() {
  if (commentsPanelOpen.value) {
    commentsPanelOpen.value = false;
    void inbox.markAllInListAsSeen();
  }
  menuOpen.value = true;
  if (import.meta.client) document.body.style.overflow = "hidden";
}

function closeMenu() {
  menuOpen.value = false;
  if (import.meta.client) document.body.style.overflow = "";
}

function toggleMenu() {
  if (menuOpen.value) closeMenu();
  else openMenu();
}

function onNavClick() {
  closeMenu();
}

async function openCommentsPanel() {
  closeMenu();
  await inbox.refreshInbox();
  commentsPanelOpen.value = true;
  if (import.meta.client) document.body.style.overflow = "hidden";
}

async function closeCommentsPanel() {
  await inbox.markAllInListAsSeen();
  commentsPanelOpen.value = false;
  if (import.meta.client) {
    document.body.style.overflow =
      menuOpen.value ? "hidden" : "";
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && commentsPanelOpen.value) {
    e.preventDefault();
    void closeCommentsPanel();
    return;
  }
  if (e.key === "Escape" && menuOpen.value) {
    e.preventDefault();
    closeMenu();
    menuBtn.value?.focus();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onDocKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onDocKeydown);
  if (import.meta.client) document.body.style.overflow = "";
});

watch(menuOpen, (open) => {
  if (!import.meta.client) return;
  nextTick(() => {
    if (open) {
      const closeEl = document.getElementById("site-nav-close");
      (closeEl as HTMLElement | null)?.focus();
    }
  });
});

watch(commentsPanelOpen, (open) => {
  if (!import.meta.client) return;
  nextTick(() => {
    if (open) {
      document.getElementById("site-comments-close")?.focus();
    }
  });
});

const showAuthUi = computed(
  () => !!runtimeConfig.public.firebaseApiKey && route.path !== "/login",
);

async function onLogout() {
  closeMenu();
  commentsPanelOpen.value = false;
  if (import.meta.client) document.body.style.overflow = "";
  await signOut?.();
  await navigateTo("/login");
}

function formatTrainerCommentDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(y, m - 1, d, 12, 0, 0, 0));
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__top">
      <NuxtLink to="/" class="site-logo" aria-label="ホーム（DAIKI Fit）">
        <span class="site-logo__mark" aria-hidden="true">
          <img
            src="/daiki-fit.png"
            alt=""
            class="site-logo__img"
            width="36"
            height="36"
            decoding="async"
          />
        </span>
        <span class="site-logo__text">DAIKI Fit</span>
      </NuxtLink>
      <div class="site-header__actions">
        <button
          v-if="showAuthUi && user"
          type="button"
          class="site-bell-btn"
          :aria-label="
            inbox.unreadCount > 0
              ? `トレーナーコメント、未読${inbox.unreadCount}件`
              : 'トレーナーコメント'
          "
          @click="openCommentsPanel"
        >
          <svg
            class="site-bell-btn__icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            v-if="inbox.unreadCount > 0"
            class="site-bell-btn__dot"
            aria-hidden="true"
          />
        </button>
        <button
          ref="menuBtn"
          type="button"
          class="site-menu-btn"
          :class="{ 'is-open': menuOpen }"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          aria-controls="site-nav-drawer"
          :aria-label="menuOpen ? 'メニューを閉じる' : 'メニューを開く'"
          @click="toggleMenu"
        >
          <span class="site-menu-btn__bar" aria-hidden="true" />
          <span class="site-menu-btn__bar" aria-hidden="true" />
          <span class="site-menu-btn__bar" aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>

  <div
    class="site-nav-backdrop"
    :class="{ 'is-open': menuOpen }"
    aria-hidden="true"
    @click="closeMenu"
  />
  <div
    id="site-nav-drawer"
    class="site-nav-drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="site-nav-heading"
    :aria-hidden="menuOpen ? 'false' : 'true'"
    :class="{ 'is-open': menuOpen }"
  >
    <div class="site-nav-drawer__head">
      <span id="site-nav-heading" class="site-nav-drawer__title">メニュー</span>
      <button
        id="site-nav-close"
        type="button"
        class="site-nav-close"
        aria-label="メニューを閉じる"
        @click="closeMenu"
      >
        ×
      </button>
    </div>
    <ul class="site-nav-list">
      <li v-for="item in nav" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-current="isCurrent(item) ? 'page' : undefined"
          @click="onNavClick"
        >
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
    <div v-if="showAuthUi" class="site-nav-auth">
      <p v-if="user?.email" class="site-nav-auth__email">{{ user.email }}</p>
      <button
        type="button"
        class="site-nav-auth__logout"
        @click="onLogout"
      >
        ログアウト
      </button>
    </div>
  </div>

  <!-- ドロワー外: ベルから開くときメニューが閉じていても表示される -->
  <div
    class="site-comments-backdrop"
    :class="{ 'is-open': commentsPanelOpen }"
    aria-hidden="true"
    @click="closeCommentsPanel"
  />
  <div
    id="site-comments-panel"
    class="site-comments-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="site-comments-heading"
    :aria-hidden="commentsPanelOpen ? 'false' : 'true'"
    :class="{ 'is-open': commentsPanelOpen }"
  >
    <div class="site-comments-panel__head">
      <h2 id="site-comments-heading" class="site-comments-panel__title">
        トレーナーからのコメント
      </h2>
      <button
        id="site-comments-close"
        type="button"
        class="site-comments-panel__close"
        aria-label="閉じる"
        @click="closeCommentsPanel"
      >
        ×
      </button>
    </div>
    <p class="site-comments-panel__hint">
      閉じると一覧のコメントは閲覧済みになります。
    </p>
    <p
      v-if="inbox.error"
      class="site-comments-panel__error"
      role="alert"
    >
      {{ inbox.error }}
    </p>
    <p
      v-else-if="inbox.loading"
      class="site-comments-panel__loading"
    >
      読み込み中…
    </p>
    <p
      v-else-if="inbox.comments.length === 0"
      class="site-comments-panel__empty"
    >
      まだコメントはありません。
    </p>
    <ul v-else class="site-comments-panel__list">
      <li
        v-for="c in inbox.comments"
        :key="c.id"
        class="site-comments-panel__item"
        :class="{
          'site-comments-panel__item--unread': !inbox.isCommentRead(c.id),
        }"
      >
        <div class="site-comments-panel__item-head">
          <span class="site-comments-panel__date">{{
            formatTrainerCommentDate(c.date)
          }}</span>
          <span class="site-comments-panel__read-badge">{{
            inbox.isCommentRead(c.id) ? "閲覧済み" : "未読"
          }}</span>
        </div>
        <p class="site-comments-panel__text">{{ c.text }}</p>
      </li>
    </ul>
  </div>
</template>
