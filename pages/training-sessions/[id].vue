<script setup lang="ts">
import {
  matchesExerciseSearch,
  resolveExerciseNameFromInput,
} from "~/utils/exerciseSearch";
import { bodyPartCalendarChipStyle } from "~/utils/trainingBodyPartColors";

const exerciseCatalog = useTrainingExerciseCatalog();
const validNames = computed(() => exerciseCatalog.nameSet.value);
const allExerciseNames = computed(() => exerciseCatalog.names.value);

const route = useRoute();
const sessionId = computed(() => String(route.params.id || ""));

const kintoreSessions = useKintoreSessions();
const { ready } = kintoreSessions;

const sessionRev = ref(0);
function bumpSession() {
  sessionRev.value += 1;
}

const session = computed(() => {
  sessionRev.value;
  return kintoreSessions.getSession(sessionId.value);
});

const editTitle = ref("");
const exerciseLines = ref<string[]>([""]);
const saveHint = ref(false);
const persistError = ref<string | null>(null);
const deleteSessionError = ref<string | null>(null);
const deletingSession = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const draggedIndex = ref<number | null>(null);
const dropBeforeIndex = ref<number | null>(null);
const dropAfterIndex = ref<number | null>(null);

function showSaved() {
  saveHint.value = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveHint.value = false;
  }, 1200);
}

function exercisesToPersist(lines: string[]) {
  return lines.filter((n) => validNames.value.has(n));
}

async function persistEdit() {
  if (!sessionId.value) return;
  const res = await kintoreSessions.updateSession(sessionId.value, {
    title: editTitle.value,
    exercises: exercisesToPersist(exerciseLines.value),
  });
  if (!res.ok) {
    persistError.value = res.message;
    saveHint.value = false;
    return;
  }
  persistError.value = null;
  bumpSession();
  showSaved();
}

function syncEditorFromSession() {
  const s = kintoreSessions.getSession(sessionId.value);
  if (!s) return;
  editTitle.value = s.title;
  const stored = (s.exercises || []).filter((n) => validNames.value.has(n));
  exerciseLines.value = stored.length ? [...stored] : [""];
}

function guideUrl(name: string) {
  const n = String(name || "").trim();
  if (!n || !validNames.value.has(n)) return "";
  return exerciseCatalog.guideUrl(n);
}

/** トレーニング種目一覧・ログと同じ部位チップの色 */
function bodyPartChipStyleProps(exerciseName: string) {
  const s = bodyPartCalendarChipStyle(exerciseCatalog.bodyPart(exerciseName));
  return { background: s.bg, color: s.color };
}

function addExerciseRow() {
  exerciseLines.value = [...exerciseLines.value, ""];
}

function removeExerciseRow(i: number) {
  if (exerciseLines.value.length <= 1) {
    exerciseLines.value = [""];
    void persistEdit();
    return;
  }
  exerciseLines.value.splice(i, 1);
  exerciseLines.value = [...exerciseLines.value];
  void persistEdit();
}

const comboOpenIndex = ref<number | null>(null);
const comboQuery = ref("");
const comboBaseline = ref("");
let comboCloseTimer: ReturnType<typeof setTimeout> | null = null;

const filteredExerciseNamesForCombo = computed(() => {
  const q = comboQuery.value;
  const names = allExerciseNames.value;
  if (!q.trim()) return names;
  return names.filter((n) => matchesExerciseSearch(n, q));
});

function clearComboTimer() {
  if (comboCloseTimer) {
    clearTimeout(comboCloseTimer);
    comboCloseTimer = null;
  }
}

function closeComboCommit() {
  const i = comboOpenIndex.value;
  if (i == null) return;
  const q = comboQuery.value.trim();
  let next = comboBaseline.value;
  if (q === "") next = "";
  else if (validNames.value.has(q)) next = q;
  else {
    const resolved = resolveExerciseNameFromInput(
      q,
      validNames.value,
      allExerciseNames.value,
    );
    next = resolved ?? comboBaseline.value;
  }
  const prev = exerciseLines.value[i] ?? "";
  if (prev !== next) {
    exerciseLines.value[i] = next;
    exerciseLines.value = [...exerciseLines.value];
    void persistEdit();
  }
  comboOpenIndex.value = null;
}

function onExerciseComboFocus(i: number) {
  clearComboTimer();
  if (comboOpenIndex.value !== null && comboOpenIndex.value !== i) {
    closeComboCommit();
  }
  comboOpenIndex.value = i;
  comboBaseline.value = exerciseLines.value[i] ?? "";
  comboQuery.value = exerciseLines.value[i] ?? "";
}

function onExerciseComboBlur() {
  comboCloseTimer = setTimeout(() => {
    closeComboCommit();
    comboCloseTimer = null;
  }, 200);
}

function onExerciseComboInput(e: Event) {
  comboQuery.value = (e.target as HTMLInputElement).value;
}

