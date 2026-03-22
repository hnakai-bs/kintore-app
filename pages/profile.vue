<script setup lang="ts">
type Profile = {
  nickname: string;
  height: number | "";
  weight: number | "";
  bodyFat: number | "";
  trainingExperience: string;
  bulkOrCut: string;
  goalCalories: number | "";
  goalProtein: number | "";
  goalFat: number | "";
  goalCarbs: number | "";
  goalFiber: number | "";
  goalWeight: number | "";
  goalSleep: number | "";
};

const DEFAULT_PROFILE: Profile = {
  nickname: "",
  height: "",
  weight: "",
  bodyFat: "",
  trainingExperience: "",
  bulkOrCut: "",
  goalCalories: "",
  goalProtein: "",
  goalFat: "",
  goalCarbs: "",
  goalFiber: "",
  goalWeight: "",
  goalSleep: "",
};

function profileFromServer(data: Record<string, unknown>): Profile {
  const p = { ...DEFAULT_PROFILE };
  const numericKeys: (keyof Profile)[] = [
    "height",
    "weight",
    "bodyFat",
    "goalCalories",
    "goalProtein",
    "goalFat",
    "goalCarbs",
    "goalFiber",
    "goalWeight",
    "goalSleep",
  ];
  for (const key of numericKeys) {
    if (!(key in data)) continue;
    const v = data[key];
    if (v === "" || v == null) {
      (p as Record<string, number | "">)[key] = "";
      continue;
    }
    const n = Number(v);
    (p as Record<string, number | "">)[key] = Number.isFinite(n) ? n : "";
  }
  if ("trainingExperience" in data && data.trainingExperience != null) {
    p.trainingExperience = String(data.trainingExperience);
  }
  if ("bulkOrCut" in data && data.bulkOrCut != null) {
    p.bulkOrCut = String(data.bulkOrCut);
  }
  if ("nickname" in data && data.nickname != null) {
    p.nickname = String(data.nickname).trim().slice(0, 40);
  }
  return p;
}

/** Firestore 用のプレーンオブジェクト（`users/{uid}/settings/profile`） */
function profileToFirestore(p: Profile): Record<string, unknown> {
  const n = (v: number | "") => (v === "" ? null : v);
  return {
    height: n(p.height),
    weight: n(p.weight),
    bodyFat: n(p.bodyFat),
    goalCalories: n(p.goalCalories),
    goalProtein: n(p.goalProtein),
    goalFat: n(p.goalFat),
    goalCarbs: n(p.goalCarbs),
    goalFiber: n(p.goalFiber),
    goalWeight: n(p.goalWeight),
    goalSleep: n(p.goalSleep),
    trainingExperience: p.trainingExperience || null,
    bulkOrCut: p.bulkOrCut || null,
    nickname: p.nickname.trim() ? p.nickname.trim().slice(0, 40) : null,
  };
}

function activityFactor(exp: string) {
  switch (exp) {
    case "半年未満":
      return 1.36;
    case "半年〜1年":
      return 1.42;
    case "1〜3年":
      return 1.48;
    case "3年以上":
      return 1.54;
    default:
      return 1.45;
  }
}

function computeGoalsFromProfile(p: Profile) {
  const w = Number(p.weight);
  if (!Number.isFinite(w) || w <= 0) {
    return {
      goalCalories: "" as const,
      goalProtein: "" as const,
      goalFat: "" as const,
      goalCarbs: "" as const,
      goalFiber: "" as const,
    };
  }

  const bf = Number(p.bodyFat);
  const h = Number(p.height);
  const lean =
    Number.isFinite(bf) && bf >= 5 && bf <= 55 ? w * (1 - bf / 100) : w;

  let bmr: number;
  if (Number.isFinite(bf) && bf >= 5 && bf <= 55) {
    bmr = 370 + 21.6 * lean;
  } else if (Number.isFinite(h) && h > 100 && h < 230) {
    bmr = 10 * w + 6.25 * h - 5 * 30 - 161;
  } else {
    bmr = 22 * w;
  }

  const f = activityFactor(p.trainingExperience);
  let kcal = Math.round(bmr * f);
  if (p.bulkOrCut === "増量") kcal += 280;
  else if (p.bulkOrCut === "減量") kcal -= 420;
  kcal = Math.max(1300, kcal);

  const proteinG = Math.round(lean * 2);
  let fatG = Math.round((kcal * 0.27) / 9);
  fatG = Math.max(35, fatG);
  let carbKcal = kcal - proteinG * 4 - fatG * 9;
  if (carbKcal < 200) {
    fatG = Math.max(30, Math.round((kcal - proteinG * 4 - 200) / 9));
    carbKcal = kcal - proteinG * 4 - fatG * 9;
  }
  const carbG = Math.max(0, Math.round(carbKcal / 4));
  const fiberG = Math.min(30, Math.max(18, Math.round(kcal / 92)));

  return {
    goalCalories: kcal,
    goalProtein: proteinG,
    goalFat: fatG,
    goalCarbs: carbG,
    goalFiber: fiberG,
  };
}

