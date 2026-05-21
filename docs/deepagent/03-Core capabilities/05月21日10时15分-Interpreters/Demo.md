# Interpreters - Demo

## Demo 1: 基础解释器配置

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware

agent = create_deep_agent(
    model="openai:gpt-5.4",
    middleware=[CodeInterpreterMiddleware()],
)

# 代理获得 eval 工具，可运行 TypeScript 代码
# 默认：64MB 内存限制，5秒超时，跨轮次快照
```

## Demo 2: eval 工具（代理编写代码）

```javascript
// 代理在 eval 工具中运行的代码
const rows = [
  { team: "alpha", score: 8 },
  { team: "beta", score: 13 },
  { team: "alpha", score: 21 },
];

const totals = rows.reduce((acc, row) => {
  acc[row.team] = (acc[row.team] ?? 0) + row.score;
  console.log(`${row.team} score: ${acc[row.team]}`)
  return acc;
}, {});

totals;  // 返回 { alpha: 29, beta: 13 }
```

## Demo 3: 启用 PTC

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware

agent = create_deep_agent(
    model="openai:gpt-5.4",
    middleware=[CodeInterpreterMiddleware(ptc=["task"])],
)

# 现在代理可以在解释器代码中调用 task 工具
```

## Demo 4: PTC 批处理

```javascript
// 代理编写的代码：并行调用多个 subagent
const topics = ["retrieval", "memory", "evaluation"];

const reports = await Promise.all(
  topics.map((topic) =>
    tools.task({
      description: `Research ${topic} in Deep Agents and return three concise findings.`,
      subagent_type: "general-purpose",
    }),
  ),
);

reports.join("\n\n");
```

## Demo 5: PTC 错误处理

```javascript
// 代理编写的代码：本地处理失败
try {
  const report = await tools.task({
    description: "Check the migration notes and return breaking changes.",
    subagent_type: "general-purpose",
  });
  console.log(report);
} catch (error) {
  console.log(`Subagent failed: ${error.message}`);
}
```

## Demo 6: 递归语言模型模式

```javascript
// 代理编写的代码：分解大任务
const candidates = notes
  .filter((note) => note.includes("migration"))
  .slice(0, 5);

const riskReports = await Promise.all(
  candidates.map((note) =>
    tools.task({
      description: `Analyze this migration note for release risk:\n\n${note}`,
      subagent_type: "general-purpose",
    }),
  ),
);

const releaseSummary = riskReports
  .map((report, index) => `## Candidate ${index + 1}\n${report}`)
  .join("\n\n");

releaseSummary;
```

## Demo 7: Interpreter Skills

````md
---
name: order-helpers
description: Helper functions for normalizing and grouping order records.
module: index.ts
---

# order-helpers

Import these utilities into the REPL:

```typescript
const { groupByStatus } = await import("@/skills/order-helpers");
groupByStatus(...);
```
````

```typescript
// skills/order-helpers/index.ts
interface Order {
  id: string;
  status: string;
}

export function groupByStatus(orders: Order[]) {
  return orders.reduce((acc, order) => {
    acc[order.status] = acc[order.status] ?? [];
    acc[order.status].push(order);
    return acc;
  }, {});
}
```

```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain_quickjs import CodeInterpreterMiddleware

backend = StateBackend()

agent = create_deep_agent(
    model="openai:gpt-5.4",
    backend=backend,
    skills=["/skills/"],
    middleware=[CodeInterpreterMiddleware(skills_backend=backend)],
)
```

## Demo 8: 跨轮次快照

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware

agent = create_deep_agent(
    model="openai:gpt-5.4",
    middleware=[
        CodeInterpreterMiddleware(
            snapshot_between_turns=True,  # 默认
        )
    ],
)

# 轮次 1：代理运行代码设置变量
# eval: const data = [1, 2, 3, 4, 5];

# 轮次 2：代理可以访问之前的变量
# eval: data.map(x => x * 2);  // [2, 4, 6, 8, 10]
```

## Demo 9: 禁用快照

```python
agent = create_deep_agent(
    model="openai:gpt-5.4",
    middleware=[
        CodeInterpreterMiddleware(
            snapshot_between_turns=False,  # 不跨轮次持久化
        )
    ],
)
```

## Demo 10: 自定义 Middleware 选项

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware

agent = create_deep_agent(
    model="openai:gpt-5.4",
    middleware=[
        CodeInterpreterMiddleware(
            memory_limit=128 * 1024 * 1024,  # 128 MB
            timeout=10.0,                     # 10 秒超时
            max_ptc_calls=512,                # 最大 512 次 PTC 调用
            tool_name="run_code",             # 工具名改为 run_code
            max_result_chars=8000,            # 最大 8000 字符结果
            capture_console=True,             # 捕获 console 输出
            ptc=["task", "web_search"],       # PTC 允许列表
            snapshot_between_turns=True,      # 跨轮次快照
        )
    ],
)
```

## Demo 11: 完整解释器应用

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

agent = create_deep_agent(
    model="openai:gpt-5.4",
    checkpointer=checkpointer,
    middleware=[
        CodeInterpreterMiddleware(
            ptc=["task"],
            snapshot_between_turns=True,
            timeout=10.0,
        )
    ],
    system_prompt="""You are a research coordinator with code execution capabilities.

When handling complex research tasks:
1. Use the eval tool to write code that orchestrates multiple subagents
2. Use Promise.all for parallel research on different topics
3. Combine results in code before returning to the user
4. Store intermediate results in variables for later use

Example workflow:
- Break down complex questions into sub-questions
- Call task() for each sub-question in parallel
- Combine and synthesize results in code
- Return a concise final answer""",
)

# 代理可以：
# 1. 编写代码分解复杂任务
# 2. 并行调用多个 subagent
# 3. 在代码中组合结果
# 4. 跨轮次保持状态
```
