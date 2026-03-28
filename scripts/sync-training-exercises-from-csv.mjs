#!/usr/bin/env node
/**
 * CSV（部位・種目名・フォーム解説URL）を Firestore trainingExercises に反映する。
 * - 種目名が一致する既存ドキュメントで guideUrl が空なら CSV の URL をセット
 * - bodyPart が空なら CSV の部位をセット
 * - 存在しない種目は新規追加（sortOrder は既存最大+1）
 *
 * シードの短い別名で登録されている種目は GUIDE_URL_ALIASES で URL を補完する。
 *
 *   node scripts/sync-training-exercises-from-csv.mjs
 *   node scripts/sync-training-exercises-from-csv.mjs --dry-run
 *   node scripts/sync-training-exercises-from-csv.mjs --write-seed
 *   node scripts/sync-training-exercises-from-csv.mjs /path/to/file.csv
 *
 * 認証: GOOGLE_APPLICATION_CREDENTIALS（seed-training-exercises.mjs と同じ）
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nuxtAppRoot = resolve(scriptDir, "..");

/** DB 上の旧名称 → CSV 上の正式名称（URL は CSV 側を採用） */
const GUIDE_URL_ALIASES = [
  ["サイドレイズ", "サイドレイズ（ダンベル）"],
  ["リアレイズ", "リアレイズ（マシン）"],
  ["クローズグリップベンチ", "クローズグリップベンチプレス"],
  ["ルーマニアンデッドリフト（ダンベル）", "ダンベルルーマニアンデッドリフト"],
];

function loadDotEnvOptionalKeys() {
  const envPath = resolve(nuxtAppRoot, ".env");
  if (!existsSync(envPath)) return;
  const keys = new Set(["GOOGLE_APPLICATION_CREDENTIALS"]);
  let text = readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!keys.has(key)) continue;
    if (process.env[key] != null && process.env[key] !== "") continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
}

function resolveCredentialPath(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  return resolve(nuxtAppRoot, trimmed);
}

function listAdminsdkJsonInNuxtRoot() {
  try {
    return readdirSync(nuxtAppRoot, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .filter((name) => name.includes("firebase-adminsdk") && name.endsWith(".json"))
      .map((name) => resolve(nuxtAppRoot, name));
  } catch {
    return [];
  }
}

/**
 * 先頭2つのカンマで部位・種目名を切り出し、残りを URL とみなす（URL 内カンマ想定なし）
 */
function parseCsvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const c0 = line.indexOf(",");
    if (c0 < 0) continue;
    const c1 = line.indexOf(",", c0 + 1);
    if (c1 < 0) continue;
    const bodyPart = line.slice(0, c0).trim();
    const name = line.slice(c0 + 1, c1).trim();
    const guideUrl = line.slice(c1 + 1).trim();
    if (!name) continue;
    out.push({ bodyPart, name, guideUrl });
  }
  return out;
}

function initAdmin() {
  loadDotEnvOptionalKeys();
  const defaultJsonPath = resolve(nuxtAppRoot, "firebase-service-account.json");
  if (
    (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() === "") &&
    existsSync(defaultJsonPath)
  ) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultJsonPath;
  }
  const adminsdkCandidates = listAdminsdkJsonInNuxtRoot();
  if (
    (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() === "") &&
    adminsdkCandidates.length === 1
  ) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adminsdkCandidates[0];
    console.error("(自動検出) GOOGLE_APPLICATION_CREDENTIALS =", adminsdkCandidates[0]);
  }
  const keyPathRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!keyPathRaw) {
    console.error("エラー: GOOGLE_APPLICATION_CREDENTIALS を設定してください。");
    process.exit(1);
  }
  const keyPath = resolveCredentialPath(keyPathRaw);
  const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  return {
    db: getFirestore(),
    projectId: serviceAccount.project_id,
  };
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const writeSeed = process.argv.includes("--write-seed");

const defaultCsv = resolve(nuxtAppRoot, "data/training-exercises-form.csv");
const csvPath = argv[0] && !argv[0].startsWith("-") ? resolve(argv[0]) : defaultCsv;

if (!existsSync(csvPath)) {
  console.error("CSV が見つかりません:", csvPath);
  process.exit(1);
}

const csvText = readFileSync(csvPath, "utf8");
const rows = parseCsvRows(csvText);

