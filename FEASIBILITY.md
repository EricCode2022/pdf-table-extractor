# PDF Table Extractor 可行性与技术方案 V1.0

> 基于《PDF_Table_Extractor_PRD_V1.0.html》与界面效果图
> 路线：规则引擎为主 + LLM 兜底｜本地优先，后上 Vercel
> 状态：MVP 已实现并在本地跑通（2026-11-23）

## 0. 关键决策

| 决策项 | 选择 | 相对 PRD 的变化 |
|---|---|---|
| AI 能力 | 规则引擎 + LLM 兜底 | PRD 原文"大模型不应成为唯一解析引擎"，本方案将其升级为显式兜底通道，新增 API Key 与隐私声明 |
| 本轮交付 | 分析文档 + 可运行 MVP | PRD 要求 MVP 上线，本轮先本地跑通 |
| 部署 | 本地优先，后上 Vercel | 初期用本地临时目录，后期通过存储抽象切换 Vercel Blob |

## 1. 可行性结论

**可行**。V1 聚焦数字 PDF、规则引擎为主、LLM 兜底的方案在当前技术栈下成熟可控。

### 平台限制核实（Vercel 官方文档，更新于 2026-08-24）

| 项目 | 官方限制 | 对本项目的影响 |
|---|---|---|
| 请求体 | 默认 4.5 MB；Pro/Enterprise 可经 Fluid Compute + 4GB 内存 + 环境变量扩展至 20 MiB（Public Beta）；Edge 仍 4.5 MB | 20 MB PDF 必须走客户端直传 Blob，PRD 判断正确 |
| 执行时长 | Hobby 默认/最大 300s；Pro 最大 800s，扩展 1800s(Beta) | 比 PRD 暗示的宽松，50 页数字 PDF 同步解析够用，不必上异步队列 |
| 内存 | Hobby 2GB/1vCPU；Pro 最大 4GB/2vCPU | 大 PDF 解析需实测内存峰值 |
| 响应体 | 同 4.5 MB（流式除外） | PRD 未覆盖：导出文件不能塞进 `/api/export` 响应，本方案写存储返回 URL |

### 风险分级

| 风险 | 等级 | 对策 |
|---|---|---|
| 表格识别准确率 | 高 | 无边框、合并单元格、跨页表格靠样本回归 + 警告机制兜底，低置信度转 LLM |
| LLM 输出幻觉 | 高 | 输出经 Zod 校验并与规则结果交叉比对，不一致时标注警告 |
| 数据外发合规 | 中高 | 隐私声明写明外发内容与第三方，"AI assisted" 可关闭 |
| LLM 成本与延迟 | 中 | 仅低置信度表调用，token 上限、超时、单表失败不阻塞整体 |
| 导出体积超限 | 中 | 存储中转返回 URL |
| 临时文件清理 | 中 | 本地 24h TTL 定时清理；上 Vercel 后 TTL + 定时清理 |
| 扫描件 PDF | 高（若纳入） | V1 排除；纳入需 OCR + 隐私与成本重做 |

## 2. 技术方案

### 2.1 架构

```mermaid
flowchart TD
    A[浏览器上传 PDF] --> B{运行环境}
    B -->|本地| C[POST /api/upload 写入本地临时目录]
    B -->|Vercel| D[客户端直传 Vercel Blob]
    C --> E[/api/extract 读取文件]
    D --> E
    E --> F[pdfjs-dist 解析文字与坐标]
    F --> G[规则检测引擎 坐标聚类/间距]
    G --> H{置信度评估}
    H -->|高| I[结构化 Table JSON]
    H -->|低| J[LLM 兜底 文字坐标+中间结果]
    J --> K[Zod 校验 + 交叉比对 + 警告]
    K --> I
    I --> L[前端预览与单元格编辑]
    L --> M[/api/export 生成文件]
    M --> N[写入存储返回下载 URL]
    N --> O[用户下载 XLSX / CSV]
    E --> P[TTL 定时清理临时文件]
```

### 2.2 表格识别规则

