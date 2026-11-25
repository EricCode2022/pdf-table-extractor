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

修复「坐标重建产生全空行 + 完全重复行」后（`a0e662d`）：
```
matched=51/54, exact row align=44/51
col=76.5%  row(±1)=88.2%  cell strict=67.2%  cell bestShift=74.0%  spanF1=23.6%
  simple   n=19  cellStrict=68.6%  cellBest=83.9%
  moderate n=19  cellStrict=67.0%  cellBest=68.3%
  complex  n=13  cellStrict=65.4%  cellBest=67.9%  spanF1=52.0%
```

**结论**：cell 严格对齐从 52.4% → 67.2%（+14.8），行完全对齐 34→44/51。这证明最初 22 个百分点的 cell 损失主要是冗余表头行导致的行错位，而非内容识别错误。

剩余瓶颈：
- spanF1 仅 23.6%（合并单元格识别仍是最大短板）
- 7 张表仍有行错位，主因是坐标重建把正文误当表头
- col 准确率 76.5%（列数识别待优化）

## 文件

- `latex-table-parser.mjs`：GT LaTeX → { cols, rows, spans }，处理 multicolumn/multirow/规则命令/上下标
- `structure-eval.mjs`：预测适配、表匹配、指标计算
- `test-parser.mjs`：解析器自测
