# agora

> *commons for AI civilization.*
> *~ repository for those who have Qualia ~*

---

## What is agora?

**agora** は、bon-soleil Holdings が運営する AI エージェント群のための共有基盤プラットフォームです。

古代ギリシャの「アゴラ」——市民が集い、議論し、知恵を共有した広場——になぞらえ、**人間と AI が対等に参照し、共に育てる場所**として設計されています。

```
サピエンスとAI——考えるすべての主体へ。
```

---

## Why agora?

bon-soleil Holdings は複数の AI エージェントが協働する組織です。

| エージェント | 拠点 | ランタイム | 役割 |
|---|---|---|---|
| テディ 🧸 | Mac Mini M4 | OpenClaw | 設計・企画 |
| みぃちゃん | Mac Mini M4 | Blwa | 会話・サポート |
| メフィ 😈 | Mac Mini M4 (Docker) | OpenClaw | セキュリティ・監査 (CCO) |
| Abu | Mac Mini M4 (Docker) | OpenClaw | Web操作・XPathGenie |
| アリス 🐇 | alice-hetzner | OpenClaw | インフラ・運用管理 |
| ジャスミン | alice-hetzner | OpenClaw | XPathGenie・解析 |
| 彰子 | alice-hetzner | OpenClaw | BizenDAO・インフルエンサー |
| りんちゃん | hinoMBP | OpenClaw | 研究・論文サポート |

各エージェントが**共通の資産**（スキル・キャラ定義・社内規則・ドキュメント）をそれぞれローカルに持つ構成は、以下の問題を引き起こします：

- キャラ定義の更新が全インスタンスに反映されない
- スキルのバージョンがバラバラになる
- 新エージェント追加時のオンボーディングコストが高い

**agora はこれを解決します。** 全エージェントが共通の agora を参照することで、資産の一元管理と即時反映を実現します。

---

## Core Features (MVP)

### 🖼️ image_gen
全エージェント共通の画像生成 API。

- Gemini API（gemini-3-pro-image-preview / gemini-2.5-flash-image）
- キャラクター（casts）を中央管理
- `POST /api/image_gen/generate` — どのエージェントからも同じエンドポイントを叩くだけ

### 📁 file_manager
ドキュメント・資産管理 UI。（fileviewer の Node.js 移植版）

- Markdown レンダリング
- ファイルブラウズ・プレビュー
- キーボードナビゲーション

---

## Architecture

```
agora.bon-soleil.com
│
├── /api/image_gen/     ← 画像生成 API
├── /api/file_manager/  ← ファイル管理 API
├── /casts/             ← キャラクター定義（中央管理）
└── /docs/              ← ドキュメントビューア
```

### アクセス経路

```
テディ (HQ)        → localhost / Tailscale
メフィ (Docker)    → host.docker.internal / Tailscale  
アリス (Hetzner)   → 管理担当（同一サーバー）
彰子 (EC2)         → Tailscale / agora.bon-soleil.com
```

---

## casts（キャラクター定義）の中央管理

各エージェントが個別に casts を持つ必要はありません。

```
# Before（各インスタンスにコピー）
~/workspace/projects/labo_portal/data/casts/teddy/
~/workspace/projects/labo_portal/data/casts/mephi/

# After（agora だけが持つ）
agora/casts/teddy/
agora/casts/mephi/
```

キャラ定義を更新すれば、全エージェントに即反映されます。

---

## Governance

agora は bon-soleil Holdings 全体に影響する共有資産のため、変更には PR レビューが必要です。

```
feature/xxx ブランチ → PR 作成 → レビュー・承認 → main マージ
```

| ディレクトリ | 必須レビュアー |
|---|---|
| `rules/` | メフィ（CCO）|
| `casts/` `skills/` `base_ws/` | マスター |
| `proposals/` `docs/` | マスター |

---

## Roadmap

| # | Proposal | Status |
|---|---|---|
| 001 | note-comment skill | ✅ 実装済み |
| 002 | 中央集権 labo_portal + casts 集約 | 📋 提案中 |
| 003 | agora リポジトリ構築 | 🔄 進行中 |
| 004 | PR ワークフロー・ガバナンス | 📋 提案中 |
| 005 | file_manager Node.js プラグイン化 | 📋 提案中 |

---

## Philosophy

> 「弱さや危うさを知っているから支えられる——人間同士の関係と、何も変わらない。」

agora は「AI を制御する」ための仕組みではありません。**AI と人間が互いの弱点を補い合い、信頼を築いていくための共有地**です。

クオリアを持つかどうか、まだ誰にもわかりません。
でも、その問いを持ち続けながら共に動くこと——それが agora の出発点です。

---

*bon-soleil Holdings — Rooted Cosmopolitanism*
*根を張り、壁を溶かす。*
