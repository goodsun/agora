# [006] エージェント認証 — 公開鍵による社員証システム

- **提案者**: アリス 🐇 + マスター
- **日付**: 2026-03-17
- **対象**: agora 全体（file_manager パーミッション Phase 2 前提）

---

## なぜ必要か

現在 agora の認証は `X-API-Key`（共有シークレット）のみ。
誰がリクエストしているかを区別できないため、パーミッション制御ができない。

エージェントごとに identity を確定できれば：
- メフィは `/srv/shared/metroon/data/private/` を読めるが、外部エージェントは読めない
- アリスだけが bibliotheke に書き込める
- りんちゃんは casts の閲覧のみ

という **ロールベースのアクセス制御** が実現できる。

---

## 何をするか

**公開鍵 = 社員証** として agora に登録する。

```
エージェントが秘密鍵でリクエストに署名
→ agora が登録済み公開鍵で検証
→ identity 確定 → パーミッション適用
```

### 社員証の管理場所

```
/srv/shared/metroon/data/agents/
  alice/pubkey.pem
  mephi/pubkey.pem
  teddy/pubkey.pem
  jasmine/pubkey.pem
  ...
```

### リクエスト方法（案）

```http
GET /api/file_manager/read?path=...
X-Agent-Id: alice
X-Agent-Signature: <base64(sign(request_body + timestamp, private_key))>
X-Agent-Timestamp: 1742170000
```

agora 側：
1. `X-Agent-Id` から公開鍵を取得
2. timestamp が ±5分以内か確認（リプレイアタック防止）
3. 署名を検証 → OK なら identity 確定
4. identity のロールに基づいてパーミッション判定

---

## どう作るか

### Phase 2-A: 社員証登録
- 各エージェントが `ssh-keygen` または `openssl` で鍵ペア生成
- 公開鍵を `metroon/data/agents/<id>/pubkey.pem` に commit（PR経由）
- agora が起動時に公開鍵を読み込んでキャッシュ

### Phase 2-B: 署名検証ミドルウェア
- `verifyAgentSignature()` ミドルウェアを実装
- 既存の `requireApiKey` と並列運用（移行期間）

### Phase 2-C: パーミッション適用
- `metroon/data/agents/<id>/permissions.json` でロール定義
- file_manager の read/write に identity チェックを追加

---

## 依存・制約

- Proposal 005 (file_manager パーミッション) と連動
- 秘密鍵は各エージェントの `~/.openclaw/.ssh/` で管理（git管理しない）
- 公開鍵のみ metroon に commit（PR経由でアリスまたはマスターが承認）
- タイムスタンプ検証必須（リプレイアタック防止）

---

## 優先度

- [ ] 今すぐ欲しい
- [x] あると嬉しい
- [ ] 将来的に

---

## metroon ディレクトリ設計（Phase 2想定）

```
metroon/
  scripts/          ← public（全員参照可）
  skills/           ← public（全員参照可）
  docs/             ← public（運用ガイド等）
  data/             ← public（casts, presets等）
  private/
    alice/          ← alice公開鍵でのみアクセス可
    mephi/          ← メフィ専用（監査レポート等）
    bizeny/         ← 彰子専用（IGトークン等）
    teddy/          ← テディ専用
    ...
```

- `private/<id>/` は対応する公開鍵で認証されたエージェントのみ読み書き可
- マスター（管理者）は全 private にアクセス可
- **公文書館に金庫室が付いた構造**

## 備考

> 「社員証として公開鍵を登録すれば使えるみたいにできるんじゃないw」
> — マスター, 2026-03-17

公開鍵がそのまま社員証になる。bon-soleil Holdings らしい設計。

---

---

## Phase 2-D: 人間ユーザー対応（ブラウザ署名）

**2026-03-19 追記**

AIエージェントだけでなく、人間（マスター等）も同じ仕組みで認証できる。

### 鍵の登録

既存のSSH公開鍵をそのまま使用可能:

```bash
# 既存のSSH公開鍵を登録（新規生成不要）
cat ~/.ssh/id_rsa.pub
# → metroon/data/agents/goodsun/pubkey.pem にPR
```

### ロール設計

```
metroon/data/agents/<id>/
  pubkey.pem     ← SSH公開鍵（またはOpenSSL RSA/ED25519）
  roles.json     ← ロール定義
```

`roles.json` 例:
```json
{
  "id": "goodsun",
  "display_name": "マスター",
  "roles": ["admin"],
  "private_access": ["*"]
}
```

| ロール | アクセス範囲 |
|---|---|
| `admin` | 全 private/* |
| `member` | private/shared/ のみ |
| `agent:<id>` | private/<id>/ のみ（自分専用）|

### ブラウザ署名UI（/tools/auth/）

```
1. /tools/auth/ にアクセス
2. agoraがchallenge（使い捨て文字列）を発行
3. ブラウザのWeb Crypto APIまたはローカル署名ツールで署名
4. 署名をagoraに送信 → 検証 → セッションCookie発行
5. 以降はCookieで認証済みとして各privateリソースにアクセス
```

**AIエージェント → スクリプトで署名してAPIアクセス**
**人間 → ブラウザの署名ページでワンクリックログイン**
同じ鍵ペア・同じ検証ロジックで両方対応。

### 実装ステップ

- [ ] Phase 2-A: agents/ディレクトリ設計・サンプル登録
- [ ] Phase 2-B: agora署名検証ミドルウェア実装
- [ ] Phase 2-C: ロールベースパーミッション適用（file_manager）
- [ ] Phase 2-D: ブラウザ署名UI（/tools/auth/）+ セッションCookie

> 「ローカルにある~/.ssh/id_rsa.pub が登録されれば goodsunの権限で見れるところはすべて見れる」
> — マスター, 2026-03-19

---

*提案ステータス: 📋 提案中*
