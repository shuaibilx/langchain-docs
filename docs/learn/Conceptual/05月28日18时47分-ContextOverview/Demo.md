# Context Overview — 速查参考

## 三种上下文的代码模板

### 1. Static Runtime Context（不可变，单次运行）

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langchain.tools import tool, ToolRuntime
from langgraph.runtime import Runtime

# 定义上下文 schema
@dataclass
class ContextSchema:
    user_name: str
    db_connection: str
    api_key: str

# 在提示词中使用
@dynamic_prompt
def personalized_prompt(request: ModelRequest) -> str:
    name = request.runtime.context.user_name
    return f"You are a helpful assistant. Address the user as {name}."

# 在工具中使用
@tool
def query_db(sql: str, runtime: ToolRuntime[ContextSchema]) -> str:
    """Query the database."""
    conn = runtime.context.db_connection
    return execute_query(conn, sql)

# 在节点中使用
def my_node(state: State, runtime: Runtime[ContextSchema]):
    user = runtime.context.user_name
    ...

# 创建代理
agent = create_agent(
    model="gpt-4o-mini",
    tools=[query_db],
    middleware=[personalized_prompt],
    context_schema=ContextSchema,
)

# 调用时传入
agent.invoke(
    {"messages": [...]},
    context=ContextSchema(user_name="Alice", db_connection="...", api_key="..."),
)
```

### 2. Dynamic Runtime Context（可变，单次运行 = State）

```python
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import dynamic_prompt, ModelRequest

# 扩展 AgentState
class CustomState(AgentState):
    user_name: str
    step_count: int
    collected_data: list[str]

# 在提示词中读取 state
@dynamic_prompt
def state_aware_prompt(request: ModelRequest) -> str:
    name = request.state.get("user_name", "User")
    step = request.state.get("step_count", 0)
    return f"You are assisting {name}. This is step {step}."

# 在工具中读写 state
from langgraph.types import Command
from langchain.messages import ToolMessage

@tool
def collect_info(data: str, runtime: ToolRuntime) -> Command:
    """Collect information from the user."""
    current = runtime.state.get("collected_data", [])
    return Command(update={
        "messages": [ToolMessage(content=f"Collected: {data}", tool_call_id=runtime.tool_call_id)],
        "collected_data": current + [data],
        "step_count": runtime.state.get("step_count", 0) + 1,
    })

# 创建代理
agent = create_agent(
    model="gpt-4o-mini",
    tools=[collect_info],
    state_schema=CustomState,
    middleware=[state_aware_prompt],
    checkpointer=InMemorySaver(),
)

# 调用时传入初始 state
agent.invoke({"messages": [...], "user_name": "Bob", "step_count": 0, "collected_data": []})
```

### 3. Dynamic Cross-conversation Context（可变，跨对话 = Store）

```python
from langgraph.store.memory import InMemoryStore
from langchain.tools import tool, ToolRuntime

# 初始化 store
store = InMemoryStore(index={"embed": embed_fn, "dims": 1536})

# 工具中读写长期记忆
@tool
def remember_preference(key: str, value: str, runtime: ToolRuntime) -> str:
    """Save a user preference to long-term memory."""
    user_id = runtime.context.user_name  # 从 static context 获取用户 ID
    store.put(("users", user_id), key, {"value": value})
    return f"Remembered: {key} = {value}"

@tool
def recall_preference(key: str, runtime: ToolRuntime) -> str:
    """Recall a user preference from long-term memory."""
    user_id = runtime.context.user_name
    item = store.get(("users", user_id), key)
    if item:
        return f"{key}: {item.value['value']}"
    return f"No preference found for {key}"

@tool
def search_memory(query: str, runtime: ToolRuntime) -> str:
    """Search user's long-term memory."""
    user_id = runtime.context.user_name
    items = store.search(("users", user_id), query=query)
    return "\n".join(f"- {item.value}" for item in items)
```

## 三种上下文组合使用

```python
from dataclasses import dataclass
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

# 1. Static context
@dataclass
class ContextSchema:
    user_name: str

# 2. Dynamic state
class CustomState(AgentState):
    collected_data: list[str]

# 3. Store (long-term memory)
store = InMemoryStore()

# Prompt 综合使用三者
@dynamic_prompt
def comprehensive_prompt(request: ModelRequest) -> str:
    # Static context
    user = request.runtime.context.user_name
    # Dynamic state
    data = request.state.get("collected_data", [])
    # Store (长期记忆)
    memories = store.search(("users", user), query="preferences")
    memory_text = "\n".join(f"- {m.value}" for m in memories) if memories else "None"

    return (
        f"You are assisting {user}.\n"
        f"Collected data this session: {data}\n"
        f"Known preferences: {memory_text}"
    )

# 创建代理
agent = create_agent(
    model="gpt-4o-mini",
    tools=[remember_preference, recall_preference, collect_info],
    state_schema=CustomState,
    middleware=[comprehensive_prompt],
    context_schema=ContextSchema,
    checkpointer=InMemorySaver(),
)
```

## 速查表

| 需求 | 上下文类型 | 访问方式 |
|------|-----------|---------|
| 用户姓名/ID | Static runtime | `runtime.context.user_name` |
| 数据库连接 | Static runtime | `runtime.context.db_connection` |
| 当前对话消息 | Dynamic runtime | `state["messages"]` |
| 本次收集的数据 | Dynamic runtime | `state["collected_data"]` |
| 用户偏好 | Cross-conversation | `store.get(namespace, key)` |
| 历史交互摘要 | Cross-conversation | `store.search(namespace, query)` |
| 工具间传递数据 | Dynamic runtime | `Command(update={...})` |
| 个性化提示词 | Static + Dynamic | `request.runtime.context` + `request.state` |
