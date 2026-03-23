<script setup lang="ts">
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { matchesExerciseSearch } from "~/utils/exerciseSearch";

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
});

useHead({ title: "管理 — トレーニング種目" });

const nuxtApp = useNuxtApp();
const { entries, refresh: refreshCatalog, loadError } =
  useTrainingExerciseCatalog();

const loading = ref(true);
const saveError = ref<string | null>(null);
/** 入力中の文字（検索ボタン / Enter まで一覧には反映しない） */
const searchInput = ref("");
/** 実際にフィルタに使う語（検索適用後） */
const searchApplied = ref("");

function applySearch() {
  searchApplied.value = searchInput.value.trim();
}

function clearSearch() {
  searchInput.value = "";
  searchApplied.value = "";
}

/** 一覧からの編集のみ（新規はモーダル） */
const formName = ref("");
const formGuideUrl = ref("");
const editingId = ref<string | null>(null);

const addModalRef = ref<HTMLDialogElement | null>(null);
/** 新規モーダル表示中（エラー表示位置の切り替え用） */
const isAddModalOpen = ref(false);
const modalName = ref("");
const modalGuideUrl = ref("");

function resetEditForm() {
  formName.value = "";
  formGuideUrl.value = "";
  editingId.value = null;
}

function resetForm() {
  resetEditForm();
  saveError.value = null;
}

function startEdit(row: { id: string; name: string; guideUrl: string }) {
  editingId.value = row.id;
  formName.value = row.name;
  formGuideUrl.value = row.guideUrl;
  saveError.value = null;
}

function openAddModal() {
  modalName.value = "";
  modalGuideUrl.value = "";
  saveError.value = null;
  isAddModalOpen.value = true;
  addModalRef.value?.showModal();
}

function closeAddModal() {
  addModalRef.value?.close();
}

function onAddModalClosed() {
  isAddModalOpen.value = false;
  saveError.value = null;
}

function onAddModalBackdrop(e: MouseEvent) {
  if (e.target === addModalRef.value) {
    closeAddModal();
  }
}

async function loadList() {
  loading.value = true;
  saveError.value = null;
  try {
    await refreshCatalog();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadList();
});

const rows = computed(() => [...entries.value]);

const filteredRows = computed(() => {
  const q = searchApplied.value;
  if (!q.trim()) return rows.value;
  return rows.value.filter((r) => matchesExerciseSearch(r.name, q));
});

function nameTaken(name: string, exceptId: string | null): boolean {
  const t = name.trim();
  return rows.value.some((r) => r.name === t && r.id !== exceptId);
}

async function submitAdd() {
  const db = nuxtApp.$firestoreDb;
  if (!db) {
    saveError.value = "Firestore に接続できません。";
    return;
  }
  const name = modalName.value.trim();
  const guideUrl = modalGuideUrl.value.trim();
  if (!name) {
    saveError.value = "種目名を入力してください。";
    return;
  }
  if (nameTaken(name, null)) {
    saveError.value = "同じ種目名が既に登録されています。";
    return;
  }

  saveError.value = null;
  loading.value = true;
  try {
    const maxOrder = rows.value.reduce(
      (m, r) => Math.max(m, r.sortOrder),
      -1,
    );
    await addDoc(collection(db, "trainingExercises"), {
      name,
      guideUrl,
      sortOrder: maxOrder + 1,
    });
    closeAddModal();
    await refreshCatalog();
  } catch (e) {
    saveError.value =
      e instanceof Error ? e.message : "保存に失敗しました。";
  } finally {
    loading.value = false;
  }
}

async function submitEdit() {
  const db = nuxtApp.$firestoreDb;
  if (!db) {
    saveError.value = "Firestore に接続できません。";
    return;
  }
  if (!editingId.value) return;

  const name = formName.value.trim();
  const guideUrl = formGuideUrl.value.trim();
  if (!name) {
    saveError.value = "種目名を入力してください。";
    return;
  }
  if (nameTaken(name, editingId.value)) {
    saveError.value = "同じ種目名が既に登録されています。";
    return;
  }

  saveError.value = null;
  loading.value = true;
  try {
    await updateDoc(doc(db, "trainingExercises", editingId.value), {
      name,
      guideUrl,
    });
    resetEditForm();
    await refreshCatalog();
  } catch (e) {
    saveError.value =
      e instanceof Error ? e.message : "保存に失敗しました。";
  } finally {
    loading.value = false;
  }
}

async function onDelete(id: string, title: string) {
  if (!confirm(`「${title}」を削除しますか？`)) return;
  const db = nuxtApp.$firestoreDb;
  if (!db) {
    saveError.value = "Firestore に接続できません。";
    return;
  }
  const wasEditing = editingId.value === id;
  saveError.value = null;
  loading.value = true;
  try {
    await deleteDoc(doc(db, "trainingExercises", id));
    if (wasEditing) resetEditForm();
    await refreshCatalog();
  } catch (e) {
    saveError.value =
      e instanceof Error ? e.message : "削除に失敗しました。";
  } finally {
    loading.value = false;
  }
}

