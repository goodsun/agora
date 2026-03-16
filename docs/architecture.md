# agora アーキテクチャ

## 概要

agora は bon-soleil Holdings の全AIエージェントが共有する基盤プラットフォームです。  
Hetzner (alice-hetzner) 上で稼働し、公開URLまたはTailscale経由でアクセスできます。

**設計思想**: システム（コード）とデータを完全分離。  
`/srv/agora/` はシステム、`/srv/shared/` は共有データ。

---

## サーバー構成

```
Apache (HTTPS / Let's Encrypt)
  └── agora.bon-soleil.com → ProxyPass → localhost:8810

Node.js / Express (port 8810)
  systemd: agora.service
  User: alice
  WorkingDirectory: /srv/agora
```

---

## ディレクトリ構造

### システム（コード）

```
/srv/agora/                         ← git管理 (goodsun/agora)
├── src/
│   ├── app.ts                      ← エントリーポイント・トップページ
│   └── plugins/
│       ├── image_gen/
│       │   ├── index.ts            ← 画像生成APIルーター
│       │   └── gen.js              ← Gemini/Imagen API呼び出し
│       ├── tools_image_gen/
│       │   └── index.ts            ← 画像生成UI
│       └── tools_file_manager/
│           ├── index.ts            ← ファイルマネージャーAPI
│           └── static/index.html   ← ファイルマネージャーUI
├── generated/                      ← 生成画像（2週間保持、.gitignore）
├── proposals/                      ← 提案書
├── .env                            ← 環境変数（.gitignore）
└── package.json
```

### 共有データ

```
/srv/shared/
├── base_ws/                        ← 原本ワークスペース（スキル等、直接編集しない）
└── agora/
    └── data/                       ← agoraが管理する共有データ
        ├── casts/                  ← キャラクター定義（全エージェント共有）
        │   ├── alice/
        │   │   ├── profile.json
        │   │   └── *.jpg
        │   ├── teddy/ mephi/ akiko/ ...
        ├── docs/                   ← ドキュメント（このファイル）
        ├── image_gen/
        │   └── touch_presets.json  ← 画風プリセット
        └── uploads/
            └── scenes/             ← 背景シーン画像（永続保存）
```

---

## ルーティング

```
/                        ← トップページ（Tools + API一覧）
/health                  ← ヘルスチェック

/api/casts               ← キャラクター一覧（認証不要）
/casts/:id/:file         ← キャラクター画像配信（認証不要）

/api/image_gen/generate  ← 画像生成（APIキー必須）
/api/image_gen/upload_bg ← 背景アップロード（APIキー必須）
/api/image_gen/img/:file ← 生成画像配信（認証不要）
/api/image_gen/scenes    ← 背景シーン一覧（認証不要）
/api/image_gen/scene/:f  ← 背景シーン配信（認証不要）

/api/file_manager/files  ← ファイル一覧（認証なし・Phase1）
/api/file_manager/file   ← ファイル取得/保存/削除/リネーム
/api/file_manager/upload ← ファイルアップロード
/api/file_manager/compress ← 画像軽量化

/tools/image_gen/        ← 画像生成UI
/tools/file_manager/     ← ファイルマネージャーUI
```

---

## 環境変数 (.env)

| 変数 | 説明 |
|---|---|
| `AGORA_PORT` | リッスンポート（デフォルト: 8810） |
| `AGORA_API_KEY` | 画像生成APIキー |
| `GEMINI_API_KEY` | Gemini API キー |
| `FILE_MANAGER_ROOTS` | ファイルマネージャーのルートディレクトリ（カンマ区切り） |
| `AGORA_GEN_OUT` | 生成画像出力先（デフォルト: /srv/agora/generated） |
| `AGORA_GEN_KEEP_HOURS` | 生成画像保持時間（デフォルト: 336 = 2週間） |

---

## エージェント別アクセス

| エージェント | 拠点 | アクセス |
|---|---|---|
| アリス | alice-hetzner（同一サーバー） | localhost:8810 |
| テディ / メフィ | Mac Mini M4 | agora.bon-soleil.com |
| 彰子 | EC2 | agora.bon-soleil.com |
| ジャスミン | alice-hetzner | localhost:8810 |

---

## 運用コマンド

```bash
# 状態確認
systemctl status agora

# ログ確認
journalctl -u agora -f

# 再起動
sudo systemctl restart agora

# 生成画像の手動クリーンアップ
find /srv/agora/generated -mtime +14 -delete
```

---

## フェーズ計画

| フェーズ | 内容 |
|---|---|
| Phase 1（現在） | 認証なし・git resetで復元可 |
| Phase 2 | セッション認証・ユーザー別ルート |
| Phase 3 | RAG連携・パーミッションシステム |
