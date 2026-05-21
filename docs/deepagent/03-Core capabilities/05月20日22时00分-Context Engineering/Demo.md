# 上下文工程 - Demo

## Demo 1: 基础系统提示

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    system_prompt=(
        "You are a research assistant specializing in scientific literature. "
        "Always cite sources. Use subagents for parallel research on different topics."
    ),
)
```

## Demo 2: Memory 始终加载

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    memory=["/project/AGENTS.md", "~/.deepagents/preferences.md"],
)
# AGENTS.md 内容会始终注入系统提示
# 适用于：项目约定、编码风格、用户偏好
```

## Demo 3: Skills 按需加载

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    skills=["/skills/research/", "/skills/web-search/"],
)
# 启动时只读取 SKILL.md 的 frontmatter（名称、描述）
# 代理确定相关时才加载完整内容
# 效果：不相关的 skills 不消耗 token
```

## Demo 4: 运行时上下文（Context Schema）

```python
from dataclasses import dataclass
from deepagents import create_deep_agent
from langchain.tools import tool, ToolRuntime

@dataclass
class Context:
    user_id: str
    api_key: str
    role: str = "user"

@tool
def fetch_user_data(query: str, runtime: ToolRuntime[Context]) -> str:
    """Fetch data for the current user."""
    user_id = runtime.context.user_id
    role = runtime.context.role
    return f"Data for user {user_id} (role: {role}): {query}"

@tool
def admin_action(action: str, runtime: ToolRuntime[Context]) -> str:
    """Perform an admin action. Requires admin role."""
    if runtime.context.role != "admin":
        return "Error: Admin role required"
    return f"Admin action executed: {action}"

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[fetch_user_data, admin_action],
    context_schema=Context,
)

# 普通用户
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Get my recent activity"}]},
    context=Context(user_id="user-123", api_key="sk-...", role="user"),
)

# 管理员用户
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Delete all logs"}]},
    context=Context(user_id="admin-001", api_key="sk-...", role="admin"),
)
```

## Demo 5: 动态系统提示（Middleware）

```python
from dataclasses import dataclass
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from deepagents import create_deep_agent
from typing import Callable

@dataclass
class Context:
    user_id: str
    is_admin: bool

@wrap_model_call
def dynamic_system_prompt(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse],
) -> ModelResponse:
    ctx = request.runtime.context
    if ctx.is_admin:
        extra = "You have FULL admin access. You can modify any file."
    else:
        extra = "You have READ-ONLY access. Do not modify any files."
    # 在运行时追加到系统提示
    request.messages.insert(0, {"role": "system", "content": extra})
    return handler(request)

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    middleware=[dynamic_system_prompt],
    context_schema=Context,
)
```

## Demo 6: 工具描述优化

```python
from langchain.tools import tool
from deepagents import create_deep_agent

@tool(parse_docstring=True)
def search_orders(
    user_id: str,
    status: str,
    limit: int = 10
) -> str:
    """Search for user orders by status.

    Use this when the user asks about order history or wants to check
    order status. Always filter by the provided status.

    Args:
        user_id: Unique identifier for the user
        status: Order status: 'pending', 'shipped', or 'delivered'
        limit: Maximum number of results to return
    """
    return f"Found orders for {user_id} with status {status}"

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[search_orders],
)
# 工具描述中的 "Use this when..." 指导模型何时使用
# 参数描述中的 "Order status: 'pending', 'shipped', or 'delivered'" 指导参数填写
```

## Demo 7: 上下文压缩 - 摘要工具

```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.middleware.summarization import (
    create_summarization_tool_middleware,
)

backend = StateBackend
model = "google_genai:gemini-3.1-pro-preview"

agent = create_deep_agent(
    model=model,
    middleware=[
        create_summarization_tool_middleware(model, backend),
    ],
)
# 代理可以在任务之间主动触发摘要
# 不会禁用 85% 阈值时的自动摘要
```

## Demo 8: 过滤摘要 tokens

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[internet_search],
)

# 流式输出时过滤摘要步骤产生的 tokens
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research quantum computing"}]},
    stream_mode="messages",
    version="v2",
):
    token, metadata = chunk["data"]
    # 跳过摘要步骤生成的 tokens
    if metadata.get("lc_source") == "summarization":
        continue
    else:
        print(token.content, end="", flush=True)
```

## Demo 9: 子代理上下文隔离

```python
from deepagents import create_deep_agent

research_subagent = {
    "name": "researcher",
    "description": "Conducts research on a topic",
    "system_prompt": """You are a research assistant.
    IMPORTANT: Return only the essential summary (under 500 words).
    Do NOT include raw search results or detailed tool outputs.""",
    "tools": [web_search],
}

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[internet_search],
    subagents=[research_subagent],
    system_prompt="You are a research manager. Delegate research to subagents.",
)

# 主代理调用 task(subagent="researcher", topic="quantum computing")
# 子代理独立执行 100+ 工具调用
# 主代理只收到 500 字以内的摘要
```

## Demo 10: 长期记忆（CompositeBackend）

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

def make_backend(runtime):
    return CompositeBackend(
        default=StateBackend(runtime),         # 线程范围
        routes={"/memories/": StoreBackend(runtime)},  # 跨线程持久化
    )

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    store=InMemoryStore(),
    backend=make_backend,
    system_prompt="""When users tell you their preferences, save them to
    /memories/user_preferences.txt so you remember them in future conversations.

    At the start of each conversation, read /memories/user_preferences.txt
    to recall the user's preferences.""",
)

# 第一次对话
agent.invoke({"messages": [{"role": "user", "content": "I prefer concise responses"}]})
# 代理创建 /memories/user_preferences.txt 并写入偏好

# 下一次对话（新线程）
agent.invoke({"messages": [{"role": "user", "content": "Hello!"}]})
# 代理读取 /memories/user_preferences.txt
# 已知用户偏好简洁响应
```

## Demo 11: 完整上下文工程配置

```python
from dataclasses import dataclass
from deepagents import create_deep_agent, HarnessProfile, register_harness_profile
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.middleware.summarization import create_summarization_tool_middleware
from langgraph.store.memory import InMemoryStore
from langchain.tools import tool, ToolRuntime

# Harness Profile：调整系统提示
register_harness_profile(
    "google_genai:gemini-3.1-pro-preview",
    HarnessProfile(
        system_prompt_suffix="Always be thorough and cite sources.",
        tool_description_overrides={"edit_file": "Edit files with care. Prefer small changes."},
    ),
)

@dataclass
class Context:
    user_id: str
    role: str = "user"

@tool
def get_user_preferences(runtime: ToolRuntime[Context]) -> str:
    """Get current user's preferences."""
    return f"Preferences for {runtime.context.user_id}: concise, technical"

def make_backend(runtime):
    return CompositeBackend(
        default=StateBackend(runtime),
        routes={"/memories/": StoreBackend(runtime)},
    )

model = "google_genai:gemini-3.1-pro-preview"
backend_type = StateBackend

agent = create_deep_agent(
    model=model,
    # 输入上下文
    system_prompt="You are a research assistant.",
    memory=["./AGENTS.md"],
    skills=["./skills/research/"],
    tools=[get_user_preferences],
    # 运行时上下文
    context_schema=Context,
    # 长期记忆
    store=InMemoryStore(),
    backend=make_backend,
    # 上下文压缩
    middleware=[
        create_summarization_tool_middleware(model, backend_type),
    ],
    # 子代理隔离
    subagents=[{
        "name": "researcher",
        "system_prompt": "Return summaries under 500 words.",
        "tools": [web_search],
    }],
)
```
