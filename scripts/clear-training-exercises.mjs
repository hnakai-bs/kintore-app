#!/usr/bin/env node
/**
 * 本番など任意の Firebase プロジェクトで、ユーザー配下の「種目」関連 Firestore データを削除・クリアする。
 *
 * 【重要】種目マスタは Firestore trainingExercises（管理画面または seed スクリプト）で管理。
 * このスクリプトでは削除できません。アプリのデプロイで差し替えてください。
 *
 * このスクリプトが触るデータ:
 *  - users/{uid}/settings/sessions … 各セッションの exercises 配列を空にする（セッション自体は残す）
 *  - users/{uid}/training/{yyyy-mm-dd} … ドキュメントごと削除（トレーニング記録一式）
 *
 * 対象 UID の集め方:
 *  - Firebase Authentication の全ユーザー
 *  - collectionGroup('settings') で id が sessions のドキュメントのパスから UID を抽出
 *  - collectionGroup('training') から UID を抽出（認証にいないがデータだけ残っている場合）
 *
 * 使い方（nuxt-app ディレクトリで）:
 *   # 接続先はサービスアカウント JSON の project_id（本番なら本番用 JSON を指定）
 *   node scripts/clear-training-exercises.mjs --dry-run --session-exercises --training-logs
 *   node scripts/clear-training-exercises.mjs --apply --session-exercises
 *   node scripts/clear-training-exercises.mjs --apply --training-logs
 *   node scripts/clear-training-exercises.mjs --apply --session-exercises --training-logs
 *
 * 認証情報: create-admin.mjs と同じ（GOOGLE_APPLICATION_CREDENTIALS または .env / 自動検出）
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nuxtAppRoot = resolve(scriptDir, "..");

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

function usage() {
  console.error(`
使い方:
  node scripts/clear-training-exercises.mjs --dry-run --session-exercises [--training-logs]
  node scripts/clear-training-exercises.mjs --apply --session-exercises [--training-logs]

  --dry-run            変更せず件数のみ表示（--apply が無いときの既定）
  --apply              実際に Firestore を更新・削除する
  --session-exercises  users/{uid}/settings/sessions 内の exercises をすべて空配列にする
  --training-logs      users/{uid}/training/* のドキュメントをすべて削除する

サービスアカウント: GOOGLE_APPLICATION_CREDENTIALS または create-admin.mjs と同じ自動検出
`);
}

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

if (
  (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() === "") &&
  adminsdkCandidates.length > 1
) {
  console.error("エラー: firebase-adminsdk の JSON が複数あります。GOOGLE_APPLICATION_CREDENTIALS で 1 つ指定してください。");
  process.exit(1);
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const dryRun = argv.includes("--dry-run") || !apply;
const sessionExercises = argv.includes("--session-exercises");
const trainingLogs = argv.includes("--training-logs");

if (!sessionExercises && !trainingLogs) {
  usage();
  console.error("エラー: --session-exercises と / または --training-logs を指定してください。");
  process.exit(1);
}

const keyPathRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
if (!keyPathRaw) {
  usage();
  console.error("エラー: GOOGLE_APPLICATION_CREDENTIALS が未設定です。");
  process.exit(1);
}

const keyPath = resolveCredentialPath(keyPathRaw);
if (!existsSync(keyPath)) {
  console.error("エラー: ファイルがありません:", keyPath);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  console.error("エラー: JSON として読めません:", keyPath);
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

const projectId = serviceAccount.project_id;
console.error("対象 Firebase プロジェクト (service account):", projectId);
console.error("モード:", dryRun ? "DRY-RUN（書き込みなし）" : "APPLY（実行）");
console.error(
  "処理:",
  [sessionExercises && "sessions の exercises クリア", trainingLogs && "training 日次ドキュメント削除"]
    .filter(Boolean)
    .join(" / "),
);
console.error("");

/** @returns {Promise<string[]>} */
async function listAllAuthUids() {
  const uids = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) uids.push(u.uid);
    pageToken = res.pageToken;
  } while (pageToken);
  return uids;
}

/** @returns {Promise<Set<string>>} */
async function uidsFromFirestorePaths() {
  const set = new Set();
  const [settingsSnap, trainingSnap] = await Promise.all([
    db.collectionGroup("settings").get(),
    db.collectionGroup("training").get(),
  ]);
  for (const d of settingsSnap.docs) {
    if (d.id !== "sessions") continue;
    const m = /^users\/([^/]+)\/settings\/sessions$/.exec(d.ref.path);
    if (m) set.add(m[1]);
  }
  for (const d of trainingSnap.docs) {
    const m = /^users\/([^/]+)\/training\/[^/]+$/.exec(d.ref.path);
    if (m) set.add(m[1]);
  }
  return set;
}

function clearExercisesInById(byId) {
  const next = {};
  for (const [k, v] of Object.entries(byId)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      next[k] = { ...v, exercises: [] };
    } else {
      next[k] = v;
    }
  }
  return next;
}

const BATCH_MAX = 450;

/** @param {FirebaseFirestore.QueryDocumentSnapshot[]} docs */
async function commitDeletes(docs) {
  for (let i = 0; i < docs.length; i += BATCH_MAX) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_MAX);
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
  }
}

const authUids = await listAllAuthUids();
const pathUids = await uidsFromFirestorePaths();
const allUids = [...new Set([...authUids, ...pathUids])].sort();

console.error(
  `対象 UID 数: ${allUids.length}（Auth: ${authUids.length}、Firestore パスから追加: ${[...pathUids].filter((u) => !authUids.includes(u)).length}）`,
);
console.error("");

let sessionsTouched = 0;
let sessionsSkipped = 0;
let trainingDocsDeleted = 0;

for (const uid of allUids) {
  if (sessionExercises) {
    const ref = db.collection("users").doc(uid).collection("settings").doc("sessions");
    const snap = await ref.get();
    if (!snap.exists) {
      sessionsSkipped += 1;
    } else {
      const data = snap.data() || {};
      const rawById = data.byId;
      if (!rawById || typeof rawById !== "object" || Array.isArray(rawById)) {
        sessionsSkipped += 1;
      } else {
        const customOrder = Array.isArray(data.customOrder) ? data.customOrder : [];
        const nextById = clearExercisesInById(rawById);
        const changed = JSON.stringify(nextById) !== JSON.stringify(rawById);
        if (!changed) {
          sessionsSkipped += 1;
        } else {
          sessionsTouched += 1;
          if (!dryRun) {
            await ref.set(
              {
                byId: nextById,
                customOrder,
              },
              { merge: true },
            );
          }
        }
      }
    }
  }

  if (trainingLogs) {
    const col = db.collection("users").doc(uid).collection("training");
    const snap = await col.get();
    const docs = snap.docs;
    if (docs.length > 0) {
      trainingDocsDeleted += docs.length;
      if (!dryRun) {
        await commitDeletes(docs);
      }
    }
  }
}

console.error("--- 結果 ---");
if (sessionExercises) {
  console.error(
    dryRun
      ? "sessions: exercises を空にする更新が必要な sessions ドキュメント数（推定）"
      : "sessions: exercises を空にした sessions ドキュメント数",
  );
  console.error("  更新対象:", sessionsTouched);
  console.error("  スキップ（無し・byId なし・既に空）:", sessionsSkipped);
}
if (trainingLogs) {
  console.error(
    dryRun ? "training: 削除予定の日次ドキュメント数" : "training: 削除した日次ドキュメント数",
    trainingDocsDeleted,
  );
}

if (dryRun) {
  console.error("");
  console.error("これはドライランでした。実行するには同じ引数に --apply を付けて再実行してください。");
}
