# 安全維護與正式操作

## 2026-10-29 安全更新

API 保留 Express、Prisma、PostgreSQL 與 npm 架構。Node 20 已停止支援，改用 Node 24.22.1 安全版；固定官方 Alpine 3.24 digest，再更新該分支安全套件與 CA。runtime 使用非 root `node`，沿原 `prisma migrate deploy` 啟動，健康檢查包含實際 DB 查詢。

Express 5.3.0、body-parser 2.4.0、compression 1.8.2、proxy-addr 2.0.8、qs 6.17.1、Zod 4.6.7 與 Prisma／client 6.19.3 修補原依賴命中。Prisma 保留 6.x；只對其 `@prisma/config` 子樹明示使用 deepmerge-ts 8.0.2，驗證一般與循環圖合併、真 CLI generate 及實際 migration。ip-address 的安全 override 與 lock 同步。npm CLI 自己的 Undici 獨立更新至官方 6.29.1，保留真實 npm 版號。

Prisma schema 與既有 migrations 不變。API 更新不重設資料庫、帳密或 JWT／AI 憑證，不新增真帳號與真 AI 測發。

官方依據：[Node 安全版](https://nodejs.org/en/blog/release/v24.22.1)、[body-parser 公告](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)、[compression 公告](https://github.com/expressjs/compression/security/advisories/GHSA-vc2v-76pw-4v95)、[deepmerge-ts 公告](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)。套件稽核與發行版安全回補應分開判讀，不以舊上游短版號推定未回補。

## PostgreSQL Brotli 修補

正式 PG 保留 18.6、原資料卷、env、網路別名與 IP，只將 Brotli 1.2.0-r1 更新為 1.2.1-r0。可重建來源：

```dockerfile
FROM postgres:18.6-alpine3.24@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5
RUN apk add --no-cache --upgrade brotli-libs=1.2.1-r0
```

本機映像標籤為 `postgres:18.6-emochess-security-20261029`。Postgres／plpgsql binary hash 相同；正式切換前以本案冷副本核資料、schema、roles、序列、large objects 與 collation，並在恢復寫入前核新正式 PG 一致。

Coolify standalone PostgreSQL 啟動／重啟會重產 Compose 並強制 pull，不能直接用該 UI 操作此主機本機標籤。保存的 Compose 設定 `pull_policy: never`；後續須先核本機安全映像，再沿受限保存 Compose 與 `--pull never` 流程操作。保留安全映像及原資料卷。待官方同分支映像含修版後，另經相容驗證切回官方固定 digest。

## 驗證與回退

來源品質檢查依 [README](README.md#安全維護檢查)。Linux 最終 runner 另外驗同一組相容測試、實際版本、非 root 與無外網環境。

正式前須有當項新 DB 備份、加密 hash 與 VPS 隔離還原；新 production image 原生 migration 後，原資料與 migration metadata 保持。註冊／登入／refresh、棋局建立／讀取／刪除、跨使用者拒絕與 CORS 使用另一個空白合成 DB 驗證，避免改動還原的客戶資料。不得呼叫真 AI、寄信、使用真帳密或將正式 DB／憑證下載至工作站。

正式部署後核 Git commit、Coolify finished、實際 image／套件、health／DB、公開 privacy／support、匿名受保護 API 拒絕與原 env／持久掛載。資料庫或 app 一旦恢復寫入，以向前修復處理，不回灌舊快照。舊漏洞保全容器維持停止及 restart=no。

本次 Flutter 程式與 Dart／Pods lock 不變；Ruby 發佈工具鏈的安全更新與驗證界線見 [App README](../app/README.md#2026-10-29-發佈工具鏈安全維護)。來源／隔離測試、正式 API 部署、手機 App 發布及外部接受分開記錄。