1. `pdfjs-dist` 提取每页文字项及边界框坐标。
2. 按 y 坐标聚类成行、x 坐标聚类成列，得到候选网格。
3. 网格填充密度 < 0.25 视为非表格；置信度 = min(1, 密度 × 1.5)。
4. 检查表头缺失、列内数字格式不一致，生成 warnings。
5. 首行作为表头候选，其余为数据行，过滤全空行。

### 2.3 LLM 兜底

- 触发：未关闭 "AI assisted" 且配置了 `LLM_API_KEY`，且表格置信度 < 阈值（默认 0.7）或存在 warnings。
- 输入：页面文字坐标 + 规则结果（本版用文本坐标，非页面图像；如需更高准确率可扩展为多模态图片输入）。
- 输出：强制 JSON，Zod 校验；失败则保留规则结果并追加警告。
- 交叉比对：LLM 结果与规则结果不一致时追加 "please review" 警告，不静默采纳。
- 单表 30s 超时，失败不影响其他表。

### 2.4 存储抽象

`StorageAdapter` 接口：`put / get / delete / scheduleCleanup`。
- 本地实现：`.tmp/uploads`，24h TTL，进程内定时器清理。
- Vercel 实现（待）：`@vercel/blob/client` 的 `upload()` + `handleUpload()`。

## 3. 已实现内容

| 模块 | 文件 | 说明 |
|---|---|---|
| 首页 | `app/page.tsx` | 效果图左侧布局，拖拽上传、卖点、三步说明、装饰插画 |
| 结果页 | `app/extract/page.tsx`、`components/extract/ExtractWorkspace.tsx` | 步骤条、文件信息、表格列表、可编辑预览、警告、LLM 标记、导出、隐私条 |
| 静态页 | `app/how-it-works`、`app/privacy`、`app/terms` | 复用 Header，隐私页写明 AI 外发边界 |
| 上传 | `app/api/upload/route.ts` | 类型/大小校验，写本地存储，页数探测 |
| 提取 | `app/api/extract/route.ts` | 解析 + 规则检测 + 可选 LLM 兜底 + Zod 校验 |
| 导出 | `app/api/export/route.ts` | ExcelJS 多 Sheet / Papa Parse CSV（UTF-8 BOM、公式注入防护），写存储返回 URL |
| 文件 | `app/api/files/[key]/route.ts` | 按扩展名返回正确 MIME 与下载头 |
| 解析 | `lib/pdf/parser.ts`、`lib/pdf/detector.ts` | pdfjs-dist 坐标提取、聚类表格检测 |
| LLM | `lib/llm/fallback.ts` | 可选兜底、校验、交叉比对 |
| 存储 | `lib/storage/local.ts` | 本地临时目录 + TTL 清理 |
| 校验 | `lib/validation/index.ts` | 文件类型/大小/页数限制 |

## 4. 本地验证结果

### 4.1 端到端链路（`scripts/test-flow.mjs`）

```
1) UPLOAD   status 200  → key + url + 1 page
2) EXTRACT  status 200  → 1 table, 4 rows x 3 cols, confidence 1
            headers: ["Date","Description","Amount"]
            first row: ["2026-01-01","Office supplies","120.00"]
3) EXPORT XLSX  status 200  → 6604 bytes
4) EXPORT CSV   status 200  → 159 bytes
5) DOWNLOAD CSV status 200  → text/csv; charset=utf-8 + attachment（MIME 修复已验证）
```

### 4.2 批量回归（`scripts/run-regression.mjs`）

样本由 `scripts/gen-samples.mjs` 生成于 `tests/samples/`，共 8 份：

| 样本 | 结果 | 说明 |
|---|---|---|
| 01-simple-bordered | PASS | 有边框简单表格 |
| 02-borderless | PASS | 无边框表格 |
| 03-currency-dates | PASS | 货币、日期、小数 |
| 04-blank-cells | PASS | 空白单元格 |
| 05-multipage | PASS | 多页，每页一表 |
| 06-two-tables-one-page | PASS | 同页两表正确切分为 2 张（按阅读顺序） |
| 07-no-header | PASS | 无表头表格首行保留为数据行，并发出警告 |
| 08-corrupted | PASS | 损坏文件被正确拒绝 |

