---
name: hibie
description: |
  GraphQL Schema Registry (hibie) を使ったスキーマファースト開発ワークフロー。hibie CLI でスキーマの取得・公開・PR連携を行い、graphql-codegen で型定義を自動生成する。
  TRIGGER: hibie, GraphQL, graphql, schema, スキーマ, codegen, graphql-codegen, graphql codegen, 型生成, 型定義, hibie.json, .graphqls, schema.graphql, hibie checkout, hibie pull, スキーマ取得, スキーマ公開, スキーマレジストリ, GraphQL 開発フロー, GraphQL 開発, スキーマ管理
  USE WHEN: GraphQL スキーマの取得・更新・公開、graphql-codegen による型定義の生成、hibie.json の操作、.graphqls ファイルの変更に関わる作業全般。また、GraphQL の開発フロー・スキーマ管理の仕組み・サービス間のスキーマ共有方法について質問・調査された場合にも参照する
---

# GraphQL Schema Registry (hibie) ワークフロー

Ubie では GraphQL スキーマをレジストリ (GCS) で一元管理し、
hibie (`@ubie-internal/hibie`) CLI でスキーマの取得・公開を行う。
スキーマファーストアプローチにより、スキーマ → codegen → 型定義
のパイプラインで型安全性を確保する。

## 背景

GraphQL スキーマをサービス間で共有する方法として、過去に以下を検討したが課題があった:

