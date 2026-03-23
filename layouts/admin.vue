<script setup lang="ts">
const route = useRoute();

const isUsersSection = computed(
  () =>
    route.path === "/admin" || route.path.startsWith("/admin/users"),
);

const isExercisesSection = computed(() =>
  route.path.startsWith("/admin/exercises"),
);

const { signOut, user } = useFirebaseAuth();

async function onLogout() {
  await signOut?.();
  await navigateTo({ path: "/login", query: { redirect: "/admin" } });
}

/** グローバル body のグレー背景を消す（管理ルートのみ） */
onMounted(() => {
  if (!import.meta.client) return;
  document.documentElement.classList.add("admin-ui");
  document.body.classList.add("admin-ui");
});

onBeforeUnmount(() => {
  if (!import.meta.client) return;
  document.documentElement.classList.remove("admin-ui");
  document.body.classList.remove("admin-ui");
});
</script>

<template>
  <div class="admin-layout">
    <header class="admin-layout__header">
      <div class="admin-layout__title">管理画面</div>
      <div class="admin-layout__actions">
        <span v-if="user?.email" class="admin-layout__email">{{ user.email }}</span>
        <button
          type="button"
          class="admin-layout__logout"
          @click="onLogout"
        >
          ログアウト
        </button>
      </div>
    </header>
    <div class="admin-layout__shell">
      <aside class="admin-layout__sidebar">
        <nav class="admin-layout__nav" aria-label="管理メニュー">
          <NuxtLink
            to="/admin"
            class="admin-layout__nav-link"
            :class="{
              'admin-layout__nav-link--active': isUsersSection,
            }"
          >
            ユーザー一覧
          </NuxtLink>
          <NuxtLink
            to="/admin/exercises"
            class="admin-layout__nav-link"
            :class="{
              'admin-layout__nav-link--active': isExercisesSection,
            }"
          >
            トレーニング種目管理
          </NuxtLink>
        </nav>
      </aside>
      <div class="admin-layout__main">
        <slot />
      </div>
    </div>
  </div>
</template>
