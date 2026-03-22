<script setup lang="ts">
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
});

useHead({ title: "管理 — ユーザー一覧" });

type AdminUserRow = {
  uid: string;
  nickname: string;
  updatedAt: Date | null;
  height: string;
  weight: string;
  bodyFat: string;
};

const nuxtApp = useNuxtApp();
const { waitUntilReady } = useFirebaseAuth();
const loading = ref(true);
const errorMessage = ref("");
const errorConsoleUrl = ref<string | null>(null);
const rows = ref<AdminUserRow[]>([]);

function formatNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

function formatNickname(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s ? s : "—";
}

function updatedAtFromData(data: Record<string, unknown>): Date | null {
  const u = data.updatedAt;
  if (u && typeof u === "object" && "toDate" in u) {
    const d = (u as Timestamp).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function extractFirestoreConsoleUrl(message: string): string | null {
  const m = message.match(/https:\/\/console\.firebase\.google\.com[^\s)'"]+/);
  return m ? m[0] : null;
}

onMounted(async () => {
  loading.value = true;
  errorMessage.value = "";
  errorConsoleUrl.value = null;
  rows.value = [];

  const db = nuxtApp.$firestoreDb;
  if (!db) {
    errorMessage.value = "Firestore に接続できません。";
    loading.value = false;
    return;
  }

  const fb = nuxtApp.$firebaseAuth;
  await waitUntilReady();
  await fb?.whenReady;
  try {
    await fb?.auth.currentUser?.getIdToken(true);
  } catch {
    /* ignore */
  }

  try {
    // collectionGroup("settings") は DB 内の他 settings とルール衝突し permission-denied になり得るため、
    // userDirectory を索引にし各ユーザの profile を個別取得する。
    const dirSnap = await getDocs(collection(db, "userDirectory"));
    const entries = dirSnap.docs.map((d) => d.id);
    const list: AdminUserRow[] = [];
    await Promise.all(
      entries.map(async (uid) => {
        const prof = await getDoc(doc(db, "users", uid, "settings", "profile"));
        if (!prof.exists()) return;
        const data = prof.data() as Record<string, unknown>;
        list.push({
          uid,
          nickname: formatNickname(data.nickname),
          updatedAt: updatedAtFromData(data),
          height: formatNum(data.height),
          weight: formatNum(data.weight),
          bodyFat: formatNum(data.bodyFat),
        });
      }),
    );
    list.sort((a, b) => {
      const ta = a.updatedAt?.getTime() ?? 0;
      const tb = b.updatedAt?.getTime() ?? 0;
      return tb - ta;
    });
    rows.value = list;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
    const msg =
      e && typeof e === "object" && "message" in e
        ? String((e as { message: string }).message)
        : e instanceof Error
          ? e.message
          : "";
    errorConsoleUrl.value = msg ? extractFirestoreConsoleUrl(msg) : null;
    if (code === "permission-denied") {
      errorMessage.value =
        "権限がありません。firebase deploy --only firestore:rules で最新ルールを反映し、admin_users に自分の UID があるか確認してください（userDirectory 用ルールが含まれている必要があります）。";
    } else if (code === "failed-precondition") {
      errorMessage.value =
        "Firestore の条件が満たせません（インデックス未作成のことが多いです）。下のリンクからインデックスを作成するか、数分待ってから再読み込みしてください。";
    } else {
      errorMessage.value =
        "一覧の取得に失敗しました。ネットワークや Firestore の設定を確認してください。";
      if (import.meta.dev && msg) {
        errorMessage.value += `（${code || "error"}: ${msg.slice(0, 200)}）`;
      }
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="admin-page">
    <h1 class="page-title">ユーザー一覧</h1>
    <p class="admin-page__lead">
      プロフィールを保存したユーザが <code>userDirectory</code> に登録され、ここに表示されます（初回はプロフィール画面を開くか保存すると登録されます）。
      ニックネームはプロフィールの <code>nickname</code> です。メールは Firestore に無いため UID で識別します。
      新規の Authentication ユーザーは <strong>Firebase Console</strong> または <code>npm run admin:create</code> で作成してください。
      <strong>詳細</strong>から各ユーザーのログを閲覧できます。
    </p>

    <p v-if="errorMessage" class="admin-page__error" role="alert">
      {{ errorMessage }}
      <a
        v-if="errorConsoleUrl"
        :href="errorConsoleUrl"
        class="admin-page__error-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Firebase Console でインデックスを開く
      </a>
    </p>

    <p v-if="loading" class="admin-page__loading">読み込み中…</p>

    <template v-else-if="!errorMessage">
      <div v-if="rows.length === 0" class="admin-page__empty">
        該当するユーザーがいません。一覧は
        <strong>userDirectory</strong>
        を参照します。各ユーザーがプロフィールを保存（またはプロフィール画面を開いて
        userDirectory が無い場合の補完）すると登録されます。Console のプロジェクト ID が
        <code class="admin-page__empty-code">.env</code> の
        NUXT_PUBLIC_FIREBASE_PROJECT_ID と一致しているかも確認してください。
      </div>
      <div v-else class="admin-user-table-wrap">
        <table class="admin-user-table">
          <thead>
            <tr>
              <th scope="col">UID</th>
              <th scope="col">ニックネーム</th>
              <th scope="col">更新</th>
              <th scope="col">身長</th>
              <th scope="col">体重</th>
              <th scope="col">体脂肪</th>
              <th scope="col" class="admin-user-table__actions-head">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.uid">
              <td class="admin-user-table__mono">{{ r.uid }}</td>
              <td>{{ r.nickname }}</td>
              <td>
                <span v-if="r.updatedAt" class="admin-user-table__muted">{{
                  r.updatedAt.toLocaleString("ja-JP")
                }}</span>
                <span v-else class="admin-user-table__muted">—</span>
              </td>
              <td>{{ r.height === "—" ? "—" : `${r.height} cm` }}</td>
              <td>{{ r.weight === "—" ? "—" : `${r.weight} kg` }}</td>
              <td>{{ r.bodyFat === "—" ? "—" : `${r.bodyFat} %` }}</td>
              <td class="admin-user-table__actions">
                <NuxtLink
                  class="admin-table-btn admin-table-btn--detail"
                  :to="`/admin/users/${r.uid}`"
                >
                  詳細
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </main>
</template>
