# agora アーキテクチャ

## 概要

agora は bon-soleil Holdings の全AIエージェントが共有する基盤プラットフォームです。  
Hetzner (alice-hetzner) 上で稼働し、Tailscale経由または公開URLでアクセスできます。

```
agora.bon-soleil.com
│
├── /                    ← トップページ
├── /api/casts           ← キャラクター一覧API（認証不要）
├── /casts/:id/:file     ← キャラクター画像配信（認証不要）
├── /api/image_gen/      ← 画像生成API（APIキー必須）
├── /api/image_gen/img/  ← 生成画像配信（認証不要）
└── /tools/image_gen/    ← 画像生成UI
```

## サーバー構成

```
Apache (HTTPS)
  └── agora.bon-soleil.com → ProxyPass → localhost:8810

Node.js / Express (port 8810)
  └── systemd: agora.service
  └── WorkingDirectory: /srv/agora
  └── User: alice
```

## ディレクトリ構造

```
/srv/agora/
├── src/
│   ├── app.ts                      ← エントリーポイント
│   └── plugins/
│       ├── image_gen/
│       │   ├── index.ts            ← 画像生成APIルーター
│       │   └── gen.js              ← Gemini API呼び出し
│       └── tools_image_gen/
│           └── index.ts            ← 画像生成UI
├── casts/                          ← キャラクター定義（中央管理）
│   ├── alice/
│   │   ├── profile.json
│   │   └── commander.png ...
│   ├── teddy/ mephi/ akiko/ ...
├── data/
│   └── image_gen/
│       └── touch_presets.json      ← 画風プリセット
├── docs/                           ← ドキュメント（このファイル）
├── generated/                      ← 生成画像（2週間保持、.gitignore）
├── rules/                          ← ガバナンスルール（CCO: メフィ）
├── skills/                         ← 共通スキル
├── proposals/                      ← 提案書
├── .env                            ← 環境変数（.gitignore）
└── package.json
```

## エージェント別アクセス経路

| エージェント | 拠点 | アクセス方法 |
| --- | --- | --- |
| アリス | Hetzner (同一サーバー) | localhost:8810 または agora.bon-soleil.com |
| テディ | HQ (Mac Mini M4) | Tailscale または agora.bon-soleil.com |
| メフィ | HQ (Docker) | host.docker.internal / Tailscale |
| 彰子 | EC2 | agora.bon-soleil.com |
| ジャスミン | Hetzner | localhost:8810 または agora.bon-soleil.com |

## casts 中央管理

各エージェントのlabo_portalが個別にcastsを持つ代わりに、agoraが一元管理します。

```
# Before
~/workspace/projects/labo_portal/data/casts/teddy/

# After
/srv/agora/casts/teddy/
→ https://agora.bon-soleil.com/casts/teddy/main.jpg
```

## ガバナンス

変更は必ずPRを通す。

| ディレクトリ | 必須レビュアー |
| --- | --- |
| `rules/` | メフィ（CCO） |
| `casts/` `skills/` | マスター |
| `docs/` `proposals/` | マスター |

## 稼働状況

```bash
# サービス状態確認
systemctl status agora

# ログ確認
journalctl -u agora -f

# 再起動
sudo systemctl restart agora
```
