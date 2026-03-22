/**
 * `users/{uid}/training/{yyyy-mm-dd}` の sets 配列を一覧用の短文にまとめる。
 */
export function formatTrainingDaySummary(sets: unknown): string {
  if (!Array.isArray(sets) || sets.length === 0) return "—";

  const parts: string[] = [];
  for (const row of sets) {
    if (!row || typeof row !== "object") continue;
    const o = row as { exercise?: unknown; weight?: unknown; reps?: unknown };
    const exercise = o.exercise != null ? String(o.exercise).trim() : "";
    const repsRaw = o.reps;
    const weightRaw = o.weight;
    const hasReps =
      repsRaw !== "" &&
      repsRaw != null &&
      Number.isFinite(parseInt(String(repsRaw), 10));
    if (!exercise && !hasReps) continue;

    const repStr =
      repsRaw === "" || repsRaw == null
        ? ""
        : `${String(repsRaw).trim()}回`;
    const wStr =
      weightRaw === "" || weightRaw == null
        ? ""
        : `${String(weightRaw).trim()}kg`;
    const seg = [exercise || "種目未入力", wStr, repStr].filter(
      (s) => s !== "",
    );
    if (seg.length) parts.push(seg.join(" · "));
  }

  return parts.length ? parts.join(" ／ ") : "—";
}
