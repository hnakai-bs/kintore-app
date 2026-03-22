# DAIKI Fit（Nuxt 版）

クライアント専用（`ssr: false`）の Nuxt 3 アプリです。Firebase を設定した場合は **Firestore にユーザーごとにデータを保存**し、未設定時は `/setup` で案内のみ（または従来の開発用フローに依存）です。

## 必要環境

- **Node.js 18+**（推奨: **20 LTS** または **22+**）
- Node **v21** はエコシステムの一部が未対応のため非推奨です。`nuxi` が `node:util` の `styleText` を要求する場合は、本プロジェクトの `package.json` の **`overrides`** で `nuxi@3.14.0` に固定しているので、`npm install` 後は **Node 21 でもビルド可能**な構成にしています。

## セットアップ

```bash
cd nuxt-app
npm install
```

## 開発サーバー

```bash
npm run dev
```

ブラウザで表示された URL（通常は `http://localhost:3000`）を開きます。

### スマホから同じ Wi‑Fi で確認する

1. PC とスマホを **同じ Wi‑Fi** に接続する。
2. `nuxt-app` で `npm run dev` を実行する（`nuxt.config` で `devServer.host: "0.0.0.0"` 済み）。
3. **PC の LAN 上の IP** を調べる。例（Mac）: ターミナルで `ipconfig getifaddr en0`（Wi‑Fi が `en0` のとき）。Windows は `ipconfig` の「IPv4」。
4. スマホのブラウザで `http://<そのIP>:3000` を開く（ポートを変えた場合はその番号）。
5. PC のターミナルに出る **`Network: http://192.168.x.x:3000/`** と **完全一致**する URL をスマホで開く（`localhost` ではなく **数字の IP**）。
6. ブラウザに **`Blocked request. This host ("192.168…") is not allowed`** と出る／真っ白で何も出ないときは、`nuxt.config` の `vite.server.allowedHosts: true` が効いているか確認し、**`npm run dev` を再起動**する。
7. まだ繋がらないとき:
   - **macOS**: システム設定 → ネットワーク → ファイアウォール → オプションで、**Node** または **ターミナル / Cursor** の「着信接続をブロック」がオンならオフにする（または一時的にファイアウォールを切って試す）。
   - **PC / スマホの VPN・iCloud プライベートリレー**をオフにして試す。
   - **ルーターのゲスト Wi‑Fi**や「端末間通信を禁止」設定は、同じ SSID でも PC とスマホが互いに見えないことがある。通常の SSID に両方つなぐ。

