import type { DisplayGoalKey } from "~/utils/displayGoalsFromProfile";

/** コンディション各チャートの定義（canvas / empty 要素の id 接尾辞に使う） */
export const CONDITION_CHART_METAS = [
  {
    id: "weight-chart",
    emptyId: "empty-weight",
    field: "weight" as const,
    title: "体重",
    legendLabel: "体重 (kg)",
    unit: "kg",
    color: "#2563eb",
    iconSrc: "/icons/weight.png",
  },
  {
    id: "chart-calories",
    emptyId: "empty-calories",
    field: "calories" as const,
    title: "カロリー",
    legendLabel: "カロリー (kcal)",
    unit: "kcal",
    color: "#0d9488",
    iconSrc: "/icons/calorie.png",
  },
  {
    id: "chart-protein",
    emptyId: "empty-protein",
    field: "protein" as const,
    title: "タンパク質",
    legendLabel: "タンパク質 (g)",
    unit: "g",
    color: "#db2777",
    iconSrc: "/icons/protein.png",
  },
  {
    id: "chart-fat",
    emptyId: "empty-fat",
    field: "fat" as const,
    title: "脂質",
    legendLabel: "脂質 (g)",
    unit: "g",
    color: "#ea580c",
    iconSrc: "/icons/lipid.png",
  },
  {
    id: "chart-carbs",
    emptyId: "empty-carbs",
    field: "carbs" as const,
    title: "炭水化物",
    legendLabel: "炭水化物 (g)",
    unit: "g",
    color: "#4f46e5",
    iconSrc: "/icons/carbohydrates.png",
  },
  {
    id: "chart-fiber",
    emptyId: "empty-fiber",
    field: "fiber" as const,
    title: "食物繊維",
    legendLabel: "食物繊維 (g)",
    unit: "g",
    color: "#16a34a",
    iconSrc: "/icons/dietary_fiber.png",
  },
  {
    id: "chart-sleep",
    emptyId: "empty-sleep",
    field: "sleep" as const,
    title: "睡眠時間",
    legendLabel: "睡眠時間 (h)",
    unit: "h",
    color: "#7c3aed",
    iconSrc: "/icons/sleep.png",
  },
] as const;

export type ConditionChartMeta = (typeof CONDITION_CHART_METAS)[number];
export type ConditionChartResolved = ConditionChartMeta & { goal: number };

export function conditionChartDomId(prefix: string, baseId: string) {
  return prefix ? `${prefix}__${baseId}` : baseId;
}

export function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string) {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day, 12, 0, 0, 0);
}

export function eachDayInclusive(
  start: Date,
  end: Date,
  fn: (d: Date) => void,
) {
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  const endT = new Date(end);
  endT.setHours(12, 0, 0, 0);
  while (d <= endT) {
    fn(new Date(d));
    d.setDate(d.getDate() + 1);
  }
}

export function formatAxisLabel(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function buildSeries(
  start: Date,
  end: Date,
  fieldKey: string,
  entries: Record<string, Record<string, unknown>>,
) {
  const labels: string[] = [];
  const values: (number | null)[] = [];
  eachDayInclusive(start, end, (d) => {
    labels.push(formatAxisLabel(d));
    const key = ymd(d);
    const raw = entries[key]?.[fieldKey];
    const n = raw === "" || raw === undefined ? null : Number(raw);
    values.push(Number.isFinite(n as number) ? (n as number) : null);
  });
  return { labels, values };
}

export function countPoints(values: (number | null)[]) {
  return values.filter((v) => v != null && Number.isFinite(v as number)).length;
}

export function todayNoon() {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  return t;
}

export function rangeForPreset(preset: "week" | "month") {
  const end = todayNoon();
  const start = new Date(end);
  if (preset === "week") {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(start.getDate() - 29);
  }
  return { start, end };
}

export function yRange(values: (number | null)[], goal: number | undefined) {
  const nums = values.filter(
    (v) => v != null && Number.isFinite(v as number),
  ) as number[];
  if (nums.length === 0)
    return {
      min: undefined as number | undefined,
      max: undefined as number | undefined,
    };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (goal != null && Number.isFinite(goal)) {
    min = Math.min(min, goal);
    max = Math.max(max, goal);
  }
  const span = max - min || Math.abs(max) * 0.08 || 1;
  const pad = Math.max(span * 0.12, span * 0.03);
  return { min: min - pad, max: max + pad };
}

export function resolveChartSpecs(
  goals: Record<DisplayGoalKey, number>,
  domPrefix: string,
): ConditionChartResolved[] {
  return CONDITION_CHART_METAS.map((b) => ({
    ...b,
    id: conditionChartDomId(domPrefix, b.id),
    emptyId: conditionChartDomId(domPrefix, b.emptyId),
    goal: goals[b.field as DisplayGoalKey],
  }));
}