if (writeSeed) {
  const seedPath = resolve(nuxtAppRoot, "utils/trainingExerciseSeedData.json");
  const payload = rows.map((r) => ({
    name: r.name,
    guideUrl: r.guideUrl,
    bodyPart: r.bodyPart,
  }));
  writeFileSync(seedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error("書き出し:", seedPath, `(${payload.length} 件)`);
}

if (dryRun && writeSeed) {
  console.error("--dry-run と併用: シードのみ更新し Firestore には接続しません。");
  process.exit(0);
}

const nameToCsvRow = new Map(rows.map((r) => [r.name, r]));

function csvUrlForDbName(dbName) {
  if (nameToCsvRow.has(dbName)) return nameToCsvRow.get(dbName);
  for (const [legacy, canonical] of GUIDE_URL_ALIASES) {
    if (legacy === dbName && nameToCsvRow.has(canonical)) {
      return nameToCsvRow.get(canonical);
    }
  }
  return undefined;
}

const { db, projectId } = initAdmin();
console.error("プロジェクト:", projectId);
if (dryRun) {
  console.error("(dry-run: Firestore への書き込みは行いません)");
}

const snap = await db.collection("trainingExercises").get();
const byName = new Map();
let maxOrder = -1;
for (const d of snap.docs) {
  const data = d.data();
  const name = String(data.name ?? "").trim();
  if (!name) continue;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? data.sortOrder
      : 0;
  maxOrder = Math.max(maxOrder, sortOrder);
  if (!byName.has(name)) byName.set(name, { id: d.id, data });
}

let addCount = 0;
let updateGuideCount = 0;
let updatePartCount = 0;
let orderCursor = maxOrder;

for (const r of rows) {
  const existing = byName.get(r.name);
  if (!existing) {
    addCount += 1;
    orderCursor += 1;
    const doc = {
      name: r.name,
      guideUrl: r.guideUrl || "",
      bodyPart: r.bodyPart || "",
      sortOrder: orderCursor,
    };
    console.error(`${dryRun ? "[dry-run] 追加" : "追加"}: ${r.name}`);
    if (!dryRun) {
      const ref = await db.collection("trainingExercises").add(doc);
      byName.set(r.name, { id: ref.id, data: doc });
    } else {
      byName.set(r.name, { id: "(new)", data: doc });
    }
    continue;
  }
  const cur = existing.data;
  const curGuide = String(cur.guideUrl ?? "").trim();
  const curPart = String(cur.bodyPart ?? "").trim();
  const patch = {};
  if (!curGuide && r.guideUrl) {
    patch.guideUrl = r.guideUrl;
    updateGuideCount += 1;
  }
  if (!curPart && r.bodyPart) {
    patch.bodyPart = r.bodyPart;
    updatePartCount += 1;
  }
  if (Object.keys(patch).length) {
    console.error(
      `${dryRun ? "[dry-run] 更新" : "更新"}: ${r.name}`,
      JSON.stringify(patch),
    );
    if (!dryRun) {
      await db.doc(`trainingExercises/${existing.id}`).update(patch);
    }
  }
}

for (const [legacyName] of GUIDE_URL_ALIASES) {
  const existing = byName.get(legacyName);
  if (!existing) continue;
  const row = csvUrlForDbName(legacyName);
  if (!row?.guideUrl) continue;
  const curGuide = String(existing.data.guideUrl ?? "").trim();
  if (curGuide) continue;
  const curPart = String(existing.data.bodyPart ?? "").trim();
  const patch = { guideUrl: row.guideUrl };
  if (!curPart && row.bodyPart) patch.bodyPart = row.bodyPart;
  if (patch.guideUrl) updateGuideCount += 1;
  if (patch.bodyPart) updatePartCount += 1;
  console.error(
    `${dryRun ? "[dry-run] 別名URL補完" : "別名URL補完"}: ${legacyName} ← ${row.name}`,
    JSON.stringify(patch),
  );
  if (!dryRun) {
    await db.doc(`trainingExercises/${existing.id}`).update(patch);
  }
}

console.error(
  `完了。追加 ${addCount} 件 / guideUrl 更新 ${updateGuideCount} 件 / 部位フィールド ${updatePartCount} 件`,
);
if (!dryRun) {
  console.error("trainingExercises を更新しました。");
}