function cancelEdit() {
  resetEditForm();
  saveError.value = null;
}
</script>

<template>
  <main class="admin-page admin-exercises-page">
    <div class="admin-exercises-page__head">
      <div>
        <h1 class="page-title">トレーニング種目管理</h1>
        <p class="admin-page__lead">
          ユーザーアプリの種目候補・フォーム解説リンクは Firestore の
          <code>trainingExercises</code>
          を参照します。初回は <code>npm run seed:exercises</code> で既存データを投入してください。
        </p>
      </div>
      <div class="admin-exercises-page__actions">
        <form
          class="admin-exercises-search"
          @submit.prevent="applySearch"
        >
          <label class="admin-exercises-search__label" for="admin-ex-search">
            種目名で検索
          </label>
          <div class="admin-exercises-search__row">
            <input
              id="admin-ex-search"
              v-model="searchInput"
              type="text"
              class="admin-exercises-search__input"
              placeholder="キーワードを入力"
              autocomplete="off"
              :disabled="loading"
              enterkeyhint="search"
            >
            <button
              type="submit"
              class="admin-exercises-search__btn admin-exercises-search__btn--search"
              :disabled="loading"
            >
              検索
            </button>
            <button
              type="button"
              class="admin-exercises-search__btn admin-exercises-search__btn--clear"
              :disabled="loading"
              @click="clearSearch"
            >
              クリア
            </button>
          </div>
          <p class="admin-exercises-search__hint">
            ひらがな・カタカナどちらでも一致します。「検索」または Enter で絞り込みます。
          </p>
        </form>
        <button
          type="button"
          class="admin-user-comments-toolbar__new"
          :disabled="loading"
          @click="openAddModal"
        >
          新規登録
        </button>
      </div>
    </div>

    <dialog
      ref="addModalRef"
      class="admin-exercises-modal"
      aria-labelledby="admin-exercises-modal-title"
      @click="onAddModalBackdrop"
      @close="onAddModalClosed"
    >
      <div class="admin-exercises-modal__panel" @click.stop>
        <h2 id="admin-exercises-modal-title" class="admin-exercises-modal__title">
          トレーニング種目を新規登録
        </h2>
        <form class="admin-exercises-form" @submit.prevent="submitAdd">
          <div class="admin-exercises-form__row">
            <label class="admin-exercises-form__label" for="ex-modal-name">種目名</label>
            <input
              id="ex-modal-name"
              v-model="modalName"
              type="text"
              class="admin-exercises-form__input"
              maxlength="120"
              autocomplete="off"
              required
            >
          </div>
          <div class="admin-exercises-form__row">
            <label class="admin-exercises-form__label" for="ex-modal-url">フォーム解説URL</label>
            <input
              id="ex-modal-url"
              v-model="modalGuideUrl"
              type="url"
              class="admin-exercises-form__input"
              maxlength="2000"
              placeholder="https://"
              autocomplete="off"
            >
          </div>
          <p
            v-if="saveError && isAddModalOpen"
            class="admin-exercises-modal__error"
            role="alert"
          >
            {{ saveError }}
          </p>
          <div class="admin-exercises-form__actions admin-exercises-modal__actions">
            <button
              type="button"
              class="admin-exercises-form__cancel"
              :disabled="loading"
              @click="closeAddModal"
            >
              キャンセル
            </button>
            <button
              type="submit"
              class="admin-table-btn admin-table-btn--detail"
              :disabled="loading"
            >
              登録
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <section
      v-if="editingId"
      class="card admin-exercises-form-card"
      aria-labelledby="ex-edit-h"
    >
      <h2 id="ex-edit-h" class="section-title">
        種目を編集
      </h2>
      <form class="admin-exercises-form" @submit.prevent="submitEdit">
        <div class="admin-exercises-form__row">
          <label class="admin-exercises-form__label" for="ex-name">種目名</label>
          <input
            id="ex-name"
            v-model="formName"
            type="text"
            class="admin-exercises-form__input"
            maxlength="120"
            autocomplete="off"
            required
          >
        </div>
        <div class="admin-exercises-form__row">
          <label class="admin-exercises-form__label" for="ex-url">フォーム解説URL</label>
          <input
            id="ex-url"
            v-model="formGuideUrl"
            type="url"
            class="admin-exercises-form__input"
            maxlength="2000"
            placeholder="https://"
            autocomplete="off"
          >
        </div>
        <div class="admin-exercises-form__actions">
          <button
            type="submit"
            class="admin-table-btn admin-table-btn--detail"
            :disabled="loading"
          >
            保存
          </button>
          <button
            type="button"
            class="admin-exercises-form__cancel"
            :disabled="loading"
            @click="cancelEdit"
          >
            キャンセル
          </button>
        </div>
      </form>
    </section>

    <p
      v-if="saveError && !isAddModalOpen"
      class="admin-page__error"
      role="alert"
    >
      {{ saveError }}
    </p>

    <p v-if="loadError" class="admin-page__error" role="alert">
      {{ loadError }}
    </p>

    <p v-if="loading && rows.length === 0" class="admin-page__loading">
      読み込み中…
    </p>

    <section
      v-else
      class="admin-user-table-wrap admin-exercises-table-wrap"
      aria-label="種目一覧"
    >
      <table class="admin-user-table admin-exercises-table">
        <thead>
          <tr>
            <th scope="col">種目名</th>
            <th scope="col">フォーム解説URL</th>
            <th scope="col" class="admin-user-table__actions-head">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRows" :key="r.id">
            <td>{{ r.name }}</td>
            <td class="admin-exercises-table__url">
              <a
                v-if="r.guideUrl"
                :href="r.guideUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="admin-exercises-table__link"
              >{{ r.guideUrl }}</a>
              <span v-else class="admin-user-table__muted">—</span>
            </td>
            <td class="admin-user-table__actions">
              <button
                type="button"
                class="admin-table-btn admin-table-btn--detail"
                :disabled="loading"
                @click="startEdit(r)"
              >
                編集
              </button>
              <button
                type="button"
                class="admin-table-btn admin-exercises-table__delete"
                :disabled="loading"
                @click="onDelete(r.id, r.name)"
              >
                削除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="rows.length === 0 && !loading"
        class="admin-page__empty"
      >
        種目がまだありません。「新規登録」から追加するか、シードを実行してください。
      </p>
      <p
        v-else-if="
          rows.length > 0 &&
            filteredRows.length === 0 &&
            !loading &&
            searchApplied.trim() !== ''
        "
        class="admin-page__empty"
      >
        検索に一致する種目がありません。
      </p>
    </section>
  </main>
