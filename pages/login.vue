<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

const route = useRoute();
const {
  isConfigured,
  waitUntilReady,
  signInWithEmail,
  user,
} = useFirebaseAuth();

const email = ref("");
const password = ref("");
const errorMessage = ref("");
const pending = ref(false);

function safeInternalPath(path: unknown, fallback = "/") {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }
  return path;
}

const redirectPath = computed(() => safeInternalPath(route.query.redirect, "/"));
const isRedirectToAdmin = computed(() => redirectPath.value.startsWith("/admin"));

useHead({
  title: computed(() =>
    isRedirectToAdmin.value ? "管理画面 — ログイン" : "ログイン",
  ),
});

onMounted(async () => {
  const config = useRuntimeConfig().public;
  if (!config.firebaseApiKey) {
    errorMessage.value =
      "Firebase が未設定です。.env に NUXT_PUBLIC_FIREBASE_* を設定してください。";
    return;
  }
  await waitUntilReady();
  if (user.value) {
    await navigateTo(redirectPath.value);
  }
});

function firebaseErrorMessage(code: string): string {
  const map: Record<string, string> = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/user-disabled": "このアカウントは無効です。",
    "auth/user-not-found": "メールまたはパスワードが正しくありません。",
    "auth/wrong-password": "メールまたはパスワードが正しくありません。",
    "auth/invalid-credential":
      "メールまたはパスワードが正しくありません。",
    "auth/too-many-requests":
      "試行回数が多すぎます。しばらく待ってから再度お試しください。",
    "auth/network-request-failed": "ネットワークエラーです。接続を確認してください。",
  };
  return map[code] ?? "エラーが発生しました。もう一度お試しください。";
}

async function onSubmit() {
  errorMessage.value = "";
  if (!isConfigured.value) return;
  pending.value = true;
  try {
    await signInWithEmail(email.value.trim(), password.value);
    await navigateTo(redirectPath.value);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
    errorMessage.value = firebaseErrorMessage(code);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main
    class="main auth-page"
    :class="isRedirectToAdmin ? 'auth-page--admin' : 'auth-page--user'"
  >
    <header class="auth-page__header">
      <p
        v-if="isRedirectToAdmin"
        class="auth-page__badge"
        aria-label="管理画面"
      >
        管理
      </p>
      <h1 class="auth-page__title page-title">
        {{ isRedirectToAdmin ? "管理画面にログイン" : "ログイン" }}
      </h1>
      <p class="auth-page__subtitle">
        {{
          isRedirectToAdmin
            ? "管理者アカウントでサインインしてください。"
            : "登録済みのメールアドレスとパスワードを入力してください。"
        }}
      </p>
    </header>

    <div v-if="isRedirectToAdmin" class="auth-panel auth-panel--admin">
      <p class="auth-panel__text">
        入場後も <strong>/admin</strong> に入れない場合は、Firestore の
        <strong>admin_users</strong> に、ドキュメント ID を
        <strong>あなたの UID</strong> としたドキュメントがあるか確認してください。
      </p>
    </div>

    <div class="auth-card card" :class="{ 'auth-card--admin': isRedirectToAdmin }">
      <form class="auth-form" @submit.prevent="onSubmit">
        <div class="field">
          <label class="field-label" for="auth-email">
            <span
              class="field-label-dot"
              :style="{
                background: isRedirectToAdmin ? '#dc2626' : 'var(--accent)',
              }"
            />
            メールアドレス
          </label>
          <input
            id="auth-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            inputmode="email"
            placeholder="you@example.com"
          />
        </div>
        <div class="field">
          <label class="field-label" for="auth-password">
            <span
              class="field-label-dot"
              style="background: var(--c-weight)"
            />
            パスワード
          </label>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            minlength="6"
            placeholder="6文字以上"
          />
        </div>

        <p v-if="errorMessage" class="auth-error" role="alert">
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="auth-submit"
          :class="{ 'auth-submit--admin': isRedirectToAdmin }"
          :disabled="pending || !isConfigured"
        >
          {{ pending ? "処理中…" : "ログイン" }}
        </button>
      </form>
    </div>
  </main>
</template>

<style>
@import "~/assets/css/auth.css";
</style>
