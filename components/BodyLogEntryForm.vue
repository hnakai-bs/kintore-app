<script setup lang="ts">
import type { BodyLogEntry } from "~/composables/useBodyLog";

const props = defineProps<{
  entryId?: string;
}>();

const { entries, addEntry, updateEntry, deleteEntry, loadFromStorage } =
  useBodyLog();

const saveError = ref("");
const deleteError = ref("");
const saving = ref(false);
const deleting = ref(false);

const isEdit = computed(() => Boolean(props.entryId));

const dateStr = ref("");
const frontUrl = ref<string | null>(null);
const backUrl = ref<string | null>(null);
const sideUrl = ref<string | null>(null);
const extraUrl = ref<string | null>(null);

const frontFile = ref<HTMLInputElement | null>(null);
const backFile = ref<HTMLInputElement | null>(null);
const sideFile = ref<HTMLInputElement | null>(null);
const extraFile = ref<HTMLInputElement | null>(null);

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function applyEntry(e: BodyLogEntry) {
  dateStr.value = e.date;
  frontUrl.value = e.front;
  backUrl.value = e.back;
  sideUrl.value = e.side;
  extraUrl.value = e.extra;
}

async function hydrateFromStorage() {
  await loadFromStorage();
  if (props.entryId) {
    const e = entries.value.find((x) => x.id === props.entryId);
    if (e) applyEntry(e);
    else await navigateTo("/body-log");
  } else if (!dateStr.value) {
    dateStr.value = ymdToday();
  }
}

onMounted(() => {
  void hydrateFromStorage();
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

async function onFile(
  e: Event,
  slot: "frontUrl" | "backUrl" | "sideUrl" | "extraUrl",
) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) {
    input.value = "";
    return;
  }
  try {
    const url = await fileToDataUrl(file);
    if (slot === "frontUrl") frontUrl.value = url;
    else if (slot === "backUrl") backUrl.value = url;
    else if (slot === "sideUrl") sideUrl.value = url;
    else extraUrl.value = url;
  } catch {
    /* ignore */
  }
  input.value = "";
}

function clearSlot(slot: "frontUrl" | "backUrl" | "sideUrl" | "extraUrl") {
  if (slot === "frontUrl") frontUrl.value = null;
  else if (slot === "backUrl") backUrl.value = null;
  else if (slot === "sideUrl") sideUrl.value = null;
  else extraUrl.value = null;
}

async function onSubmit(e: Event) {
  e.preventDefault();
  saveError.value = "";
  if (!dateStr.value || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.value)) {
    return;
  }
  saving.value = true;
  try {
    const payload = {
      date: dateStr.value,
      front: frontUrl.value,
      back: backUrl.value,
      side: sideUrl.value,
      extra: extraUrl.value,
    };
    if (props.entryId) {
      const ok = await updateEntry(props.entryId, payload);
      if (ok) await navigateTo("/body-log");
    } else {
      const entry: BodyLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        ...payload,
      };
      await addEntry(entry);
      await navigateTo("/body-log");
    }
  } catch {
    saveError.value =
      "保存に失敗しました。ネットワークと Firebase の設定を確認してください。";
  } finally {
    saving.value = false;
  }
}

function formatDateLabelConfirm(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  dt.setHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(dt);
}