</template>

<style scoped>
.admin-exercises-page {
  max-width: 960px;
}

.admin-exercises-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.admin-exercises-page__head .page-title {
  margin-bottom: 8px;
}

.admin-exercises-page__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}

.admin-exercises-search {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: min(100%, 420px);
  margin: 0;
}

.admin-exercises-search__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.admin-exercises-search__row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
}

.admin-exercises-search__input {
  flex: 1 1 160px;
  min-width: 0;
  padding: 10px 12px;
  font-size: 0.875rem;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px;
  box-sizing: border-box;
}

.admin-exercises-search__input:focus {
  outline: 2px solid var(--accent, #2563eb);
  outline-offset: 0;
  border-color: transparent;
}

.admin-exercises-search__btn {
  flex-shrink: 0;
  padding: 10px 18px;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}

.admin-exercises-search__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-exercises-search__btn--search {
  color: #ffffff;
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
}

.admin-exercises-search__btn--search:hover:not(:disabled) {
  filter: brightness(1.05);
}

.admin-exercises-search__btn--clear {
  color: #404040;
  background: #fafafa;
  border-color: #d4d4d4;
}

.admin-exercises-search__btn--clear:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #a3a3a3;
}

.admin-exercises-search__hint {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.45;
  color: var(--text-muted, #737373);
}

.admin-exercises-modal {
  margin: auto;
  padding: 0;
  border: none;
  border-radius: 12px;
  max-width: 480px;
  width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.22);
  background: transparent;
}

.admin-exercises-modal::backdrop {
  background: rgba(0, 0, 0, 0.45);
}

.admin-exercises-modal__panel {
  padding: 22px 22px 20px;
  background: #ffffff;
  border-radius: 12px;
  box-sizing: border-box;
}

.admin-exercises-modal__title {
  margin: 0 0 18px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.admin-exercises-modal__error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.45;
  background: #fce8e6;
  color: #c5221f;
  border: 1px solid #f0b4ae;
}

.admin-exercises-modal__actions {
  justify-content: flex-end;
  margin-top: 4px;
}

.admin-exercises-form-card {
  margin-bottom: 20px;
}

.admin-exercises-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-exercises-form__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-exercises-form__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted);
}

.admin-exercises-form__input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.875rem;
}

.admin-exercises-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.admin-exercises-form__cancel {
  padding: 8px 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}

.admin-exercises-table-wrap {
  margin-top: 8px;
}

.admin-exercises-table__url {
  max-width: 360px;
  word-break: break-all;
  font-size: 0.75rem;
}

.admin-exercises-table__link {
  color: #1d4ed8;
  text-decoration: underline;
}

.admin-exercises-table__delete {
  color: #c5221f;
  border-color: #f0b4ae;
  background: #fff5f5;
  margin-left: 8px;
}

.admin-exercises-table__delete:hover:not(:disabled) {
  background: #fce8e6;
}
</style>
