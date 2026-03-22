#!/usr/bin/env node
/**
 * Firebase Authentication にユーザーを作成（または既存を更新）し、
 * Firestore の admin_users/{uid} を付与する。
 *
 * サービスアカウント JSON の指定（優先順）:
 * 1. 環境変数 GOOGLE_APPLICATION_CREDENTIALS
 * 2. nuxt-app/.env 内の GOOGLE_APPLICATION_CREDENTIALS
 * 3. nuxt-app/firebase-service-account.json が存在するときそのパス
 * 4. nuxt-app 直下に *firebase-adminsdk*.json が 1 つだけあるとき自動採用
 *
 * 使い方:
 *   ADMIN_CREATE_PASSWORD='パスワード' node scripts/create-admin.mjs user@example.com
 *   node scripts/create-admin.mjs user@example.com 'パスワード'
 *   node scripts/create-admin.mjs user@example.com --grant-only
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nuxtAppRoot = resolve(scriptDir, "..");

/** .env からスクリプト用の変数だけ読む（dotenv 依存なし） */
function loadDotEnvOptionalKeys() {
  const envPath = resolve(nuxtAppRoot, ".env");
  if (!existsSync(envPath)) return;
  const keys = new Set([
    "GOOGLE_APPLICATION_CREDENTIALS",
    "ADMIN_CREATE_PASSWORD",
  ]);
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

function usage() {
  console.error(`
使い方:
  ADMIN_CREATE_PASSWORD='…' npm run admin:create -- <メール>
  npm run admin:create -- <メール> '<パスワード>'
  npm run admin:create -- <メール> --grant-only

サービスアカウント JSON（いずれか）:
  · 環境変数 GOOGLE_APPLICATION_CREDENTIALS=/絶対パス/xxx.json
  · nuxt-app/.env に GOOGLE_APPLICATION_CREDENTIALS=./相対パス.json
  · nuxt-app/firebase-service-account.json を置く
  · nuxt-app に *firebase-adminsdk*.json を 1 つだけ置く（自動検出）

--grant-only  … 既存ユーザに admin_users のみ付与（パスワード不要）
`);
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

function printCredentialDiagnostics(defaultJsonPath, adminsdkCandidates) {
  console.error("");
  console.error("--- 診断 (このスクリプトが見ている nuxt-app) ---");
  console.error("  パス:", nuxtAppRoot);
  console.error(
    "  .env:",
    existsSync(resolve(nuxtAppRoot, ".env")) ? "あり" : "なし（または別フォルダで実行中）",
  );
  console.error(
    "  firebase-service-account.json:",
    existsSync(defaultJsonPath) ? "あり" : "なし",
  );
  if (adminsdkCandidates.length === 0) {
    console.error(
      "  *firebase-adminsdk*.json: なし → Console から秘密鍵をダウンロードし、このフォルダに置いてください。",
    );
  } else {
    console.error(`  *firebase-adminsdk*.json: ${adminsdkCandidates.length} 個`);
    for (const p of adminsdkCandidates) console.error("   ·", p);
  }
  console.error("");
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
  console.error(
    "(自動検出) GOOGLE_APPLICATION_CREDENTIALS =",
    adminsdkCandidates[0],
  );
}

if (
  (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS.trim() === "") &&
  adminsdkCandidates.length > 1
) {
  console.error(
    "エラー: nuxt-app に firebase-adminsdk の JSON が複数あります。使うファイルを 1 つにするか、次で指定してください:",
  );
  for (const p of adminsdkCandidates) console.error(" ", p);
  console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/選んだパス"');
  process.exit(1);
}

const args = process.argv.slice(2);
const grantOnly = args.includes("--grant-only");
const positional = args.filter((a) => a !== "--grant-only");
const email = positional[0]?.trim();
const passwordFromArg = positional[1]?.trim();
const password =
  process.env.ADMIN_CREATE_PASSWORD?.trim() ||
  (grantOnly ? "" : passwordFromArg);

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  usage();
  console.error("エラー: 有効なメールアドレスを第1引数で指定してください。");
  process.exit(1);
}

if (!grantOnly && (!password || password.length < 6)) {
  usage();
  console.error(
    "エラー: パスワードが必要です（6文字以上）。ADMIN_CREATE_PASSWORD または第2引数で渡してください。",
  );
  process.exit(1);
}

const keyPathRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
if (!keyPathRaw) {
  usage();
  console.error("エラー: サービスアカウント JSON の場所が分かりません。");
  console.error("");
  console.error("  Firebase Console → プロジェクトの設定 → サービス アカウント → 秘密鍵の生成");
  console.error("  でダウンロードした JSON を、次のいずれかで指定してください:");
  console.error("");
  console.error("  ① nuxt-app フォルダに JSON を保存する（ファイル名に firebase-adminsdk が含まれると自動検出）");
  console.error('  ② export GOOGLE_APPLICATION_CREDENTIALS="/絶対パス/xxx.json"');
  console.error("  ③ nuxt-app/.env に GOOGLE_APPLICATION_CREDENTIALS=./xxx.json");
  console.error("  ④ ファイル名を firebase-service-account.json にして nuxt-app に置く");
  printCredentialDiagnostics(defaultJsonPath, adminsdkCandidates);
  console.error(
    "※ `npm run admin:create` は nuxt-app 内で実行してください（cd nuxt-app 済みか確認）。",
  );
  process.exit(1);
}

const keyPath = resolveCredentialPath(keyPathRaw);
if (!existsSync(keyPath)) {
  console.error("エラー: ファイルがありません:", keyPath);
  console.error("（.env のパスは nuxt-app フォルダからの相対でも指定できます）");
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

const auth = getAuth();
const db = getFirestore();

let uid;

try {
  const rec = await auth.createUser({
    email,
    password,
    emailVerified: false,
  });
  uid = rec.uid;
  console.log("Authentication: ユーザーを新規作成しました。uid =", uid);
} catch (e) {
  const code = e && typeof e === "object" && "code" in e ? e.code : "";
  if (code === "auth/email-already-exists") {
    const rec = await auth.getUserByEmail(email);
    uid = rec.uid;
    console.log("Authentication: 既存ユーザーを使用します。uid =", uid);
    if (!grantOnly && password) {
      await auth.updateUser(uid, { password });
      console.log("Authentication: パスワードを更新しました。");
    }
  } else {
    console.error("Authentication エラー:", e?.message ?? e);
    process.exit(1);
  }
}

await db
  .collection("admin_users")
  .doc(uid)
  .set(
    {
      email,
      grantedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

console.log("Firestore: admin_users/" + uid + " を設定しました。");
console.log("完了。/admin にログインして確認してください。");
