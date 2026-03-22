/** トレーニング1行としてカウントするか（reps が有効な数値） */
export function hasTrainingSetLogged(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const r = (row as { reps?: unknown }).reps;
  if (r === "" || r == null) return false;
  const n = parseInt(String(r), 10);
  return Number.isFinite(n);
}

/** 指定月の初日・末日（yyyy-mm-dd、ローカル暦） */
export function monthBoundsYmd(
  year: number,
  month: number,
): { startYmd: string; endYmd: string } {
  const m = String(month).padStart(2, "0");
  const startYmd = `${year}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endYmd = `${year}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { startYmd, endYmd };
}

/** Firestore の training 日付→sets マップから、該当月の「セット行（reps あり）」の合計 */
export function countTrainingSetsInMonth(
  byDay: Record<string, unknown[]>,
  year: number,
  month: number,
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  let total = 0;
  for (const [dateYmd, sets] of Object.entries(byDay)) {
    if (!dateYmd.startsWith(prefix)) continue;
    if (!Array.isArray(sets)) continue;
    for (const row of sets) {
      if (hasTrainingSetLogged(row)) total++;
    }
  }
  return total;
}

/** 月内の「reps ありセット」を種目名ごとに集計（件数降順）。種目空欄は「種目未入力」。 */
export function exerciseSetCountsForMonth(
  byDay: Record<string, unknown[]>,
  year: number,
  month: number,
): { label: string; count: number }[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const counts = new Map<string, number>();
  for (const [dateYmd, sets] of Object.entries(byDay)) {
    if (!dateYmd.startsWith(prefix)) continue;
    if (!Array.isArray(sets)) continue;
    for (const row of sets) {
      if (!hasTrainingSetLogged(row)) continue;
      let label = "種目未入力";
      if (row && typeof row === "object") {
        const ex = (row as { exercise?: unknown }).exercise;
        if (ex != null) {
          const t = String(ex).trim();
          if (t) label = t;
        }
      }
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