function pickExerciseFromCombo(i: number, name: string) {
  clearComboTimer();
  exerciseLines.value[i] = name;
  exerciseLines.value = [...exerciseLines.value];
  comboOpenIndex.value = null;
  void persistEdit();
}

function onExerciseComboKeydown(i: number, e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    clearComboTimer();
    comboQuery.value = comboBaseline.value;
    comboOpenIndex.value = null;
    (e.target as HTMLInputElement).blur();
    return;
  }
  if (e.key === "Enter") {
    const filtered = filteredExerciseNamesForCombo.value;
    const t = comboQuery.value.trim();
    e.preventDefault();
    if (filtered.length === 1) {
      pickExerciseFromCombo(i, filtered[0]!);
    } else if (validNames.value.has(t)) {
      pickExerciseFromCombo(i, t);
    } else {
      const resolved = resolveExerciseNameFromInput(
        t,
        validNames.value,
        allExerciseNames.value,
      );
      if (resolved) pickExerciseFromCombo(i, resolved);
    }
  }
}

function onTitleChange() {
  void persistEdit();
}

function clearDropIndicators() {
  dropBeforeIndex.value = null;
  dropAfterIndex.value = null;
}

function onDragStart(i: number, e: DragEvent) {
  draggedIndex.value = i;
  e.dataTransfer?.setData("text/plain", "session-exercise-row");
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onDragEnd() {
  draggedIndex.value = null;
  clearDropIndicators();
}

function onDragOver(i: number, e: DragEvent) {
  if (draggedIndex.value == null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const target = (e.currentTarget as HTMLElement).closest(
    "[data-session-exercise]",
  ) as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  clearDropIndicators();
  if (draggedIndex.value === i) return;
  if (before) dropBeforeIndex.value = i;
  else dropAfterIndex.value = i;
}

function onDropRow(targetIndex: number, e: DragEvent) {
  e.preventDefault();
  const from = draggedIndex.value;
  clearDropIndicators();
  if (from == null) return;
  const lines = [...exerciseLines.value];
  const [moved] = lines.splice(from, 1);
  let t = targetIndex;
  if (from < targetIndex) t = targetIndex - 1;
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  let insert = before ? t : t + 1;
  insert = Math.max(0, Math.min(insert, lines.length));
  lines.splice(insert, 0, moved);
  exerciseLines.value = lines;
  draggedIndex.value = null;
  void persistEdit();
}

watch(
  [ready, sessionId],
  async () => {
    if (!ready.value) return;
    if (!kintoreSessions.getSession(sessionId.value)) {
      await navigateTo("/training-sessions");
      return;
    }
    syncEditorFromSession();
  },
  { immediate: true },
);

/** 種目マスタ読み込み後に、保存済み種目名を正しく反映し直す */
watch(
  () => exerciseCatalog.ready.value,
  (rdy) => {
    if (!rdy) return;
    if (!ready.value || !sessionId.value) return;
    if (!kintoreSessions.getSession(sessionId.value)) return;
    syncEditorFromSession();
  },
);

watch(
  () => session.value?.title,
  (t) => {
    if (t) {
      useHead({ title: `${t} — セッション` });
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  clearComboTimer();
  void persistEdit();
});

async function confirmAndDeleteSession() {
  const s = session.value;
  if (!s) return;
  if (
    !confirm(
      `「${s.title}」を削除しますか？\n一覧からも消え、この操作は取り消せません。`,
    )
  ) {
    return;
  }
  deleteSessionError.value = null;
  deletingSession.value = true;
  try {
    const res = await kintoreSessions.deleteSession(sessionId.value);
    if (!res.ok) {
      deleteSessionError.value = res.message;
      return;
    }
    await navigateTo("/training-sessions");
  } finally {
    deletingSession.value = false;
  }
}
</script>

<template>
  <main
    v-if="session"
    id="session-main"
    class="main"
  >
    <div class="sessions-detail-toolbar">
      <NuxtLink to="/training-sessions" class="sessions-back-btn">
        <span class="sessions-back-btn__mark" aria-hidden="true">＜</span>戻る
      </NuxtLink>
    </div>

    <div
      id="session-edit-panel"
      class="session-edit-panel"
    >
      <h1 class="session-view-title">
        {{ editTitle.trim() || session.title }}
      </h1>
      <p class="session-edit-lead">変更は入力のたびに自動保存されます。</p>

      <div id="session-title-field" class="field">
        <label class="session-field-label" for="session-title-custom">セッション名</label>
        <input
          id="session-title-custom"
          v-model="editTitle"
          type="text"
          class="session-title-input"
          maxlength="80"
          autocomplete="off"
          @change="onTitleChange"
        />
      </div>

      <section class="card" aria-labelledby="session-exercises-heading">
        <h2 id="session-exercises-heading" class="section-title">
          トレーニング種目
        </h2>
        <p class="session-exercises-hint">
          種目を選ぶと「解説ページを開く」が表示されます。左のつまみをドラッグして並べ替えられます（PC向け）。
        </p>
        <div id="session-exercise-list" class="session-exercise-list">
          <div
            v-for="(line, i) in exerciseLines"
            :key="i"
            data-session-exercise
            class="session-exercise-row"
            :class="{
              'session-exercise-row--dragging': draggedIndex === i,
              'session-exercise-row--drop-before': dropBeforeIndex === i,
              'session-exercise-row--drop-after': dropAfterIndex === i,
            }"
            @dragover="onDragOver(i, $event)"
            @drop="onDropRow(i, $event)"
          >
            <div class="session-exercise-row__toolbar">
              <span
                class="session-exercise-drag"
                draggable="true"
                aria-label="ドラッグして並べ替え"
                title="ドラッグして並べ替え"
                @dragstart="onDragStart(i, $event)"
                @dragend="onDragEnd"
              >
                <svg
                  class="session-exercise-drag__icon"
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="14"
                  viewBox="0 0 20 14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="3" r="1.5" />
                  <circle cx="5" cy="7" r="1.5" />
                  <circle cx="5" cy="11" r="1.5" />
                  <circle cx="11" cy="3" r="1.5" />
                  <circle cx="11" cy="7" r="1.5" />
                  <circle cx="11" cy="11" r="1.5" />
                </svg>
              </span>
              <span class="session-exercise-row__label">種目 {{ i + 1 }}</span>
              <button
                v-if="exerciseLines.length > 1"
                type="button"
                class="session-exercise-rm"
                data-session-ex-rm
                :aria-label="`種目${i + 1}を削除`"
                @click="removeExerciseRow(i)"
              >
                削除
              </button>
            </div>
            <div
              class="session-exercise-combo"
              :class="{ 'session-exercise-combo--open': comboOpenIndex === i }"
            >
              <input
                :id="`session-exercise-combo-${i}`"
                type="text"
                enterkeyhint="search"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                class="session-exercise-combo-input"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="comboOpenIndex === i ? 'true' : 'false'"
                :aria-controls="`session-exercise-listbox-${i}`"
                :aria-label="`種目${i + 1}を検索して選択`"
                placeholder="種目を検索"
                :value="comboOpenIndex === i ? comboQuery : line"
                @focus="onExerciseComboFocus(i)"
                @blur="onExerciseComboBlur"
                @input="onExerciseComboInput($event)"
                @keydown="onExerciseComboKeydown(i, $event)"
              />
              <ul
                v-show="comboOpenIndex === i"
                :id="`session-exercise-listbox-${i}`"
                class="session-exercise-combo-list"
                role="listbox"
                :aria-label="`種目${i + 1}の候補`"
                @mousedown.prevent
              >
                <li
                  v-for="name in filteredExerciseNamesForCombo"
                  :key="name"
                  class="session-exercise-combo-option"
                  role="option"
                  :aria-selected="line === name ? 'true' : 'false'"
                  @mousedown="pickExerciseFromCombo(i, name)"
                >
                  {{ name }}
                </li>
                <li
                  v-if="filteredExerciseNamesForCombo.length === 0"
                  class="session-exercise-combo-empty"
                  role="presentation"
                >
                  該当する種目がありません
                </li>
              </ul>
            </div>
            <span
              v-if="line && validNames.has(line)"
              class="training-bodypart-chip training-bodypart-chip--log session-exercise-bodypart-chip"
              :style="bodyPartChipStyleProps(line)"
            >{{ exerciseCatalog.bodyPart(line) }}</span>
            <div
              v-if="!line || !validNames.has(line)"
              class="session-exercise-guide session-exercise-guide--placeholder"
              aria-hidden="true"
            />
            <div v-else-if="!guideUrl(line)" class="session-exercise-guide">
              <p class="session-exercise-guide-muted">
                この種目の解説URLは未登録です
              </p>
            </div>
            <div v-else class="session-exercise-guide">
              <a
                :href="guideUrl(line)"
                class="session-exercise-guide-link"
                target="_blank"
                rel="noopener noreferrer"
              >解説ページを開く</a>
            </div>
          </div>
        </div>
        <button
          id="session-exercise-add"
          type="button"
          class="session-exercise-add"
          @click="addExerciseRow"
        >
          ＋ 種目を追加
        </button>
      </section>

      <p id="save-hint" class="save-hint" :hidden="!saveHint">保存しました</p>
      <p v-if="persistError" class="firestore-alert" role="alert">
        {{ persistError }}
      </p>
    </div>

    <div class="session-detail-delete">
      <p class="session-detail-delete__note">
        このセッションを削除すると、一覧からも消えます。
      </p>
      <p
        v-if="deleteSessionError"
        class="firestore-alert"
        role="alert"
      >
        {{ deleteSessionError }}
      </p>
      <button
        type="button"
        class="session-detail-delete__btn"
        :disabled="deletingSession"
        @click="confirmAndDeleteSession"
      >
        {{ deletingSession ? "削除中…" : "このセッションを削除" }}
      </button>
    </div>
  </main>
</template>

<style>
@import "~/assets/css/sessions.css";
@import "~/assets/css/training.css";
</style>