Firebase のメールログインなどが LAN の IP では失敗する場合は、`localhost` 用トンネル（[ngrok](https://ngrok.com/) 等）で HTTPS URL を取り、Console の **承認済みドメイン** にそのホストを追加する方法があります。

### 画面が真っ白で `localhost:24678` の `ERR_CONNECTION_REFUSED` が出るとき

Vite が HMR 用に別ポートへクライアントを向けると、環境によってはそのポートに届かずスクリプト読み込みに失敗します。`nuxt.config.ts` の `vite.server.hmr.clientPort` を **実際に開いているポート（通常 3000）** に合わせてあります。別ポートで起動する場合は `PORT=4000 npm run dev` のように **`PORT` と同じ番号**になるよう `clientPort` を調整してください。

## 本番ビルド（静的出力）

```bash
npm run build
```

`nitro.preset: 'static'` のため、成果物は `.output/public` に出力されます。プレビュー例:

```bash
npx serve .output/public
```

## メール／パスワード認証（Firebase Authentication）と Firestore

`.env` に `NUXT_PUBLIC_FIREBASE_*` を設定すると、**未ログイン時は `/login` にリダイレクト**され、ログイン後は **Firestore** の `users/{uid}/...` にユーザー関連データを保存します。変数が **空のまま**のときは **`/setup`** のみ利用可能です。**新規のメール／パスワードユーザはアプリ画面からは作れません**（`npm run admin:create` または Firebase Console → Authentication で追加してください）。

### Firestore に保存されるデータ（ログインごと）

| ドキュメント / コレクション | 内容 |
|-----------------------------|------|
| `users/{uid}/daily/{yyyy-mm-dd}` | コンディション（体重・PFC・睡眠・体調など） |
| `users/{uid}/training/{yyyy-mm-dd}` | トレーニングセット |
| `users/{uid}/settings/sessions` | トレーニングセッション定義 |
| `users/{uid}/settings/profile` | プロフィール・目標（身長・体重・算出 PFC など） |
| `users/{uid}/settings/vision` | ビジョン文面 |
| `users/{uid}/settings/preferences` | コンディションログの表示期間（1週間／1ヶ月／期間指定と日付） |
| `users/{uid}/bodyLogs/{entryId}` | ボディログ（日付・各スロット画像の **Storage ダウンロード URL**） |
| `userDirectory/{uid}` | 管理画面のユーザー索引（プロフィール保存時・プロフィール読込時に自動更新。本人のみ書込可） |

**Firebase Storage**（ボディログ写真）: `users/{uid}/bodyLogs/{entryId}/{front|back|side|extra}`。ルールは `storage.rules`。デプロイ例: `firebase deploy --only storage`

ホームの「目標」表示とグラフの目標線は **プロフィール**の `goal*` を参照します（プロフィール画面で保存した値が使われます）。

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト → **Authentication** → **Sign-in method** で **メール／パスワード** を有効化
2. **Firestore** を作成し、`firestore.rules` と `firestore.indexes.json` をデプロイ（`firebase deploy --only firestore` など）。ルールは本人の `users/{uid}/**` の読み書きに加え、管理者用の読み取り（後述）があります。
3. **Storage** を有効化し、`storage.rules` をデプロイ（`firebase deploy --only storage`）。ボディログの写真アップロードに必要です。
4. プロジェクト設定 → 全般 → **マイアプリ** の Web 設定から値をコピー（**storageBucket** を含む）
5. `nuxt-app` に `.env` を作成（`.env.example` を参考）:

```bash
cp .env.example .env
# 各キーを編集
```

6. `npm run dev` を再起動

ログイン後、ドロワーメニュー下部にメールアドレスと **ログアウト** が表示されます。

本番（Firebase Hosting など）では、Console の **承認済みドメイン** にデプロイ先のドメインを追加してください。

### 管理画面（`/admin`）

#### コマンドで管理者を作成（推奨）

1. Firebase Console → **プロジェクトの設定**（歯車）→ **サービス アカウント** → **新しい秘密鍵の生成** で JSON をダウンロードする（**Git にコミットしない**。`nuxt-app/.gitignore` にパターンを入れてあります）。
2. ターミナルでその JSON へのパスを渡して実行する。

```bash
cd nuxt-app
export GOOGLE_APPLICATION_CREDENTIALS="/絶対パス/あなたのプロジェクト-xxxxx-firebase-adminsdk-xxxxx.json"
# パスワードはシェル履歴に残りにくいよう環境変数推奨（6文字以上）
export ADMIN_CREATE_PASSWORD='パスワード'
npm run admin:create -- admin@example.com
```

**`GOOGLE_APPLICATION_CREDENTIALS` を毎回付けたくない場合**: Firebase からダウンロードした JSON を **`nuxt-app` フォルダの直下**に置く（例: ダウンロード時の名前 `プロジェクト名-firebase-adminsdk-xxxxx.json` のままで可）。**そのファイルが 1 つだけ**なら、スクリプトが自動で検出します。別名にする場合は `firebase-service-account.json` にリネームするか、`.env` に `GOOGLE_APPLICATION_CREDENTIALS=./ファイル名.json` を書いてください。

失敗したときはターミナルに **診断**（`.env` の有無・`nuxt-app` のパス・adminsdk JSON の有無）が出ます。**必ず `cd nuxt-app` したうえで** `npm run admin:create` を実行してください（親フォルダ `kintore` で実行すると `.env` も JSON も見つかりません）。

- **第2引数でパスワード**を渡すこともできます: `npm run admin:create -- admin@example.com 'パスワード'`（履歴に残る点に注意）。
- **既に Authentication にいるユーザ**に管理者だけ付与: `npm run admin:create -- admin@example.com --grant-only`
- メールが既にある場合は **パスワードを更新**してから `admin_users/{uid}` を書き込みます（`--grant-only` でないとき）。

`firebase-admin` は `devDependencies` に含みます。`npm install` 済みであること。

#### 手動（Console）

1. **Firestore** にコレクション `admin_users` を作成し、**ドキュメント ID を管理者の UID** にします（フィールドは空の `{}` で可）。UID は Firebase Console → **Authentication** のユーザ一覧、またはログイン後メニューに表示されるメールのユーザから確認できます。以前 `adminUsers` を使っていた場合は、同じ UID のドキュメントを **`admin_users` に作り直す**（またはデータを移す）必要があります。
2. **`firebase deploy --only firestore`**（ルール＋インデックス）を実行し、更新後の `firestore.rules` と `firestore.indexes.json` を反映してください。インデックスの構築が終わるまで数分かかることがあります。
3. 管理者で通常どおり **ログイン**したうえで **`/admin`** を開くか、メニューの **管理** から入ります。`admin_users` に載っていないユーザーが `/admin` に来ると **ホームへリダイレクト**されます。

**ユーザー一覧**は `userDirectory` の UID を起点に、各 `users/{uid}/settings/profile` を読み取っています（`collectionGroup("settings")` は他プロジェクトの `settings` とルール衝突しやすいため使っていません）。既存ユーザは **プロフィールを一度保存し直す**か **プロフィール画面を開く**（`userDirectory` が無ければ補完）と一覧に載ります。メールアドレスは一覧に出しません（UID で識別）。

`/admin` で **500** や **`Missing or insufficient permissions`** が出る場合は、多くは **Firestore の本番ルールが古い**（`admin_users` や管理者用の `read` が未反映）です。`firebase deploy --only firestore` でリポジトリの `firestore.rules` と `firestore.indexes.json` を反映し、インデックスのビルド完了を待ってから再度試してください。ルール未反映時はミドルウェア側でホームへ戻すようにしてあり、アプリ全体の 500 は避けています。

初回ログイン時、クライアントは旧 `localStorage` キー（`kintore-*-v1`）を **削除**して Firestore との混在を防ぎます。

### 保存してもリロードで消える・Firestore にドキュメントが増えないとき

- **`.env` は `nuxt-app` 直下**（`nuxt.config.ts` と同じフォルダ）。リポジトリルートにだけ `.env` があると読み込まれません。
- `.env` を変えたら **`npm run dev` を再起動**してください。
- **`npm run build` の静的出力**（`.output/public`）を配信している場合、`NUXT_PUBLIC_FIREBASE_*` は **ビルド実行時** にバンドルへ埋め込まれます。空のまま `npm run build` すると、認証以外が動かない／保存できないことがあります。
- Firebase Console で **Firestore Database を作成**済みか確認してください（未作成だと書き込みに失敗します）。
- **Storage** を有効化し、`storage.rules` をデプロイ済みか確認してください（ボディログの写真で `storage/unauthorized` になることがあります）。
- **セキュリティルール**をデプロイし、ログインユーザーが自分の `users/{uid}/**` に書けるか確認してください。拒否されると画面上に赤い説明が出ます（開発者ツールの Console にも `permission-denied` が出ます）。
- Console で開いている **プロジェクト ID** と、`NUXT_PUBLIC_FIREBASE_PROJECT_ID` が一致しているか確認してください。

## 本番デプロイ（Firebase Hosting）

`nuxt-app` は `nitro.preset: "static"` のため、`npm run build` で **`.output/public`** に静的ファイルが出力されます。`firebase.json` の Hosting はこのディレクトリを指しています。

### 初回だけ

1. [Firebase CLI](https://firebase.google.com/docs/cli) をプロジェクトに入れる: `npm install`（`firebase-tools` は `devDependencies` に含みます）。
2. ログイン: `npx firebase login`
3. **デプロイ先プロジェクト**を `.firebaserc` の `default` に合わせる（例: `firebase use --add` で本番プロジェクトを選ぶ）。

### ビルドとデプロイ

- **Hosting ＋ Firestore ルール ＋ Storage ルールをまとめて**（本番反映の一般的な流れ）:

  ```bash
  cd nuxt-app
  npm run deploy
  ```

- **Hosting のみ**（ルールは触らないとき）:

  ```bash
  npm run deploy:hosting
  ```

- **ルール・Firestore インデックス・Storage のみ**（アプリの再ビルドなし）:

  ```bash
  npm run deploy:rules
  ```

### 本番ビルド前の必須事項

- **`.env` に `NUXT_PUBLIC_FIREBASE_*` を入れたうえで `npm run build`** してください。ビルド時にクライアントへ埋め込まれるため、空のままデプロイすると認証・Firestore が動きません。
- Firebase Console の **Hosting** でサイトを有効化し、**承認済みドメイン**に本番 URL を追加してください（Authentication 用）。

Cursor などで「本番に上げて」と依頼された場合も、上記と同じく **`nuxt-app` で `npm run deploy`（必要なら `deploy:rules`）** を実行する想定です。

## ルーティング

| パス | 内容 |
|------|------|
| `/setup` | Firebase 未設定時の案内 |
| `/login` | ログイン（新規ユーザは `npm run admin:create` 等で発行。Firebase 設定時のみガードの対象外） |
| `/` | コンディションレコード |
| `/graph` | コンディションログ（Chart.js） |
| `/training` | トレーニングレコード（`?date=YYYY-MM-DD` 可） |
| `/training-log` | トレーニングログ（カレンダー） |
| `/training-sessions` | セッション一覧 |
| `/training-sessions/new` | 新規セッション |
| `/training-sessions/:id` | セッション詳細・編集 |
| `/vision` | ビジョン |
| `/profile` | プロフィール |
| `/admin` | 管理画面（`admin_users/{uid}` が存在するユーザーのみ） |

## アセット

- `public/daiki-fit.png` … ヘッダーロゴ（リポジトリルートの画像をコピー済み。無い場合は同ファイルを置いてください）

## 静的版との関係

リポジトリルートの静的 HTML は別物です。Nuxt 版は Firebase 利用時 **クラウドのユーザー別データ**を参照し、ルート静的版の `localStorage` とは共有しません。