- **npm パッケージで配布**: Node.js 以外のプロジェクトで利用が面倒。JS コード以外を配布するのが本来の用途から外れている
- **[hive](https://the-guild.dev/graphql/hive) を利用**: PR 単位のスキーマバージョン参照が難しい

これらを解決するため、GCS をストレージとした自作のスキーマレジストリ (hibie) を構築した。

## アーキテクチャ

- **Schema Provider**: GraphQL API を提供するサービスが Cloud Build 経由で
  スキーマを GCS バケット (`ubie-gl-graphql-schema-prd-registry`) に登録する（リリースタグ作成時 / PR 作成・更新時）
- **Schema Consumer**: クライアントサービスが hibie でスキーマを取得し、
  codegen で型定義を自動生成する

```text
Service → Cloud Build → GCS Bucket → hibie → Client Service → codegen → 型定義
```

### バージョン体系

| バージョン形式       | 用途                                    |
| :------------------- | :-------------------------------------- |
| `release-YYYYMMDD-N` | 正式リリース版                          |
| `pr-<PR番号>`        | PR ごとの開発中バージョン               |
| `latest`             | 最新の release バージョンへのエイリアス |

## When to Use

- GraphQL スキーマを取得・更新したい場合
- 新しいサービスのスキーマをレジストリに公開したい場合
- PR でスキーマ変更を事前テストしたい場合
- codegen で型定義を再生成したい場合

## ワークフロー 1: スキーマの取得 (Consumer)

### 初期セットアップ

1. hibie をインストール:

   ```bash
   npm install --save-dev @ubie-internal/hibie
   ```

2. 設定ファイルを作成:

   ```bash
   npx hibie init
   ```

3. スキーマをダウンロード:

   ```bash
   npx hibie checkout <service>@latest
   ```

   → `.hibie/<service>/schema.graphql` にスキーマが保存される
   → `hibie.json` にバージョンが記録される

4. `.hibie` を `.gitignore` に追加する

5. codegen を実行して型定義を生成する
   （プロジェクト固有の codegen コマンドを確認して実行）

### hibie.json の構成

```json
{
  "out_dir": "./.hibie",
  "schemas": [
    {
      "service": "coedo",
      "version": "release-20260202-17"
    }
  ]
}
```

- `out_dir`: スキーマのダウンロード先ディレクトリ
- `schemas`: 取得するサービスとバージョンのリスト
- `.hibie` ディレクトリは `.gitignore` に追加し、`hibie.json` のみバージョン管理する

### スキーマの更新

```bash
npx hibie checkout <service>@latest
```

### チーム開発での同期

`git pull` 後に `hibie.json` が更新された場合:

```bash
npx hibie pull
```

開発環境では watch モードが便利:

```json
"scripts": {
  "dev:watch": "hibie pull --watch"
}
```

## ワークフロー 2: スキーマの公開 (Provider)

### Terraform 設定

`terraform-google-cloud` リポジトリの
Terraform 設定ファイル (`terraform/gl/ubie-gl-build/prd/graphql-schema.tf`) に以下を追加:

```hcl
module "<service>-graphql-schema" {
  source = "../modules/graphql-schema"

  repository_id = module.app_repos["<service>"].id
  service_name  = "<service>"
  schema_paths  = ["./src/**/*.graphqls"]
  exclude_paths = ["./src/**/*.internal.graphqls"]  # optional
}
```

### トリガー

設定適用後、以下のタイミングで自動的にスキーマがプッシュされる:

- リリースタグ作成時 → `release-YYYYMMDD-N`
- Pull Request 作成・更新時 → `pr-<PR番号>`

### バリデーション

ローカルでスキーマの構文チェック:

```bash
npx @ubie-internal/hibie validate --schema 'src/**/*.graphqls'
```

→ `GraphQL Schema is Valid` が出力されれば成功

## ワークフロー 3: PR でのスキーマ事前テスト

スキーマ変更を含む PR がある場合、リリース前にクライアント側で統合テストできる。

1. Provider 側で PR を作成すると `pr-xxx` バージョンが自動登録される
2. Consumer 側で PR バージョンを取得:

   ```bash
   npx hibie checkout <service>@pr-<PR番号>
   ```

3. codegen を実行して型定義を更新し、クライアントコードを修正・テスト
4. Provider の PR がリリースされたら最新版に戻す:

   ```bash
   npx hibie checkout <service>@latest
   ```

5. CI で pr-xxx バージョンの混入を防止:

   ```bash
   npx hibie config-validate
   ```

   → `release-YYYYMMDD-N` 以外のバージョンが指定されている場合エラー

## ワークフロー 4: ローカル開発 (スキーマ提供側を手元で動かす場合)

hibie を経由せず、ローカルのスキーマファイルを直接参照できる。
多くのプロジェクトでは環境変数でローカルパスを指定する仕組みが用意されている。

```bash
# 例: ofro から coedo のローカルスキーマを参照
COEDO_LOCAL_DIR=../coedo pnpm run gen:graphql
```

codegen 設定内で以下のように分岐することで実現する:

```typescript
// codegen.ts での分岐例
const schemaPath = process.env.COEDO_LOCAL_DIR
  ? `${process.env.COEDO_LOCAL_DIR}/src/modules/**/!(*.internal).graphqls`
  : "./.hibie/coedo/schema.graphql";
```

## ワークフロー 5: codegen との連携

hibie で取得したスキーマは `@graphql-codegen/cli` と組み合わせて型定義を生成する。

### Consumer 側 (Frontend) の典型的な codegen 設定

```typescript
// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./.hibie/coedo/schema.graphql",
  documents: ["./src/**/*.graphql"],
  generates: {
    "./src/generated/coedo/graphql.ts": {
      plugins: ["typescript"],
    },
    "./src/generated/coedo/": {
      preset: "near-operation-file",
      plugins: ["typescript-operations", "typed-document-node"],
    },
  },
};

export default config;
```

### Provider 側 (Backend) のスキーマ構成

```text
src/modules/
  <moduleName>/
    graphql/
      schema/
        <moduleName>.graphqls          ← 公開スキーマ
        <moduleName>.internal.graphqls ← 内部専用（公開除外）
```

- 各モジュールが `extend type Query` / `extend type Mutation` で分散定義
- `*.internal.graphqls` は `exclude_paths` で公開対象から除外される

## コマンドリファレンス

| コマンド                                 | 説明                                                |
| :--------------------------------------- | :-------------------------------------------------- |
| `npx hibie init`                         | `hibie.json` 設定ファイルを作成                     |
| `npx hibie checkout <service>@<version>` | スキーマをダウンロードし設定を更新                  |
| `npx hibie checkout <service>@latest`    | 最新リリース版のスキーマを取得                      |
| `npx hibie checkout <service>@pr-<N>`    | PR 版のスキーマを取得                               |
| `npx hibie pull`                         | `hibie.json` に記載されたバージョンのスキーマを取得 |
| `npx hibie pull --watch`                 | `hibie.json` の変更を検知して自動取得               |
| `npx hibie ls <service>`                 | レジストリのバージョン一覧を表示                    |
| `npx hibie get <service>@<version>`      | スキーマを標準出力に出力（設定不要）                |
| `npx hibie validate --schema '<glob>'`   | スキーマの構文バリデーション                        |
| `npx hibie config-validate`              | `hibie.json` のバージョン形式を検証                 |

## スキーマファースト型定義伝播チェックリスト

Agent がスキーマ変更に関わる作業を行う際、以下を確認する:

1. `hibie.json` が存在するか確認し、対象サービスのスキーマ設定を把握する
2. スキーマを最新化する (`npx hibie checkout <service>@latest`)
3. codegen を実行して型定義を再生成する
4. 生成された型定義が正しくインポート・使用されていることを確認する
5. 型エラーがないことをビルド/型チェックで確認する
6. PR ワークフローの場合: `hibie config-validate` が通ることを確認する

## 参考

- [GraphQL スキーマレジストリについて](https://docs.ubie.dev/ja/explanation/about-graphql-schema-registry/) (tech-docs)
- [GraphQL スキーマの取得方法](https://docs.ubie.dev/ja/how-to-guide/how-to-get-graphql-schema/) (tech-docs)
- [GraphQL スキーマの公開方法](https://docs.ubie.dev/ja/how-to-guide/how-to-publish-graphql-schema/) (tech-docs)
- hibie リポジトリ: `github.com/ubie-inc/hibie`
- [実践例: ofro と coedo のスキーマ共有](references/ofro-coedo-example.md)
