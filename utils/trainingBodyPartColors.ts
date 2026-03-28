import { TRAINING_BODY_PART_OTHER_LABEL } from "~/utils/trainingExerciseBodyParts";

/**
 * 部位ラベルごとの色（円グラフ凡例・トレーニングログカレンダーのチップで共通）
 * マスタの部位はすべて異なる色相
 */
const BODY_PART_HEX: Record<string, string> = {
  胸: "#2563eb",
  背中: "#db2777",
  肩: "#ea580c",
  腕: "#16a34a",
  腹筋: "#7c3aed",
  脚: "#0d9488",
  [TRAINING_BODY_PART_OTHER_LABEL]: "#64748b",
};

/** Chart.js の扇・カレンダーチップの背景色 */
export function chartBackgroundColorForBodyPart(label: string): string {
  const k = String(label || "").trim();
  return BODY_PART_HEX[k] ?? BODY_PART_HEX[TRAINING_BODY_PART_OTHER_LABEL];
}

/** トレーニングログカレンダー用チップ（凡例と同じ背景色＋読みやすい文字色） */
export function bodyPartCalendarChipStyle(label: string): {
  bg: string;
  color: string;
} {
  const bg = chartBackgroundColorForBodyPart(label);
  return { bg, color: "#ffffff" };
}
