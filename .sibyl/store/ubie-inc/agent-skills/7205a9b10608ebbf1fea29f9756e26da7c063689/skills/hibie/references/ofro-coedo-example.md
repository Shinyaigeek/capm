# 実践例: ofro と coedo の GraphQL スキーマ共有

ofro (Frontend) と coedo (Backend) 間でのスキーマ共有は hibie の代表的なユースケース。
この文書ではその具体的な構成を記録する。

## 全体フロー

```text
coedo (Backend)
  │
  ├─ リリースタグ作成 ─→ Cloud Build ─→ GCS に release-YYYYMMDD-N を push
  │
  └─ PR 作成/更新 ────→ Cloud Build ─→ GCS に pr-xxx を push
                                           │
                                           ▼
                                    GCS バケット
                                    (ubie-gl-graphql-schema-prd-registry)
                                           │
                                     hibie checkout / pull
                                           │
                                           ▼
ofro (Frontend)
  .hibie/coedo/schema.graphql
       │
       ▼
  graphql-codegen → src/generated/coedo/**/*.ts（型安全なコード）
```

## coedo (Backend / Schema Provider)

### スキーマ定義の場所

各モジュールが個別にスキーマを持つ:

```text
src/modules/
  membership/
    graphql/schema/membership.graphqls
  diagnosis/
    graphql/schema/diagnosis.graphqls
  ...
```

- `*.graphqls`: 公開 API スキーマ（`extend type Query` / `extend type Mutation` パターン）
- `*.internal.graphqls`: 内部専用スキーマ（レジストリへの公開から除外）

### GraphQL サーバー設定

GraphQL Yoga (NestJS) で `typePaths` を指定:

```typescript
// src/apps/server/resolver.module.ts
typePaths: "./src/modules/**/!(*.internal).graphqls";
```

### codegen 設定

`codegen.ts` で各モジュールの resolver 型を生成:

- `@graphql-codegen/typescript-resolvers` で resolver の型定義を生成
- `graphql-codegen-wrapper` が全モジュールの resolver mapper を集約

### hibie.json (coedo が参照する外部サービスのスキーマ)

```json
{
  "out_dir": "./.hibie",
  "schemas": [
    { "service": "salus", "version": "release-20240730-1" },
    { "service": "mandala", "version": "release-20251212-1" },
    { "service": "mimas", "version": "release-20250812-1" }
  ]
}
```

coedo 自身も他サービスのスキーマを hibie で取得している。

### 主要な npm scripts

```json
{
  "gen": "... (PrismaClient & GraphQL types)",
  "gen:gql": "hibie pull && graphql-codegen",
  "hibie:pull": "hibie pull",
  "hibie:watch": "hibie pull --watch"
}
```

### graphql.config.js

```javascript
module.exports = {
  projects: {
    "coedo-public": {
      schema: "./src/modules/**/!(*.internal).graphqls",
    },
    "coedo-internal": {
      schema: "./src/modules/**/*.internal.graphqls",
    },
  },
};
```

## ofro (Frontend / Schema Consumer)

### hibie.json

```json
{
  "out_dir": "./.hibie",
  "schemas": [{ "service": "coedo", "version": "release-20260202-17" }]
}
```

ofro は coedo のスキーマのみを取得している。

### graphql.config.json

```json
{
  "projects": {
    "coedo-schema": {
      "schema": "./.hibie/coedo/schema.graphql",
      "documents": ["./src/**/*.graphql"]
    }
  }
}
```

### codegen.ts

- `schema`: `./.hibie/coedo/schema.graphql`（hibie で取得した統合スキーマ）
- `documents`: `./src/**/*.graphql`（コンポーネントに colocate されたクエリ/フラグメント）
- 生成先:
  - `./src/generated/coedo/graphql.ts` — 全型定義 (`typescript` plugin)
  - `./src/generated/coedo/` — 操作ごとの型 (`near-operation-file` preset)
- 使用プラグイン: `typescript-operations`, `typed-document-node`, `fragment-matcher`

### ローカル開発

```bash
# hibie 経由（デフォルト）
pnpm run gen:graphql

# ローカルの coedo スキーマを直接参照
COEDO_LOCAL_DIR=../coedo pnpm run gen:graphql
```

`COEDO_LOCAL_DIR` 設定時、codegen は hibie の `.hibie/coedo/schema.graphql` の代わりに
`${COEDO_LOCAL_DIR}/src/modules/**/!(*.internal).graphqls` を参照する。

### 主要な npm scripts (ofro)

```json
{
  "gen:graphql": "graphql-codegen",
  "gen:graphql:watch": "graphql-codegen --watch",
  "hibie:pull": "hibie pull",
  "hibie:checkout": "hibie checkout"
}
```

### GraphQL ドキュメントの配置パターン

コンポーネントに colocate（コロケーション）する:

```text
src/components/top/LoggedInContent/
  DiagnosisHistoriesSection.tsx
  DiagnosisHistoriesSection.graphql   ← クエリ/フラグメント
  DiagnosisHistoriesSection.generated.ts  ← codegen が生成
```

## CI での検証

両リポジトリとも CI で以下を実行:

```bash
npx hibie config-validate
```

`release-YYYYMMDD-N` 以外のバージョン（例: `pr-xxx`）が `hibie.json` に残っている場合にエラーとなり、
開発中バージョンが main にマージされることを防止する。

## 主要な依存パッケージ

### coedo

- `@graphql-codegen/cli` ^5.0.3
- `@graphql-codegen/typescript` ^4.1.2
- `@graphql-codegen/typescript-resolvers` ^4.2.1
- `@graphql-yoga/nestjs` ^3.7.0

### ofro

- `@graphql-codegen/cli` ^3.3.1
- `@graphql-codegen/typescript` ^3.0.4
- `@graphql-codegen/typescript-operations` ^3.0.4
- `@graphql-codegen/near-operation-file-preset` ^3.0.0
- `@graphql-codegen/fragment-matcher` ^5.0.0
- `@graphql-codegen/typed-document-node` ^4.0.1
- `@apollo/client` ^3.13.4
