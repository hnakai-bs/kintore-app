#!/usr/bin/env node
/**
 * Firestore `trainingExercises` に種目マスタを投入（merge）。既存ドキュメント ID 同じなら上書き。
 * `guideUrl` は空文字可（フォーム解説未設定の種目）。
 *
 *   node scripts/seed-training-exercises.mjs
 *   node scripts/seed-training-exercises.mjs --dry-run
 *
 * 認証: create-admin.mjs と同じ GOOGLE_APPLICATION_CREDENTIALS
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
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

const db = getFirestore();
const dryRun = process.argv.includes("--dry-run");

const seedPath = resolve(nuxtAppRoot, "utils/trainingExerciseSeedData.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

console.error("プロジェクト:", serviceAccount.project_id);
console.error("件数:", seed.length, dryRun ? "(dry-run)" : "");

for (let i = 0; i < seed.length; i += 1) {
  const row = seed[i];
  const id = `ex-${String(i + 1).padStart(3, "0")}`;
  const doc = {
    name: String(row.name || "").trim(),
    guideUrl: String(row.guideUrl || "").trim(),
    sortOrder: i,
  };
  if (!doc.name) continue;
  console.error(`${dryRun ? "[dry-run]" : ""} ${id}: ${doc.name}`);
  if (!dryRun) {
    await db.collection("trainingExercises").doc(id).set(doc, { merge: true });
  }
}

if (!dryRun) {
  console.error("完了。trainingExercises に書き込みました。");
}
