<script setup lang="ts">
const adminGateReason = useState<"not_admin" | "firestore_error" | null>(
  "admin-gate-reason",
  () => null,
);
const { user } = useFirebaseAuth();

function dismissAdminGate() {
  adminGateReason.value = null;
}
</script>

<template>
  <div>
    <AppSiteHeader />
    <div
      v-if="adminGateReason"
      class="admin-gate-banner"
      role="alert"
    >
      <div class="admin-gate-banner__inner">
        <p v-if="adminGateReason === 'not_admin'" class="admin-gate-banner__text">
          管理画面を使うには、Firebase Console の Firestore でコレクション
          <strong>admin_users</strong> に、ドキュメント ID を
          <strong>あなたの UID</strong> としたドキュメントを追加してください（中身は空の
          <code>{}</code> で構いません）。<strong>アカウント作成だけでは管理者にはなりません。</strong>ログインは通常どおりメール／パスワードです。
        </p>
        <p v-else class="admin-gate-banner__text">
          Firestore の読み取りが拒否されました。<code>admin_users</code>
          のルールとデプロイ（<code>firebase deploy --only firestore</code>）を確認してください。
        </p>
        <p v-if="user?.uid" class="admin-gate-banner__uid">
          <span class="admin-gate-banner__uid-label">あなたの UID</span>
          <code class="admin-gate-banner__uid-value">{{ user.uid }}</code>
        </p>
        <button
          type="button"
          class="admin-gate-banner__close"
          @click="dismissAdminGate"
        >
          閉じる
        </button>
      </div>
    </div>
    <slot />
  </div>
</template>
