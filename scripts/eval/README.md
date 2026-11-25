# 结构级评测体系

商业化的前提是可量化。本目录把 GT LaTeX 表格与 API 提取结果规范化成同一套「逻辑网格 + 合并矩阵」，从而能测量「内容对但结构错」。

## 用法

```bash
# 启动服务
npm run dev -- -p 3000

# 跑结构评测
node scripts/eval/structure-eval.mjs
```

## 指标

- **col%**：列数完全一致的匹配表占比
- **row(±1)%**：行数相差不超过 1 的占比
- **cellStrict**：逐位置对齐的单元格内容准确率
- **cellBest**：允许 ±3 行偏移后的最佳内容准确率。与 strict 的差距 = 行错位造成的损失（主要是表头行数不一致）
- **spanF1**：合并单元格（colSpan/rowSpan）的 F1，按 (行, 列, 跨度) 精确匹配
- **exact row align**：无需行偏移即可对齐的表数

按 simple / moderate / complex 分组输出。表匹配用 token 重叠贪心一对一，避免表数不一致时错位。

## 基线演进（2026-11-25）

初始基线（搭好评测时）：
```
matched=51/54, exact row align=34/51
col=76.5%  row(±1)=78.4%  cell strict=52.4%  cell bestShift=74.5%  spanF1=19.8%
```

修复「全空行 + 完全重复行 + 正文误当表头」后，并把评测的 span 推断与 UI 对齐（`e867b38`）：
```
matched=51/54, exact row align=45/51
col=76.5%  row(±1)=88.2%  cell strict=70.2%  cell bestShift=74.6%  spanF1=20.5%
  simple   n=19  cellStrict=79.0%  cellBest=84.0%
  moderate n=19  cellStrict=64.6%  cellBest=67.7%
  complex  n=13  cellStrict=65.4%  cellBest=71.0%  spanF1=38.8%
```

**结论**：cell 严格对齐从 52.4% → 70.2%（+17.8），行完全对齐 34→45/51。最初的 cell 损失主要是冗余/错误表头行导致的行错位，不是内容识别错误。

剩余瓶颈（需要架构级改动，非补丁可解）：
- spanF1 20.5%：根因是①很多表 headerRows 被 LLM 压平成1行，坐标重建又因 anchor 匹配失败没触发；②数据模型 `rows[][]` 不表达数据区 colSpan（如跨4列的统计行），UI 也不渲染
- 5 张表仍行错位，且 best 也低（15-60%），属于内容识别问题
- col 准确率 76.5%

## 产品化闭环（商业化路径）

既然结构准确率有上限，商业版本用「低置信度标记 + 人工复核」兜底（`d46eb83`）：

- `lib/review/confidence.ts`：基于结构信号（结构修复 warning 数、空表头比例、行列数不匹配、正文表头）算 review priority，不用 LLM 自报的 confidence（默认 0.8 不可靠）
- 结果页表列表按优先级排序，低置信度表红色标记 "Needs review"，中等 "Check"
- 预览区显示复核原因；「Mark Reviewed」按钮或编辑保存后标记已复核
- 「Review Set」按钮导出所有已复核表的 JSON（含修正后的表 + 复核元数据），可作为 few-shot 样本或新增评测样本回灌

这样把有限的准确性转化为可控的人工成本，同时积累真实修正数据用于后续优化。

## 文件

- `latex-table-parser.mjs`：GT LaTeX → { cols, rows, spans }，处理 multicolumn/multirow/规则命令/上下标
- `structure-eval.mjs`：预测适配、表匹配、指标计算
- `test-parser.mjs`：解析器自测
