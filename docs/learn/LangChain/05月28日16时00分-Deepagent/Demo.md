# Deep Agent from Scratch — 实操 Demo

## 项目结构

```
from-scratch-agent/
├── agent.py              # 主脚本 — 渐进式构建
├── skills/
│   └── pandas-patterns/
│       └── SKILL.md      # 数据分析技能
├── data/
│   └── sales.csv         # 示例数据
├── requirements.txt
└── output/
```

---

## Step 1: 环境准备

### requirements.txt

```txt
deepagents>=0.3.5,<0.4.0
langsmith
langchain-core
langchain-anthropic
langgraph
pandas
matplotlib
seaborn
```

### 环境变量

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."
```

---

## Step 2: 示例数据

### data/sales.csv

```csv
Date,Product,Category,Units,UnitPrice,Revenue,Region
2025-01-01,Widget A,Electronics,15,25.00,375.00,North
2025-01-02,Widget B,Electronics,8,30.00,240.00,South
2025-01-03,Widget A,Electronics,12,25.00,300.00,East
2025-01-04,Gadget C,Accessories,20,15.00,300.00,West
2025-01-05,Widget B,Electronics,6,30.00,180.00,North
2025-01-06,Widget A,Electronics,18,25.00,450.00,South
2025-01-07,Gadget C,Accessories,25,15.00,375.00,East
2025-01-08,Widget D,Premium,3,80.00,240.00,West
2025-01-09,Widget A,Electronics,10,25.00,250.00,North
2025-01-10,Widget B,Electronics,14,30.00,420.00,South
```

---

## Step 3: 技能文件

### skills/pandas-patterns/SKILL.md

```markdown
---
name: pandas-patterns
description: Common pandas and matplotlib patterns for data analysis and visualization
---

## Data Loading
- Use `pd.read_csv()` for CSV files
- Always check `df.info()` and `df.describe()` first
- Use `df.head()` to inspect the first few rows

## Common Analysis Patterns

### Group and Aggregate
```python
df.groupby('Category')['Revenue'].agg(['sum', 'mean', 'count'])
```

### Time Series
```python
df['Date'] = pd.to_datetime(df['Date'])
df.set_index('Date').resample('W')['Revenue'].sum()
```

### Pivot Tables
```python
pd.pivot_table(df, values='Revenue', index='Region', columns='Product', aggfunc='sum')
```

## Visualization
- Use `matplotlib` for bar charts, line charts
- Use `seaborn` for statistical plots (heatmap, boxplot)
- Save figures with `plt.savefig("output.png", dpi=150, bbox_inches="tight")`
- Use `plt.tight_layout()` before saving

## Reporting
Write a markdown summary to `report.md` alongside any generated charts.
Include key findings, statistics, and recommendations.
```

---

## Step 4: 主脚本（渐进式 5 步）

### agent.py

```python
"""Deep Agent from Scratch — 渐进式构建数据分析代理

本脚本演示如何用 create_agent + middleware 手动组装 Deep Agent，
而非使用 create_deep_agent 一体化函数。

5 步渐进式构建：
1. 最小代理（只有模型）
2. 添加沙箱后端
3. 添加上下文管理
4. 添加技能
5. 添加子代理
"""

import io
import csv
import sys
from pathlib import Path

from langchain.agents import create_agent

# ============================================================
# Step 1: 最小代理
# ============================================================
def step1_minimal_agent():
    """只有模型，没有任何工具。"""
    agent = create_agent("anthropic:claude-sonnet-4-6", tools=[])
    result = agent.invoke({
        "messages": [{"role": "user", "content": "What is 2+2?"}]
    })
    return result


