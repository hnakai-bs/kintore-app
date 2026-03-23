/** トレーニング種目と解説ページURL（セッション・レコードで共通） */
const KINTORE_EXERCISE_ENTRIES = [
  {
    name: "ベンチプレス",
    guideUrl: "https://www.training-manual-bl.com/bench-press/",
  },
  {
    name: "インクラインダンベルプレス",
    guideUrl: "https://www.training-manual-bl.com/incline-dumbbell-press/",
  },
  {
    name: "マシンチェストプレス",
    guideUrl: "https://www.training-manual-bl.com/machine-chest-press/",
  },
  {
    name: "ケーブルクロスオーバー",
    guideUrl: "https://www.training-manual-bl.com/cable-crossover/",
  },
  {
    name: "ミリタリープレス",
    guideUrl: "https://www.training-manual-bl.com/military-press/",
  },
  {
    name: "アップライトロウ",
    guideUrl: "https://www.training-manual-bl.com/upright-row/",
  },
  {
    name: "サイドレイズ",
    guideUrl: "https://www.training-manual-bl.com/side-raise-dumbbell/",
  },
  {
    name: "リアレイズ",
    guideUrl: "https://www.training-manual-bl.com/rear-raise-machine/",
  },
  {
    name: "デッドリフト",
    guideUrl: "https://www.training-manual-bl.com/deadlift/",
  },
  {
    name: "ラットプルダウン",
    guideUrl: "https://www.training-manual-bl.com/lat-pulldown/",
  },
  {
    name: "シーテッドローイング",
    guideUrl: "https://www.training-manual-bl.com/seated-rowing/",
  },
  {
    name: "ストレートアームプルダウン",
    guideUrl: "https://www.training-manual-bl.com/straight-arm-pulldown/",
  },
  {
    name: "クローズグリップベンチ",
    guideUrl: "https://www.training-manual-bl.com/close-grip-bench-press/",
  },
  {
    name: "トライセップスプッシュダウン",
    guideUrl: "https://www.training-manual-bl.com/triceps-pushdown/",
  },
  {
    name: "バーベルスクワット",
    guideUrl: "https://www.training-manual-bl.com/barbell-squat/",
  },
  {
    name: "ブルガリアンスクワット",
    guideUrl: "https://www.training-manual-bl.com/bulgarian-squat/",
  },
  {
    name: "ルーマニアンデッドリフト（ダンベル）",
    guideUrl: "https://www.training-manual-bl.com/dumbbell-romanian-deadlift/",
  },
  {
    name: "レッグエクステンション",
    guideUrl: "https://www.training-manual-bl.com/leg-extension/",
  },
  {
    name: "インクラインダンベルカール",
    guideUrl: "https://www.training-manual-bl.com/incline-dumbbell-curl/",
  },
  {
    name: "ハンマーカール",
    guideUrl: "https://www.training-manual-bl.com/hammer-curl/",
  },
] as const;

export const KintoreExerciseCatalog = {
  entries: KINTORE_EXERCISE_ENTRIES,
  names(): string[] {
    return KINTORE_EXERCISE_ENTRIES.map((e) => e.name);
  },
  guideUrl(name: string): string {
    const n = String(name || "").trim();
    const hit = KINTORE_EXERCISE_ENTRIES.find((e) => e.name === n);
    return hit?.guideUrl ?? "";
  },
  isValid(name: string): boolean {
    const n = String(name || "").trim();
    return KINTORE_EXERCISE_ENTRIES.some((e) => e.name === n);
  },
};