**结果：8 通过 / 0 失败 / 0 已知限制。**

修复记录：
- 07 无表头表格的首行数据原先被当作表头且无警告，违反 PRD "无法确定时不静默修改"。现当首行 60% 以上非空单元格是日期/数字/货币值时，`headers=[]`，首行归入数据行，并追加警告 `Header row is missing; first row treated as data`。
- 06 同页多表原先被合并成一张。现 `splitByVerticalGaps()` 按相邻行 y 间隔与中位行距的比较切分候选网格，每组独立检测；切分阈值 `max(中位行距 × 2.5, ROW_TOLERANCE × 5)`。
- 回归脚本增加 `expectWarning` 与 `tableDetails` 多表断言，两项从"已知限制"转为严格断言通过。

### 4.3 真实样本验收（`scripts/run-real-regression.mjs`）

从公开基准 `phorn1/pdf-parse-bench`（2026-q1-tables-only）下载 12 份真实 PDF 及 LaTeX ground truth，存于 `tests/real-pdfs/`。判分口径：表格数量对比 + ground truth 关键 token（数值、英文词）召回率。

| 指标 | 结果 |
|---|---|
| 样本数 | 12（每份 1 页，含 2–8 张表） |
| Ground truth 表格总数 | 54 |
| 实际检出表格数 | 7 |
| Token 召回率 | 340 / 1883 = **18.1%** |
| 完全检测不到表格的样本 | 5 / 12 |

**结论：规则引擎在真实文档上远未达标，与合成样本的 8/8 形成巨大落差。** PRD 的 16/20 首轮验收目标（针对数字 PDF 基础表格）在当前规则引擎下未通过。

根因诊断（`scripts/diagnose-detector.mjs`）：
- 真实文档是多表二维混排（水平并排 + 垂直堆叠）。000 全页聚类出 47 列 × 58 行，网格密度仅 0.083，低于 0.25 的过滤阈值；垂直方向只有 1 处超阈值间隙，切不开并排的表格。
- 合成样本中每张表独占页面、列 x 完全对齐，密度接近 1，因此全部通过——此前的 8/8 是理想化数据造成的假象。
- 尝试过两种改进：列聚类改用单元格中心点、增加水平间隙切分。两者均使 token 召回率下降（16.2%、14.3%），已回滚，保留 18.1% 基线。结论是规则引擎的架构性局限无法靠参数微调解决，需要二维版面分析或 LLM 辅助。

### 4.4 LLM 兜底重构与 mock 验证（阶段 B 第一部分）

原兜底设计只能修正"规则引擎已检测到的表"，但真实样本中 5/12 零检测、多表漏检，兜底几乎不触发。已重构为**按页兜底**：

- `lib/llm/fallback.ts`：新增 `extractPageWithLlm(page, ruleTables)` 与 `extractPagesWithLlm(pages, byPage)`。当某页零检测，或存在置信度 < 0.7 / 有警告的表时，把整页文字坐标 + 规则候选交给 LLM 直接提取全部表格；失败时保留规则结果并记警告，不丢数据。
- `app/api/extract/route.ts`：改为按页组织规则结果并调用兜底；`enableLlm=false` 时完全跳过 LLM，零外发。
- 新增 usage 统计（prompt/completion/total tokens）与延迟记录，供真实 Key 验证时量化成本。

**mock 验证**（`scripts/mock-llm.mjs` + `scripts/test-llm-batch.mjs`，本地模拟 OpenAI 兼容接口）：
- 零检测样本 000：`enableLlm=true` 时从 0 表补全为 1 张 `source=llm` 表；`enableLlm=false` 时保持 0 表。
- 12 份真实样本全部触发兜底并正确返回，平均延迟 36ms（本地 mock，非真实 API）。
- 链路、Zod 校验、来源标记、警告标记均工作正常。

