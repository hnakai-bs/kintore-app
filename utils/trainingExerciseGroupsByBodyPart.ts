import type { TrainingExerciseRow } from "~/composables/useTrainingExerciseCatalog";
import { TRAINING_BODY_PART_OTHER_LABEL } from "~/utils/trainingExerciseBodyParts";

const BODY_PART_ORDER = [
  "胸",
  "背中",
  "肩",
  "腕",
  "腹筋",
  "脚",
  TRAINING_BODY_PART_OTHER_LABEL,
] as const;

const partOrderIndex = new Map(
  BODY_PART_ORDER.map((p, i) => [p, i] as const),
);

export type ExerciseBodyPartGroup = { part: string; names: string[] };

/**
 * Firestore 種目マスタを部位ラベルでまとめ、表示順でソートする。
 */
export function groupsByBodyPart(
  entries: TrainingExerciseRow[],
): ExerciseBodyPartGroup[] {
  const map = new Map<string, string[]>();
  for (const e of entries) {
    const n = String(e.name ?? "").trim();
    if (!n) continue;
    const part =
      String(e.bodyPart ?? "").trim() || TRAINING_BODY_PART_OTHER_LABEL;
    if (!map.has(part)) map.set(part, []);
    map.get(part)!.push(n);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = partOrderIndex.get(a) ?? 999;
    const ib = partOrderIndex.get(b) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "ja");
  });
  return keys.map((part) => {
    const names = [...map.get(part)!].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
    return { part, names };
  });
}