# ============================================================
# Step 2: 添加沙箱后端 + FilesystemMiddleware
# ============================================================
def step2_with_sandbox():
    """添加沙箱后端，代理现在可以读写文件和执行代码。"""
    from langsmith.sandbox import SandboxClient
    from deepagents.backends.langsmith import LangSmithSandbox
    from deepagents.middleware import FilesystemMiddleware

    # 创建沙箱
    client = SandboxClient()
    sandbox = client.create_sandbox(template_name="deepagents-deploy")
    backend = LangSmithSandbox(sandbox=sandbox)

    # 上传示例数据
    data_path = Path(__file__).parent / "data" / "sales.csv"
    if data_path.exists():
        backend.upload("sales.csv", data_path.read_bytes())
    else:
        # 内联创建示例数据
        rows = [
            ["Date", "Product", "Category", "Units", "Revenue"],
            ["2025-01-01", "Widget A", "Electronics", 15, 375],
            ["2025-01-02", "Widget B", "Electronics", 8, 240],
            ["2025-01-03", "Widget A", "Electronics", 12, 300],
            ["2025-01-04", "Gadget C", "Accessories", 20, 300],
            ["2025-01-05", "Widget B", "Electronics", 6, 180],
        ]
        buf = io.StringIO()
        csv.writer(buf).writerows(rows)
        backend.upload("sales.csv", buf.getvalue().encode())

    # 创建代理
    agent = create_agent(
        "anthropic:claude-sonnet-4-6",
        tools=[],
        middleware=[FilesystemMiddleware(backend=backend)],
    )

    result = agent.invoke({
        "messages": [{"role": "user", "content": "Read sales.csv and summarize the data."}]
    })
    return result, backend


# ============================================================
# Step 3: 添加上下文管理
# ============================================================
def step3_with_summarization(backend):
    """添加 SummarizationMiddleware，支持长对话。"""
    from deepagents.middleware import FilesystemMiddleware, SummarizationMiddleware

    model = "anthropic:claude-sonnet-4-6"

    agent = create_agent(
        model=model,
        tools=[],
        middleware=[
            FilesystemMiddleware(backend=backend),
            SummarizationMiddleware(model=model, backend=backend),
        ],
    )

    # 多轮对话测试
    messages = [
        {"role": "user", "content": "Read sales.csv and list all unique products."},
        {"role": "user", "content": "Now calculate total revenue per product."},
        {"role": "user", "content": "Which product has the highest average revenue per unit?"},
    ]

    for msg in messages:
        result = agent.invoke({"messages": [msg]})
        print(f"\nQ: {msg['content']}")
        for r in result.get("messages", []):
            if hasattr(r, "content") and r.content:
                print(f"A: {r.content[:200]}")

    return agent


# ============================================================
# Step 4: 添加技能
# ============================================================
def step4_with_skills(backend):
    """添加 SkillsMiddleware，按需加载领域知识。"""
    from deepagents.middleware import (
        FilesystemMiddleware,
        SkillsMiddleware,
        SummarizationMiddleware,
    )

    model = "anthropic:claude-sonnet-4-6"
    skills_path = str(Path(__file__).parent / "skills")

    agent = create_agent(
        model=model,
        tools=[],
        middleware=[
            FilesystemMiddleware(backend=backend),
            SummarizationMiddleware(model=model, backend=backend),
            SkillsMiddleware(backend=backend, sources=[skills_path]),
        ],
    )

    result = agent.invoke({
        "messages": [{
            "role": "user",
            "content": (
                "Analyze sales.csv. Create a pivot table of revenue by region and product. "
                "Generate a visualization and save it as output.png. "
                "Write a summary report to report.md."
            )
        }]
    })
    return result


# ============================================================
# Step 5: 添加子代理（完整配置）
# ============================================================
def step5_full_agent(backend):
    """完整配置：所有 middleware + 可视化子代理。"""
    from deepagents import SubAgent
    from deepagents.middleware import (
        FilesystemMiddleware,
        SkillsMiddleware,
        SubAgentMiddleware,
        SummarizationMiddleware,
    )
    from langchain.agents.middleware import TodoListMiddleware

    model = "anthropic:claude-sonnet-4-6"
    skills_path = str(Path(__file__).parent / "skills")

    # 定义可视化子代理
    visualizer: SubAgent = {
        "name": "visualizer",
        "description": "Generates charts and visualizations from data files in the sandbox.",
        "system_prompt": (
            "You are a data visualization specialist. "
            "Write Python scripts using matplotlib and seaborn. "
            "Save all figures as PNG files in the output/ directory. "
            "Use clean, professional styling with clear labels and titles."
        ),
        "tools": [],
    }

    # 创建代理
    agent = create_agent(
        model=model,
        tools=[],
        middleware=[
            FilesystemMiddleware(backend=backend),
            SummarizationMiddleware(model=model, backend=backend),
            SkillsMiddleware(backend=backend, sources=[skills_path]),
            TodoListMiddleware(),
            SubAgentMiddleware(backend=backend, subagents=[visualizer]),
        ],
    )

    result = agent.invoke({
        "messages": [{
            "role": "user",
            "content": (
                "Analyze sales.csv comprehensively:\n"
                "1. Load and inspect the data\n"
                "2. Calculate summary statistics\n"
                "3. Delegate chart generation to the visualizer subagent\n"
                "4. Write a final report to report.md with findings and recommendations"
            )
        }]
    })
    return result