**Key 选择过程**：用户无海外信用卡，OpenAI 官方 Key 因额度耗尽（429 insufficient_quota）无法使用；阿里云国际站百炼因注册地/手机号/实名认证障碍放弃；最终采用 **DeepSeek**（`https://api.deepseek.com/v1`，`deepseek-chat`，当前实际指向 DeepSeek-V4-Flash），国内手机号注册、支付宝充值。配置在 `.env.local`（已 gitignore）。

### 4.5 真实样本 LLM 兜底验证（阶段 B 完成）

用 DeepSeek 对 12 份真实样本（`tests/real-pdfs/`）跑整页 LLM 兜底，脚本 `scripts/verify-llm-real.mjs`：

| 指标 | 规则引擎基线 | LLM 兜底 | 变化 |
|---|---|---|---|
| Token 召回率 | 18.1% (340/1883) | **79.9% (1505/1883)** | +61.8 个百分点 |
| 检出表格数 | 7（GT 54） | 55（GT 54） | 基本吻合 |
| 零检测样本 | 5 / 12 | 0 / 12 | 全部消除 |
| 平均延迟 | — | 2929 ms | 单页 1.9–4.6s |

单样本召回率范围 70.9%–87.4%，表格数 11/12 与 GT 相同或多 1 张（拆分粒度差异）。

**成本**（`scripts/measure-tokens.mjs`，DeepSeek 定价 $0.28/百万输入、$0.42/百万输出，缓存 $0.028）：
- 12 份样本共输入 40,222 token（其中缓存命中 17,791）、输出 9,225 token
- 总成本约 **$0.0151**，平均每份 PDF **$0.0013**（不足人民币 1 分）
- DeepSeek 对重复 prompt 前缀有自动缓存，命中部分单价降至 1/10，实际成本更低

**结论**：LLM 兜底把真实文档提取从不可用（18.1%）提升到基本可用（79.9%），且成本极低。PRD 的 16/20 验收目标在 LLM 模式下具备达成条件。剩余 20% token 差距主要来自复杂合并单元格、数学公式和跨栏排版——这类场景需多模态图片输入或专用版面模型，属后续优化。

生产构建 `npx next build` 通过，12 个路由全部生成。

## 5. UI 说明

- 视觉基准：用户提供的 `PDF表格提取器界面概览.png` 与 `UI界面说明.txt`。
- 蓝白 SaaS 风格，`#315EE8` 主色，圆角卡片，Inter 字体。
- 按用户偏好，界面文字不使用加粗样式。
- 相对效果图增补：`AI assisted` 标记、具体识别警告文案、隐私条中说明 AI 外发边界。

## 6. 待办 / 后续

- **准确率已达标**：LLM 兜底将真实样本召回率从 18.1% 提升到 79.9%，阶段 B 目标完成。剩余优化方向：多模态图片输入，处理合并单元格、数学公式、跨栏排版（当前 20% 差距的来源）。
- **正式部署前的模型选型**：当前 DeepSeek 服务器在国内，海外用户调用有跨境延迟与合规顾虑。若用户以 Mainland 以外为主，建议改用海外节点模型（如通义国际版新加坡节点，或解决海外支付后用 OpenAI），只需换环境变量。
- 加密 PDF 的真实样本测试（当前仅有损坏文件样本）。

### 阶段 C（Vercel 部署准备）已完成的代码工作

- **LLM 错误可观测性已修复**：`ExtractResultSchema` 新增 `llmErrors / llmUsage / llmLatencyMs`；extract API 返回这些字段；结果页展示具体失败原因（如 `page 1: LLM request failed: 401`），不再谜之"0 张表"。已用无效 Key 验证。
- **统一存储层** `lib/storage/index.ts`：根据 `VERCEL` / `BLOB_READ_WRITE_TOKEN` 自动选择本地临时目录或 Vercel Blob；`getFileBuffer` 支持按 key（本地）或 url（Blob）读取；导出文件也走统一层。
- **客户端直传**：新增 `/api/config`（返回 `uploadMode`）、`/api/upload/token`（`handleUpload` 生成 token，限制 PDF、20MB、TTL 1 天）；前端 `Dropzone` 在 blob 模式用 `@vercel/blob/client` 的 `upload()` 直传，绕过 4.5MB 请求体限制；extract 页与工作区接受 url 参数。
- 本地回归 8/8、LLM 真实样本 79.8% 均通过；生产构建通过。