async function confirmAndDeleteEntry() {
  if (!props.entryId) return;
  const label = formatDateLabelConfirm(dateStr.value);
  if (
    !confirm(
      `「${label}」の記録を本当に削除しますか？\n削除すると元に戻せません。`,
    )
  ) {
    return;
  }
  deleteError.value = "";
  deleting.value = true;
  try {
    await deleteEntry(props.entryId);
    await navigateTo("/body-log");
  } catch {
    deleteError.value =
      "削除に失敗しました。しばらくしてから再度お試しください。";
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <form class="card body-log-form-card" autocomplete="off" @submit="onSubmit">
    <div class="field">
      <span class="field-label">
        <span class="field-label-dot" style="background: var(--accent)" />
        日付
      </span>
      <div class="body-log-date-shell">
        <input
          id="body-log-date"
          v-model="dateStr"
          class="body-log-date-input"
          type="date"
          required
        >
      </div>
    </div>

    <div class="field body-log-photo-field">
      <span class="field-label">
        <span class="field-label-dot" style="background: var(--c-condition)" />
        体の正面
      </span>
      <input
        ref="frontFile"
        type="file"
        class="body-log-file-input"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile($event, 'frontUrl')"
      >
      <button
        v-if="!frontUrl"
        type="button"
        class="body-log-file-btn"
        @click="frontFile?.click()"
      >
        写真を選択
      </button>
      <div v-else class="body-log-photo-frame">
        <button
          type="button"
          class="body-log-photo-tap"
          aria-label="写真を差し替え"
          @click="frontFile?.click()"
        >
          <img
            class="body-log-preview"
            :src="frontUrl"
            alt="正面のプレビュー"
          >
        </button>
        <button
          type="button"
          class="body-log-photo-remove"
          aria-label="この写真を削除"
          @click.stop="clearSlot('frontUrl')"
        >
          ×
        </button>
      </div>
    </div>

    <div class="field body-log-photo-field">
      <span class="field-label">
        <span class="field-label-dot" style="background: var(--c-weight)" />
        体の背面
      </span>
      <input
        ref="backFile"
        type="file"
        class="body-log-file-input"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile($event, 'backUrl')"
      >
      <button
        v-if="!backUrl"
        type="button"
        class="body-log-file-btn"
        @click="backFile?.click()"
      >
        写真を選択
      </button>
      <div v-else class="body-log-photo-frame">
        <button
          type="button"
          class="body-log-photo-tap"
          aria-label="写真を差し替え"
          @click="backFile?.click()"
        >
          <img
            class="body-log-preview"
            :src="backUrl"
            alt="背面のプレビュー"
          >
        </button>
        <button
          type="button"
          class="body-log-photo-remove"
          aria-label="この写真を削除"
          @click.stop="clearSlot('backUrl')"
        >
          ×
        </button>
      </div>
    </div>

    <div class="field body-log-photo-field">
      <span class="field-label">
        <span class="field-label-dot" style="background: var(--c-protein)" />
        体の側面
      </span>
      <input
        ref="sideFile"
        type="file"
        class="body-log-file-input"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile($event, 'sideUrl')"
      >
      <button
        v-if="!sideUrl"
        type="button"
        class="body-log-file-btn"
        @click="sideFile?.click()"
      >
        写真を選択
      </button>
      <div v-else class="body-log-photo-frame">
        <button
          type="button"
          class="body-log-photo-tap"
          aria-label="写真を差し替え"
          @click="sideFile?.click()"
        >
          <img
            class="body-log-preview"
            :src="sideUrl"
            alt="側面のプレビュー"
          >
        </button>
        <button
          type="button"
          class="body-log-photo-remove"
          aria-label="この写真を削除"
          @click.stop="clearSlot('sideUrl')"
        >
          ×
        </button>
      </div>
    </div>

    <div class="field body-log-photo-field">
      <span class="field-label">
        <span class="field-label-dot" style="background: var(--c-cal)" />
        その他
      </span>
      <input
        ref="extraFile"
        type="file"
        class="body-log-file-input"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile($event, 'extraUrl')"
      >
      <button
        v-if="!extraUrl"
        type="button"
        class="body-log-file-btn"
        @click="extraFile?.click()"
      >
        写真を選択
      </button>
      <div v-else class="body-log-photo-frame">
        <button
          type="button"
          class="body-log-photo-tap"
          aria-label="写真を差し替え"
          @click="extraFile?.click()"
        >
          <img
            class="body-log-preview"
            :src="extraUrl"
            alt="その他のプレビュー"
          >
        </button>
        <button
          type="button"
          class="body-log-photo-remove"
          aria-label="この写真を削除"
          @click.stop="clearSlot('extraUrl')"
        >
          ×
        </button>
      </div>
    </div>

    <p
      v-if="saveError"
      class="body-log-save-error"
      role="alert"
    >
      {{ saveError }}
    </p>

    <button
      type="submit"
      class="sessions-btn-primary body-log-form-submit"
      :disabled="saving || deleting"
    >
      {{
        saving
          ? "保存中…"
          : isEdit
            ? "更新して一覧へ"
            : "保存して一覧へ"
      }}
    </button>
  </form>

  <div v-if="isEdit" class="body-log-edit-delete">
    <p class="body-log-edit-delete__note">
      この記録を削除すると、写真とデータは元に戻せません。
    </p>
    <p
      v-if="deleteError"
      class="body-log-save-error body-log-edit-delete__error"
      role="alert"
    >
      {{ deleteError }}
    </p>
    <button
      type="button"
      class="body-log-edit-delete__btn"
      :disabled="saving || deleting"
      @click="confirmAndDeleteEntry"
    >
      {{ deleting ? "削除中…" : "この記録を削除" }}
    </button>
  </div>
</template>
