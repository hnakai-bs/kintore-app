<script setup lang="ts">
/**
 * 旧 URL 互換：種目の閲覧一覧は /exercises/by-part へ移動しました。
 */
const route = useRoute();
await navigateTo(
  { path: "/exercises/by-part", query: route.query },
  { replace: true },
);
</script>

<template>
  <div class="main" aria-busy="true" />
</template>
