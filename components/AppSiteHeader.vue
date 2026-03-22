<script setup lang="ts">
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const { user, isConfigured, signOut } = useFirebaseAuth();
const { isAdmin, refresh: refreshAdmin } = useAdminAccess();

const menuOpen = ref(false);
const menuBtn = ref<HTMLButtonElement | null>(null);

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
});

watch(user, () => {
  void refreshAdmin();
});

function isCurrent(item: (typeof nav)[0]) {
  return item.match(route.path);
}

function openMenu() {
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

function onDocKeydown(e: KeyboardEvent) {
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

const showAuthUi = computed(
  () => !!runtimeConfig.public.firebaseApiKey && route.path !== "/login",
);

async function onLogout() {
  closeMenu();
  await signOut?.();
  await navigateTo("/login");
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
</template>
