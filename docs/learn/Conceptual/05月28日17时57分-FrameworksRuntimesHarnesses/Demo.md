# Frameworks, Runtimes, Harnesses — 速查参考

## 选型速查

```python
# 场景 1: 快速原型 → LangChain (Framework)
from langchain.agents import create_agent
agent = create_agent(model, tools=[...])

# 场景 2: 生产环境有状态工作流 → LangGraph (Runtime)
from langgraph.graph import StateGraph
workflow = StateGraph(State).add_node(...).compile()

# 场景 3: 复杂自主代理 → Deep Agents (Harness)
from deepagents import create_deep_agent
agent = create_deep_agent(model=model, tools=[...], backend=backend, subagents=[...])
```

## 三层关系

```
Deep Agents SDK (Harness)
    │ 构建在
    ▼
LangGraph (Runtime)
    │ 构建在
    ▼
LangChain (Framework)
```

## 功能对照

| 需求 | LangChain | LangGraph | Deep Agents |
|------|-----------|-----------|-------------|
| 简单工具调用 | ✅ create_agent | ✅ StateGraph | ✅ create_deep_agent |
| 有状态对话 | ✅ checkpointer | ✅ persistence | ✅ checkpointer |
| 人在回路 | ✅ HITL middleware | ✅ interrupt | ✅ interrupt_on |
| 子代理 | ✅ subagents | ✅ subgraphs | ✅ subagents |
| 文件系统 | ❌ | ❌ | ✅ FilesystemBackend |
| 规划/待办 | ❌ | ❌ | ✅ TodoList |
| 技能系统 | ✅ Skills middleware | ❌ | ✅ Skills |
| 流式输出 | ✅ streaming | ✅ streaming | ✅ streaming |
| 持久执行 | ❌ | ✅ | ✅ |
| 自定义图 | ❌ | ✅ StateGraph | ❌ (预组装) |