# ============================================================
# 主入口
# ============================================================
def main():
    """根据命令行参数选择执行哪一步。"""
    step = sys.argv[1] if len(sys.argv) > 1 else "5"

    if step == "1":
        print("=== Step 1: Minimal Agent ===")
        result = step1_minimal_agent()
        print(result)

    elif step == "2":
        print("=== Step 2: With Sandbox ===")
        result, backend = step2_with_sandbox()
        for msg in result.get("messages", []):
            if hasattr(msg, "content") and msg.content:
                print(msg.content[:500])

    elif step == "3":
        print("=== Step 3: With Summarization ===")
        _, backend = step2_with_sandbox()
        step3_with_summarization(backend)

    elif step == "4":
        print("=== Step 4: With Skills ===")
        _, backend = step2_with_sandbox()
        result = step4_with_skills(backend)
        for msg in result.get("messages", []):
            if hasattr(msg, "content") and msg.content:
                print(msg.content[:500])

    elif step == "5":
        print("=== Step 5: Full Agent ===")
        _, backend = step2_with_sandbox()
        result = step5_full_agent(backend)
        for msg in result.get("messages", []):
            if hasattr(msg, "content") and msg.content:
                print(msg.content[:500])

    else:
        print(f"Unknown step: {step}. Use 1-5.")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## Step 5: 运行

```bash
# 逐步运行，观察每步添加了什么
python agent.py 1   # 最小代理 — 只能聊天
python agent.py 2   # 添加沙箱 — 可以读写文件、执行代码
python agent.py 3   # 添加摘要 — 支持长对话
python agent.py 4   # 添加技能 — 知道 pandas 最佳实践
python agent.py 5   # 完整代理 — 子代理并行可视化
```

---

## 进阶：不用沙箱的本地版本

如果无法使用 LangSmith Sandbox，可以用 LocalShellBackend：

```python
from deepagents.backends import LocalShellBackend
from deepagents.middleware import FilesystemMiddleware

backend = LocalShellBackend(root_dir=str(Path(__file__).parent))

agent = create_agent(
    "anthropic:claude-sonnet-4-6",
    tools=[],
    middleware=[FilesystemMiddleware(backend=backend)],
)
```

注意：LocalShell 没有隔离，仅用于开发测试。

---

## Middleware 速查表

| Middleware | 添加的工具/能力 | 何时使用 |
|-----------|----------------|---------|
| `FilesystemMiddleware` | read_file, write_file, edit_file, glob, grep, execute | 需要文件操作 |
| `SummarizationMiddleware` | 自动上下文压缩 | 长对话 |
| `SkillsMiddleware` | 按需加载技能 | 有领域知识文件 |
| `TodoListMiddleware` | write_todos, read_todos | 多步骤任务 |
| `SubAgentMiddleware` | task() 委派工具 | 需要子代理 |

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `SandboxClient` 导入失败 | 未安装 langsmith | `pip install langsmith` |
| 沙箱创建超时 | LangSmith 服务不可用 | 检查 API Key，或用 LocalShell 替代 |
| 技能未加载 | skills 路径错误 | 确保 `sources=["./skills/"]` 指向正确目录 |
| 子代理不执行 | tools 列表为空 | 子代理的 tools=[] 表示使用沙箱内置工具 |
| 上下文溢出 | SummarizationMiddleware 未生效 | 确保放在 middleware 列表中 |