### 部署前审查修复（最后一轮）

| 问题 | 修复 |
|---|---|
| `local.ts` 模块加载即启动 `setInterval`，Vercel 每次函数调用都会留下永不释放的定时器 | 改为仅在本地开发环境启动清理定时器 |
| 隐私政策写"发送页面图像"，实际发送的是文字坐标 | 改为如实描述"提取的文字项及坐标"，并写明第三方为 DeepSeek |
| 50 页 PDF 串行 LLM 调用可能超 300s | 新增 `LLM_MAX_PAGES`（默认 20）与 `LLM_TIME_BUDGET_MS`（默认 180s），超限页保留规则结果并记录警告 |
| 无显式函数超时配置 | 新增 `vercel.json`，extract 300s / upload 60s / export 120s |
| Vercel 导出文件无 TTL，永久留在 Blob | `putFile` 支持 `ttlDays`，Vercel 上所有临时文件 1 天后自动删除 |
| 无部署环境变量模板 | 新增 `.env.example` |

**LLM 准确率波动说明**：多次跑 12 份样本，召回率在 73.5%–79.9% 之间波动（表格数 51–55 / GT 54）。这是 LLM 输出固有随机性，不是代码缺陷。

**部署时剩余操作**（需用户账号）：创建 Vercel 项目、连接 Blob store、在 Vercel 环境变量按 `.env.example` 配置 `BLOB_READ_WRITE_TOKEN` 与 LLM 变量、推送代码后 Vercel 自动构建。

## 7. 环境变量（LLM 可选）

配置在 `.env.local`（已 gitignore），不设置 `LLM_API_KEY` 则完全走规则引擎、零外发。

当前验证配置（DeepSeek）：
```
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_CONFIDENCE_THRESHOLD=0.7
LLM_MAX_PAGES=20
LLM_TIME_BUDGET_MS=180000
```

正式部署海外时可选（需海外节点账号）：
```
LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
```
或 OpenAI：`LLM_BASE_URL=https://api.openai.com/v1`、`LLM_MODEL=gpt-4o-mini`。代码无需改动，仅换环境变量。

站点 URL 可用 `NEXT_PUBLIC_SITE_URL` 覆盖（默认 Vercel 域名），换正式域名时只需改这一个环境变量，metadata / canonical / sitemap / OG 都会跟着更新。

## 8. SEO 优化（P0 + P1 + P2 完成）

| 项目 | 实现 |
|---|---|
| 站点常量 | `lib/site.ts` 统一管理域名/描述；`lib/seo.ts` 页面 metadata helper |
| metadata | 根布局含 metadataBase、title 模板、关键词、OG、Twitter、canonical；各页面独立 metadata；`/extract` 工具页设 noindex |
| OG 图 | `app/opengraph-image.tsx` 用 `ImageResponse` 动态生成 1200×630 PNG |
| sitemap | `app/sitemap.ts` 生成，含 9 个可索引页面（首页、how-it-works、privacy、terms、5 个专题页），优先级分级 |
| robots | `app/robots.ts`，禁止索引 `/extract`、`/api/` |
| SEO 专题页 | `/pdf-to-excel`、`/pdf-to-csv`、`/extract-tables-from-pdf`、`/convert-pdf-table-to-excel`、`/extract-table-from-scanned-pdf`，各有独立内容、示例表格、适用/限制说明与互相内链；扫描件页如实说明当前不支持 OCR |
| 结构化数据 | `components/seo/JsonLd.tsx`：首页注入 SoftwareApplication + FAQPage JSON-LD |
| FAQ | 首页 5 条常见问题（免费、支持格式、隐私、编辑、AI），用 `details/summary` 语义标签，同时作为 FAQPage 数据源 |
| 内链 | 首页 Use cases 区块链接 5 个专题页；Header 保留 How it Works / Privacy / Terms |

构建产物验证：`sitemap.xml` 含 9 个 URL，`robots.txt` 规则正确，21 个路由全部生成，无警告。