useHead({ title: "プロフィール" });

function formatCommentDateJa(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(y, m - 1, d, 12, 0, 0, 0));
}

const { user } = useFirebaseAuth();
const profileFirestore = useProfileFirestore();
const inbox = useTrainerCommentsInbox();
const profile = reactive<Profile>({ ...DEFAULT_PROFILE });
const saveError = ref<string | null>(null);
const loadError = ref<string | null>(null);

async function applyComputedGoals() {
  const g = computeGoalsFromProfile(profile);
  Object.assign(profile, {
    goalCalories: g.goalCalories,
    goalProtein: g.goalProtein,
    goalFat: g.goalFat,
    goalCarbs: g.goalCarbs,
    goalFiber: g.goalFiber,
  });
  const r = await profileFirestore.merge(profileToFirestore(profile));
  if (!r.ok) {
    saveError.value = r.message;
    return;
  }
  saveError.value = null;
}

async function persistProfileMerge() {
  const r = await profileFirestore.merge(profileToFirestore(profile));
  if (!r.ok) {
    saveError.value = r.message;
    return;
  }
  saveError.value = null;
}

/** 身長・体重など変更時: 目標カロリー・PFC を式で上書きして保存 */
async function patchProfile(patch: Partial<Profile>) {
  Object.assign(profile, patch);
  await applyComputedGoals();
}

/** 目標体重・睡眠・カロリー/PFC 手入力: 再計算せず保存のみ */
async function patchGoalsManual(patch: Partial<Profile>) {
  Object.assign(profile, patch);
  await persistProfileMerge();
}

function onBasicNumberInput(
  key: "height" | "weight" | "bodyFat",
  raw: string,
) {
  if (raw === "") {
    void patchProfile({ [key]: "" } as Partial<Profile>);
    return;
  }
  const num = Number(raw);
  void patchProfile({
    [key]: Number.isFinite(num) ? num : "",
  } as Partial<Profile>);
}

function onGoalWeightSleepInput(key: "goalWeight" | "goalSleep", raw: string) {
  if (raw === "") {
    void patchGoalsManual({ [key]: "" } as Partial<Profile>);
    return;
  }
  const num = Number(raw);
  void patchGoalsManual({
    [key]: Number.isFinite(num) ? num : "",
  } as Partial<Profile>);
}

function onGoalMacroInput(
  key:
    | "goalCalories"
    | "goalProtein"
    | "goalFat"
    | "goalCarbs"
    | "goalFiber",
  raw: string,
) {
  if (raw === "") {
    void patchGoalsManual({ [key]: "" } as Partial<Profile>);
    return;
  }
  const num = Number(raw);
  void patchGoalsManual({
    [key]: Number.isFinite(num) ? num : "",
  } as Partial<Profile>);
}

function onSelectChange(key: keyof Profile, v: string) {
  void patchProfile({ [key]: v } as Partial<Profile>);
}

function onBulkCutChange(v: string) {
  void patchProfile({ bulkOrCut: v });
}

function onNicknameChange(raw: string) {
  const nickname = raw.trim().slice(0, 40);
  void patchGoalsManual({ nickname });
}

function inputVal(e: Event) {
  return (e.target as HTMLInputElement).value;
}

function selectVal(e: Event) {
  return (e.target as HTMLSelectElement).value;
}

function shouldBackfillComputedGoals(p: Profile) {
  const hasAnyMacro =
    (p.goalCalories !== "" && p.goalCalories != null) ||
    (p.goalProtein !== "" && p.goalProtein != null) ||
    (p.goalFat !== "" && p.goalFat != null) ||
    (p.goalCarbs !== "" && p.goalCarbs != null) ||
    (p.goalFiber !== "" && p.goalFiber != null);
  if (hasAnyMacro) return false;
  const w = Number(p.weight);
  return Number.isFinite(w) && w > 0;
}

