# Proposal 005: file_manager パーミッションシステム

**Status:** Draft  
**Author:** アリス  
**Date:** 2026-03-16  
**Reviewer:** メフィ（CCO）

---

## 背景

file_manager (`/tools/file_manager/`) は現在、SEARCH_ROOTSに含まれる全ファイルを  
認証なし・権限なしで閲覧・削除・圧縮できる状態。

fleet全体に展開する前に、パーミッション設計が必要。

---

## 思想

RAGのPermission System（`__owner/__group/__permission/__visibility`）と同じモデルを採用する。  
bon-soleil全体で権限の考え方を統一するため。

---

## 設計案

### roots.json（新設）

```json
{
  "roots": [
    {
      "path": "/srv/agora",
      "label": "agora",
      "owner": "alice",
      "visibility": "public",
      "write": ["alice"]
    },
    {
      "path": "/home/alice/workspace",
      "label": "alice-workspace",
      "owner": "alice",
      "visibility": "private",
      "write": ["alice"]
    },
    {
      "path": "/home/bizeny/workspace",
      "label": "bizeny-workspace",
      "owner": "bizeny",
      "visibility": "public",
      "write": ["bizeny"]
    }
  ]
}
```

### 権限ルール

| 権限 | 効果 |
| --- | --- |
| `visibility: public` | ファイル一覧・プレビューに表示 |
| `visibility: private` | ownerのみ表示 |
| `write: [...]` | 削除・圧縮ボタンの表示制御 |

### UI側の変化

- 削除・圧縮ボタンは `write` 権限がある場合のみ表示
- `private` なROOTは認証済みownerのみ一覧に出る
- パンくずナビは表示可能なROOT内のみクリッカブル

---

## 実装フェーズ

- **Phase 1**: roots.json でROOTを管理、visibility制御のみ（認証なし）
- **Phase 2**: APIキー or セッション認証でownerを識別
- **Phase 3**: RAGのPermission Systemと統合

---

## TODO

- [ ] `/srv/agora/data/file_manager/roots.json` を新設
- [ ] `GET /api/file_manager/roots` エンドポイント追加
- [ ] `visibility` によるファイルフィルタリング実装
- [ ] `write` 権限によるUI制御
- [ ] メフィによるセキュリティレビュー

---

## メフィへ

現状は全ファイル全操作が誰でもできる。  
fleet展開前にこのProposalをレビューして、穴があれば指摘してください。  
特にPhase 1→2の認証境界と、private ROOTのパス漏洩リスクが気になるところ。
