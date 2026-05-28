# Memory Overview — 速查参考

## 短期记忆 (Checkpointer)

```python
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent

checkpointer = InMemorySaver()
agent = create_agent(model, tools=[...], checkpointer=checkpointer)

# 带 thread_id 调用
config = {"configurable": {"thread_id": "user-123"}}
agent.invoke({"messages": [...]}, config)  # 状态自动持久化
agent.invoke({"messages": [...]}, config)  # 继续同一对话
```

## 长期记忆 (Store)

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore(index={"embed": embed_fn, "dims": 1536})

# 写入
store.put(
    namespace=("user_123", "preferences"),
    key="language",
    value={"preferred": "Chinese", "formality": "casual"}
)

# 读取
item = store.get(("user_123", "preferences"), "language")

# 语义搜索
items = store.search(
    ("user_123", "preferences"),
    query="communication style",
    filter={"formality": "casual"}
)
```

## 三种记忆类型的实现

### Semantic (事实) — Profile 或 Collection

```python
# Profile 方式: 单个文档持续更新
store.put(("user",), "profile", {
    "name": "Alice",
    "role": "developer",
    "preferences": {"language": "Python"}
})

# Collection 方式: 多个文档
store.put(("user",), "fact_1", {"content": "Prefers dark mode"})
store.put(("user",), "fact_2", {"content": "Uses Python daily"})
```

### Episodic (经验) — Few-shot 示例

```python
store.put(("examples",), "sql_1", {
    "input": "Find top customers",
    "output": "SELECT * FROM orders GROUP BY customer_id ORDER BY SUM(amount) DESC LIMIT 10"
})
```

### Procedural (规则) — 系统提示词

```python
store.put(("agent_config",), "instructions", {
    "system_prompt": "You are a helpful assistant...",
    "updated_at": "2025-05-28"
})
```

## 记忆写入策略

```python
# Hot Path: 代理运行时写入
@tool
def save_memory(key: str, content: str) -> str:
    """Save information to long-term memory."""
    store.put(("user",), key, {"content": content})
    return f"Saved: {key}"

# Background: 后台任务写入
def background_memory_update(conversation_history):
    summary = model.invoke(f"Summarize key facts: {conversation_history}")
    store.put(("user",), "recent_summary", {"content": summary.content})
```

## 消息管理技术

| 技术 | 方法 | 适用 |
|------|------|------|
| 滑动窗口 | 只保留最近 N 条消息 | 简单对话 |
| 摘要 | 压缩旧消息为摘要 | 长对话 |
| 选择性保留 | 保留重要消息，删除冗余 | 复杂对话 |
| Token 限制 | 超过 token 数时触发压缩 | 成本控制 |

```python
from langchain.agents.middleware import SummarizationMiddleware

agent = create_agent(
    model, tools=[...],
    middleware=[SummarizationMiddleware(
        model="gpt-4o-mini",
        trigger=("tokens", 4000),   # 超过 4000 tokens 触发
        keep=("messages", 10)       # 保留最近 10 条
    )]
)
```
