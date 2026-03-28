/**
 * 重量・回数がどちらも入っているセットか（管理画面の一覧はこれのみ表示する）
 */
function rowHasWeightAndReps(o: {
  weight?: unknown;
  reps?: unknown;
}): boolean {
  if (o.weight === "" || o.weight == null) return false;
  const w = Number(o.weight);
  if (!Number.isFinite(w)) return false;
  if (o.reps === "" || o.reps == null) return false;
  const r =
    typeof o.reps === "number" ? o.reps : parseInt(String(o.reps), 10);
  return Number.isFinite(r) && r >= 0;
}

/**
 * `users/{uid}/training/{yyyy-mm-dd}` の sets 配列を一覧用の短文にまとめる。
 * 管理画面などでは、重量・回数が記入済みのセットだけを列挙する。
 */
export function formatTrainingDaySummary(sets: unknown): string {
  if (!Array.isArray(sets) || sets.length === 0) return "—";

  const parts: string[] = [];
  for (const row of sets) {
    if (!row || typeof row !== "object") continue;
    const o = row as { exercise?: unknown; weight?: unknown; reps?: unknown };
    if (!rowHasWeightAndReps(o)) continue;

    const exercise = o.exercise != null ? String(o.exercise).trim() : "";
    const repsRaw = o.reps;
    const weightRaw = o.weight;
    const repStr = `${String(repsRaw).trim()}回`;
    const wStr = `${String(weightRaw).trim()}kg`;
    const seg = [exercise || "種目未入力", wStr, repStr];
    parts.push(seg.join(" · "));
  }

  return parts.length ? parts.join(" ／ ") : "—";
}
