<script setup lang="ts">
const route = useRoute();
const userTheme = useUserTheme();

const redirectQuery = computed(() => {
  const r = route.query.redirect;
  if (Array.isArray(r)) return typeof r[0] === "string" ? r[0] : "";
  return typeof r === "string" ? r : "";
});

const isAdminLogin = computed(() => redirectQuery.value.startsWith("/admin"));

onMounted(() => {
  if (!import.meta.client) return;
  document.documentElement.classList.add("auth-ui");
  document.body.classList.add("auth-ui");
});

onBeforeUnmount(() => {
  if (!import.meta.client) return;
  document.documentElement.classList.remove("auth-ui");
  document.body.classList.remove("auth-ui");
  userTheme.syncFromStorage();
});
</script>

<template>
  <div class="auth-layout" :class="{ 'auth-layout--admin': isAdminLogin }">
    <header class="auth-layout__header">
      <NuxtLink
        to="/"
        class="site-logo"
        aria-label="ホーム（RE-BIRTH）"
        :prefetch="false"
      >
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
        <span class="site-logo__text">RE-BIRTH</span>
      </NuxtLink>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100dvh;
  background: var(--bg, #f5f5f5);
}
.auth-layout__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e5e5);
  background: #fff;
}

/* 管理者ログイン: 背景はユーザー同様の白系、ロゴのみ赤で区別 */
.auth-layout--admin :deep(.site-logo) {
  color: #b91c1c;
}
.auth-layout--admin :deep(.site-logo__mark) {
  background: #fef2f2;
  border-color: #fecaca;
}
.auth-layout--admin :deep(.site-logo__text) {
  color: #b91c1c;
}
</style>
