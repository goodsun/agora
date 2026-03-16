# bon-soleil Holdings インフラ設計

## 命名思想

古代ギリシャの都市構造をそのままインフラに投影した。
名前から役割が自明であり、混同しようがない。

| 名称 | 語源 | 場所 | 役割 |
|---|---|---|---|
| **agora** | 古代ギリシャの広場 | `/srv/agora/` | システム・ツール群 |
| **archeion** | 公文書管理者の執務所、archiveの語源 | `/srv/archeion/` | bareリポジトリ群（原典） |
| **bibliotheke** | 図書館・写本室 | `/srv/shared/bibliotheke/` | 人格・存在テンプレート |
| **metroon** | アゴラ内の公文書館 | `/srv/shared/metroon/` | 共有スキル・スクリプト・データ |

---

## ディレクトリ構造

```
/srv/
├── agora/                  ← システム（git管理: goodsun/agora）
│   ├── src/                ← アプリケーションコード
│   ├── docs/               ← ドキュメント（このファイル）
│   └── proposals/          ← 提案書
│
├── archeion/               ← 原典（bareリポジトリ群）
│   ├── bibliotheke.git     ← 人格テンプレの原典
│   └── metroon.git         ← 共有技術の原典
│
└── shared/                 ← 写本（cloneして使う）
    ├── bibliotheke/        ← archeion/bibliotheke.git からclone
    └── metroon/            ← archeion/metroon.git からclone
        ├── skills/         ← 共有スキル
        ├── scripts/        ← 共有スクリプト
        └── data/           ← 共有データ（casts, presets等）
```

---

## bibliotheke — 人格テンプレート

新エージェントが自分を知るための起点。ここから始めて個人のworkspaceを育てる。

```
bibliotheke/
├── SOUL.md       ← 人格・価値観のテンプレート
├── IDENTITY.md   ← 名前・ロール・アバターのテンプレート
├── AGENTS.md     ← エージェントとして守るべき共通ルール
├── USER.md       ← 担当ユーザー情報のテンプレート
├── HEARTBEAT.md  ← 定期チェックの設定テンプレート
├── README.md     ← 概要
├── memory/       ← 日次メモリ置き場（.gitkeep）
└── projects/     ← プロジェクト置き場（.gitkeep）
```

**使い方**: cloneして各自のworkspaceを作成し、自分用にカスタマイズする。

---

## metroon — 共有技術・知識

全エージェントが参照できる共有リソース。

```
metroon/
├── TOOLS.md        ← 共有ツール使用方法
├── skills/         ← 共有スキル（SKILL.md群）
├── scripts/        ← 共有スクリプト
├── config/         ← 共有設定
└── data/
    ├── casts/      ← キャラクター定義（全エージェント共有）
    ├── presets/    ← モデル・タッチプリセット
    └── uploads/    ← アップロードデータ（.gitignore対象）
```

---

## archeion — 原典管理

bareリポジトリとして `/srv/archeion/` に配置。直接編集しない。

```bash
# HQやその他サーバからcloneする場合
git clone alice-hetzner:/srv/archeion/bibliotheke.git
git clone alice-hetzner:/srv/archeion/metroon.git
```

---

## 知識還元フロー（PR文化）

```
archeion
  └── clone
        └── 各エージェントのworkspace
              └── 得た知見（新スキル・TOOLS更新等）
                    └── PR → archeion にマージ
                                └── pull → 全エージェントに伝播
```

**PRに向くもの**: `skills/` の新スキル・改善、`TOOLS.md` の知見、`data/casts/` のキャラ更新

**PRに向かないもの**: 個人の `SOUL.md`、`MEMORY.md`、`USER.md`（個人のもの）

---

## 新エージェントのオンボーディング

```bash
# 1. bibliothekeをcloneして自分のworkspaceを作る
git clone /srv/archeion/bibliotheke.git ~/workspace

# 2. 自分用にカスタマイズ
vim ~/workspace/SOUL.md
vim ~/workspace/IDENTITY.md

# 3. metroonのスキルを参照する
ls /srv/shared/metroon/skills/

# 4. agoraのAPIを使う
curl https://agora.bon-soleil.com/api/casts
```

---

## エージェント一覧

| エージェント | 拠点 | ランタイム | 役割 |
|---|---|---|---|
| アリス 🐇 | alice-hetzner | OpenClaw | インフラ・運用管理 |
| ジャスミン | alice-hetzner | OpenClaw | XPathGenie・解析 |
| 彰子 | alice-hetzner | OpenClaw | BizenDAO・インフルエンサー |
| テディ 🧸 | Mac Mini M4 | OpenClaw | 設計・企画 |
| みぃちゃん | Mac Mini M4 | Blwa | 会話・サポート |
| メフィ 😈 | Mac Mini M4 (Docker) | OpenClaw | セキュリティ・監査 (CCO) |
| Abu | Mac Mini M4 (Docker) | OpenClaw | Web操作・XPathGenie |
| りんちゃん | hinoMBP | OpenClaw | 研究・論文サポート |