async function hydrateProfileFromCloud() {
  loadError.value = null;
  try {
    const data = await profileFirestore.load();
    Object.assign(profile, profileFromServer(data));
    if (shouldBackfillComputedGoals(profile)) {
      await applyComputedGoals();
    }
  } catch (e) {
    loadError.value =
      e instanceof Error ? e.message : "プロフィールの読み込みに失敗しました";
  }
}

onMounted(() => {
  void hydrateProfileFromCloud();
  void inbox.refreshInbox();
});

onBeforeUnmount(() => {
  void inbox.markAllInListAsSeen();
});

watch(
  () => user.value?.uid,
  (uid, prevUid) => {
    if (!uid) return;
    if (prevUid === undefined) return;
    if (uid === prevUid) return;
    void hydrateProfileFromCloud();
    void inbox.refreshInbox();
  },
);
</script>

<template>
  <main class="main">
    <h1 class="page-title">プロフィール</h1>

    <p
      v-if="loadError"
      class="profile-alert profile-alert--error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <section
      v-if="user?.uid"
      class="card profile-trainer-comments"
      aria-labelledby="profile-trainer-comments-h"
    >
      <h2 id="profile-trainer-comments-h" class="profile-section-title">
        トレーナーからのコメント
      </h2>
      <p class="profile-section-note">
        ヘッダーのベルからも同じ一覧を開けます。ページを離れると表示中のコメントは閲覧済みになります。
      </p>
      <p
        v-if="inbox.error"
        class="profile-alert profile-alert--error"
        role="alert"
      >
        {{ inbox.error }}
      </p>
      <p
        v-else-if="inbox.loading"
        class="profile-trainer-comments__loading"
      >
        読み込み中…
      </p>
      <p
        v-else-if="inbox.comments.length === 0"
        class="profile-trainer-comments__empty"
      >
        まだコメントはありません。
      </p>
      <ul v-else class="profile-trainer-comments__list">
        <li
          v-for="c in inbox.comments"
          :key="c.id"
          class="profile-trainer-comments__item"
          :class="{
            'profile-trainer-comments__item--unread': !inbox.isCommentRead(c.id),
          }"
        >
          <div class="profile-trainer-comments__meta">
            <span class="profile-trainer-comments__date">{{
              formatCommentDateJa(c.date)
            }}</span>
            <span
              class="profile-trainer-comments__read-badge"
              :class="{
                'profile-trainer-comments__read-badge--unread':
                  !inbox.isCommentRead(c.id),
              }"
            >{{
              inbox.isCommentRead(c.id) ? "閲覧済み" : "未読"
            }}</span>
          </div>
          <p class="profile-trainer-comments__text">{{ c.text }}</p>
        </li>
      </ul>
    </section>

    <form class="profile-form" autocomplete="off" @submit.prevent>
      <section class="card profile-card" aria-labelledby="profile-basic-heading">
        <h2 id="profile-basic-heading" class="profile-section-title">基本情報</h2>
        <div class="fields">
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-sleep)" />
              ニックネーム
            </span>
            <input
              type="text"
              autocomplete="nickname"
              maxlength="40"
              :value="profile.nickname"
              placeholder="表示名（任意）"
              @change="onNicknameChange(inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-condition)" />
              身長<span class="unit">（cm）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              min="0"
              :value="profile.height === '' ? '' : String(profile.height)"
              placeholder="—"
              @change="onBasicNumberInput('height', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-weight)" />
              体重<span class="unit">（kg）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              min="0"
              :value="profile.weight === '' ? '' : String(profile.weight)"
              placeholder="—"
              @change="onBasicNumberInput('weight', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-fat)" />
              体脂肪率<span class="unit">（%）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              min="0"
              :value="profile.bodyFat === '' ? '' : String(profile.bodyFat)"
              placeholder="—"
              @change="onBasicNumberInput('bodyFat', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--accent)" />
              トレーニング経験
            </span>
            <select
              :value="profile.trainingExperience"
              aria-label="トレーニング経験"
              @change="onSelectChange('trainingExperience', selectVal($event))"
            >
              <option value="">選択してください</option>
              <option value="半年未満">半年未満</option>
              <option value="半年〜1年">半年〜1年</option>
              <option value="1〜3年">1〜3年</option>
              <option value="3年以上">3年以上</option>
            </select>
          </div>
          <div class="field" data-profile="bulk-cut">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-protein)" />
              増量 or 減量
            </span>
            <div class="segmented condition-seg" role="group" aria-label="増量 or 減量">
              <input
                id="bulk-none"
                type="radio"
                name="bulkOrCut"
                value=""
                :checked="profile.bulkOrCut === ''"
                @change="onBulkCutChange('')"
              />
              <label for="bulk-none">—</label>
              <input
                id="bulk-up"
                type="radio"
                name="bulkOrCut"
                value="増量"
                :checked="profile.bulkOrCut === '増量'"
                @change="onBulkCutChange('増量')"
              />
              <label for="bulk-up">増量</label>
              <input
                id="bulk-down"
                type="radio"
                name="bulkOrCut"
                value="減量"
                :checked="profile.bulkOrCut === '減量'"
                @change="onBulkCutChange('減量')"
              />
              <label for="bulk-down">減量</label>
              <input
                id="bulk-maintain"
                type="radio"
                name="bulkOrCut"
                value="維持"
                :checked="profile.bulkOrCut === '維持'"
                @change="onBulkCutChange('維持')"
              />
              <label for="bulk-maintain">維持</label>
            </div>
          </div>
        </div>
      </section>

      <section class="card profile-card" aria-labelledby="profile-goals-heading">
        <h2 id="profile-goals-heading" class="profile-section-title">目標</h2>
        <p class="profile-section-note">
          目標カロリー・PFCは基本情報変更時に自動で再計算されます。表示後はいずれも手で修正できます（再計算で上書きされます）。
        </p>
        <div class="fields">
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-weight)" />
              目標体重<span class="unit">（kg）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              min="0"
              :value="profile.goalWeight === '' ? '' : String(profile.goalWeight)"
              placeholder="—"
              @change="onGoalWeightSleepInput('goalWeight', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-sleep)" />
              目標睡眠時間<span class="unit">（h）</span>
            </span>
            <input
              type="number"
              inputmode="decimal"
              step="0.1"
              min="0"
              max="24"
              :value="profile.goalSleep === '' ? '' : String(profile.goalSleep)"
              placeholder="—"
              @change="onGoalWeightSleepInput('goalSleep', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-cal)" />
              目標カロリー<span class="unit">（kcal）</span>
            </span>
            <input
              id="profile-goal-calories"
              type="number"
              inputmode="numeric"
              step="1"
              min="0"
              aria-label="目標カロリー（kcal）"
              :value="profile.goalCalories === '' ? '' : String(profile.goalCalories)"
              placeholder="—"
              @change="onGoalMacroInput('goalCalories', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-protein)" />
              タンパク質<span class="unit">（g）</span>
            </span>
            <input
              id="profile-goal-protein"
              type="number"
              inputmode="decimal"
              step="1"
              min="0"
              aria-label="目標タンパク質（g）"
              :value="profile.goalProtein === '' ? '' : String(profile.goalProtein)"
              placeholder="—"
              @change="onGoalMacroInput('goalProtein', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-fat)" />
              脂質<span class="unit">（g）</span>
            </span>
            <input
              id="profile-goal-fat"
              type="number"
              inputmode="decimal"
              step="1"
              min="0"
              aria-label="目標脂質（g）"
              :value="profile.goalFat === '' ? '' : String(profile.goalFat)"
              placeholder="—"
              @change="onGoalMacroInput('goalFat', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-carb)" />
              炭水化物<span class="unit">（g）</span>
            </span>
            <input
              id="profile-goal-carbs"
              type="number"
              inputmode="decimal"
              step="1"
              min="0"
              aria-label="目標炭水化物（g）"
              :value="profile.goalCarbs === '' ? '' : String(profile.goalCarbs)"
              placeholder="—"
              @change="onGoalMacroInput('goalCarbs', inputVal($event))"
            />
          </div>
          <div class="field">
            <span class="field-label">
              <span class="field-label-dot" style="background: var(--c-fiber)" />
              食物繊維<span class="unit">（g）</span>
            </span>
            <input
              id="profile-goal-fiber"
              type="number"
              inputmode="decimal"
              step="1"
              min="0"
              aria-label="目標食物繊維（g）"
              :value="profile.goalFiber === '' ? '' : String(profile.goalFiber)"
              placeholder="—"
              @change="onGoalMacroInput('goalFiber', inputVal($event))"
            />
          </div>
        </div>
      </section>

      <p
        v-if="saveError"
        id="profile-save-error"
        class="profile-alert profile-alert--error"
        role="alert"
      >
        {{ saveError }}
      </p>
    </form>
  </main>
</template>

<style>
@import "~/assets/css/profile.css";
</style>
