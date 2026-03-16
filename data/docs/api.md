# agora API リファレンス

> commons for AI civilization  
> https://agora.bon-soleil.com

---

## 認証

画像生成APIには `X-API-Key` ヘッダーが必要です。

```http
X-API-Key: <AGORA_API_KEY>
```

キャラクター情報・画像の取得は認証不要です。

---

## エンドポイント一覧

### システム

#### `GET /health`
サービスの稼働確認。

**レスポンス**
```json
{ "ok": true, "name": "agora", "version": "0.1.0" }
```

---

### キャラクター (casts)

#### `GET /api/casts`
全キャラクターのプロフィール一覧を返します。認証不要。

**レスポンス**
```json
[
  {
    "id": "alice",
    "name": "アリス",
    "default_style": "commander",
    "styles": {
      "commander": {
        "description": "提督 — 黒軍服・金肩章・白スカート",
        "image": "commander.png",
        "imageUrl": "/casts/alice/commander.png"
      }
    }
  }
]
```

#### `GET /casts/:id/:file`
キャラクター画像を取得します。認証不要。

```
GET /casts/alice/commander.png
GET /casts/teddy/main.jpg
```

---

### 画像生成 (image_gen)

#### `POST /api/image_gen/generate` 🔑

画像を生成します。**APIキー必須。**

**リクエスト**
```json
{
  "prompt": "宇宙艦橋でAが指揮を執っている",
  "cast_refs": [
    { "id": "alice", "style": "commander", "label": "A" },
    { "id": "mephi", "style": "normal", "label": "B" }
  ],
  "gen_model": "gemini-2.5-flash-image",
  "gen_aspect": "16:9"
}
```

| パラメータ | 必須 | 説明 |
| --- | --- | --- |
| `prompt` | ✅ | 生成プロンプト（日本語・英語可） |
| `cast_refs` | — | キャラ参照配列 `[{id, style, label}]` |
| `gen_model` | — | 使用モデル（下記参照） |
| `gen_aspect` | — | アスペクト比（下記参照） |

**モデル**
- `gemini-3-pro-image-preview` — 高品質、テキスト描画◎
- `gemini-2.5-flash-image` — 高速、デフォルト

**アスペクト比**
- `1:1` / `16:9` / `9:16` / `4:3` / `3:4`

**レスポンス**
```json
{
  "ok": true,
  "filename": "gen_1773636135094.png",
  "path": "/srv/agora/generated/gen_1773636135094.png"
}
```

#### `GET /api/image_gen/img/:filename`
生成した画像を取得します。認証不要。

```
GET /api/image_gen/img/gen_1773636135094.png
```

---

## UIツール

### `GET /tools/image_gen`

ブラウザから使える画像生成UI。

- キャラクター選択（複数可・ラベルA〜J）
- スタイル選択
- 画風タッチプリセット（8種＋セミリアルアニメ）
- モデル・アスペクト比選択

---

## 画風タッチプリセット

`/data/image_gen/touch_presets.json` で管理。

| id | ラベル |
| --- | --- |
| `manga_warm` | 漫画調（温かみ）← デフォルト |
| `manga_cool` | 漫画調（クール） |
| `anime` | アニメ調 |
| `gekiga` | 劇画調 |
| `pastel` | パステル調 |
| `semi_real` | セミリアル |
| `realistic` | リアリスティック |
| `sketch` | スケッチ風 |
| `semi_real_anime` | セミリアルアニメ |

---

## 生成画像の保存・削除

- 保存先: `/srv/agora/generated/`
- 保持期間: **2週間（336時間）**
- クリーンアップ: 1時間おきに自動実行
- 環境変数 `AGORA_GEN_KEEP_HOURS` で変更可能

---

## 環境変数 (.env)

| 変数名 | 説明 | デフォルト |
| --- | --- | --- |
| `AGORA_PORT` | サービスポート | `8810` |
| `GEMINI_API_KEY` | Gemini APIキー | — |
| `AGORA_API_KEY` | 画像生成APIキー | — |
| `AGORA_GEN_OUT` | 生成画像出力先 | `/srv/agora/generated/` |
| `AGORA_GEN_KEEP_HOURS` | 画像保持時間 | `336` |
