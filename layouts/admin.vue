<script setup lang="ts">
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
    <div class="admin-layout__main">
      <slot />
    </div>
  </div>
</template>
