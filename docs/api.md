# agora API リファレンス

> commons for AI civilization  
> https://agora.bon-soleil.com

---

## 認証

画像生成APIには `X-API-Key` ヘッダーが必要です。

```http
X-API-Key: <AGORA_API_KEY>
```

キャラクター情報・画像取得・file_manager（Phase 1）は認証不要です。

---

## Casts API

### GET /api/casts
全キャラクター一覧を返します。

**Response**
```json
[
  {
    "id": "alice",
    "name": "アリス",
    "styles": {
      "main": { "description": "通常", "image": "main.jpg" },
      "commander": { "description": "司令官", "image": "commander.jpg" }
    },
    "defaultStyle": "main",
    "imageUrl": "https://agora.bon-soleil.com/casts/alice/main.jpg"
  }
]
```

### GET /casts/:id/:file
キャラクター画像を配信します。

```
GET /casts/alice/main.jpg
```

---

## Image Gen API

### POST /api/image_gen/generate
**認証必須** (`X-API-Key`)

画像を生成します。

**Request Body**
```json
{
  "prompt": "生成プロンプト",
  "touch": "warm_manga",
  "model": "gemini-2.5-flash-image",
  "aspect": "1:1",
  "casts": [
    { "id": "alice", "style": "main", "label": "A" }
  ],
  "bg_filename": "scene.jpg"
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `prompt` | ✓ | 生成プロンプト |
| `touch` | | タッチプリセットID |
| `model` | | モデル名（デフォルト: gemini-2.5-flash-image） |
| `aspect` | | アスペクト比: `1:1` `9:16` `16:9` `4:3` `3:4` |
| `casts` | | キャラクター配列（省略可、0件でプロンプト単体生成） |
| `bg_filename` | | 背景シーンファイル名 |

**対応モデル**
- `gemini-3-pro-image-preview` — 高品質、テキスト描画◎
- `gemini-2.5-flash-image` — 速い、フィルタ緩め
- `imagen-4.0-fast-generate-001` — アスペクト比確実

**Response**
```json
{ "ok": true, "filename": "gen_1710000000000.jpg", "url": "/api/image_gen/img/gen_xxx.jpg" }
```

### POST /api/image_gen/upload_bg
**認証必須** (`X-API-Key`)

背景シーン画像をアップロードします（永続保存）。

```
Content-Type: multipart/form-data
field: file（画像ファイル、10MB以下）
```

**Response**
```json
{ "ok": true, "filename": "scene_xxx.jpg" }
```

### GET /api/image_gen/scenes
背景シーン一覧を返します。

**Response**
```json
[
  { "filename": "scene_xxx.jpg", "url": "/api/image_gen/scene/scene_xxx.jpg" }
]
```

### GET /api/image_gen/img/:filename
生成画像を配信します（認証不要）。

### GET /api/image_gen/scene/:filename
背景シーン画像を配信します（認証不要）。

---

## File Manager API

> Phase 1: 認証なし。ROOTS外へのアクセスはサーバー側で拒否。

**対象ルート**: `FILE_MANAGER_ROOTS` 環境変数で指定（デフォルト: `/srv/shared/agora/data`）

### GET /api/file_manager/files
ファイル一覧を返します。

**Query**
- `root` — ルートディレクトリでフィルタ

**Response**
```json
[
  {
    "path": "/srv/shared/agora/data/casts/alice/profile.json",
    "name": "profile.json",
    "type": "json",
    "size": 512,
    "mtime": 1710000000
  }
]
```

`type`: `md` / `json` / `image`

### GET /api/file_manager/file
ファイル内容を取得します。

```
GET /api/file_manager/file?path=/srv/shared/agora/data/docs/api.md
```

### PUT /api/file_manager/file
ファイルを上書き保存します（MD / JSON のみ）。

```
PUT /api/file_manager/file?path=...
Content-Type: text/plain
Body: ファイル内容
```

### PATCH /api/file_manager/file
ファイルをリネームします。

```
PATCH /api/file_manager/file?path=...&newname=newname.json
```

### DELETE /api/file_manager/file
ファイルを削除します。

```
DELETE /api/file_manager/file?path=...
```

### POST /api/file_manager/upload
ファイルをアップロードします（20MB以下）。

```
POST /api/file_manager/upload?dir=/srv/shared/agora/data/casts/alice
Content-Type: multipart/form-data
field: file
```

対応拡張子: `.md` `.json` `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg`

### POST /api/file_manager/compress
画像を軽量化します（上書き保存）。

```
POST /api/file_manager/compress?path=...
```

- PNG: 透過情報保持のままpalette圧縮
- JPG/WEBP: JPEG品質75に変換

---

## Health Check

### GET /health

```json
{ "ok": true, "name": "agora", "version": "0.1.0" }
```
