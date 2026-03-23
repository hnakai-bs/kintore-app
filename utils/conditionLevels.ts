/** コンディションレコード「体調」の選択肢（上から順に良い→悪い） */
export const CONDITION_LEVEL_LABELS = [
  "絶好調",
  "好調",
  "普通",
  "不調",
  "絶不調",
] as const;

export type ConditionLevelLabel = (typeof CONDITION_LEVEL_LABELS)[number];

export function isConditionLevelLabel(s: string): s is ConditionLevelLabel {
  return (CONDITION_LEVEL_LABELS as readonly string[]).includes(s);
}

/** 体調レベルごとの顔文字（UI 表示用。Firestore にはラベル文字列のみ保存） */
export const CONDITION_LEVEL_EMOJI: Record<ConditionLevelLabel, string> = {
  絶好調: "😍",
  好調: "😄",
  普通: "🙂",
  不調: "😰",
  絶不調: "💀",
};

export function conditionLabelWithEmoji(label: ConditionLevelLabel): string {
  return `${label} ${CONDITION_LEVEL_EMOJI[label]}`;
}

/** 定義済みラベルなら顔文字、それ以外は空 */
export function conditionEmojiForLabel(s: string): string {
  if (!isConditionLevelLabel(s)) return "";
  return CONDITION_LEVEL_EMOJI[s];
}
