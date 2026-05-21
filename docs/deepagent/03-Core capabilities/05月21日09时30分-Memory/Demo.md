# Memory - Demo

## Demo 1: 代理范围记忆

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=["/memories/AGENTS.md"],
    skills=["/skills/"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.assistant_id,),
            ),
            "/skills/": StoreBackend(
                namespace=lambda rt: (rt.server_info.assistant_id,),
            ),
        },
    ),
)
# 所有用户共享同一份记忆
# 代理跨对话积累知识和偏好
```

## Demo 2: 用户范围记忆

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=["/memories/preferences.md"],
    skills=["/skills/"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
            "/skills/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
        },
    ),
)
# 每个用户有隔离的记忆副本
# 用户 A 的偏好不会泄露到用户 B
```

## Demo 3: 种子记忆并跨线程调用

```python
from langchain_core.utils.uuid import uuid7
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 种子记忆文件
store.put(
    ("my-agent",),
    "/memories/AGENTS.md",
    create_file_data("""## Response style
- Keep responses concise
- Use code examples where possible
"""),
)

# 种子 skill
store.put(
    ("my-agent",),
    "/skills/langgraph-docs/SKILL.md",
    create_file_data("""---
name: langgraph-docs
description: Fetch relevant LangGraph documentation.
---

# langgraph-docs

Use the fetch_url tool to read https://docs.langchain.com/llms.txt.
"""),
)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=["/memories/AGENTS.md"],
    skills=["/skills/"],
    backend=lambda rt: CompositeBackend(
        default=StateBackend(rt),
        routes={
            "/memories/": StoreBackend(rt, namespace=lambda rt: ("my-agent",)),
            "/skills/": StoreBackend(rt, namespace=lambda rt: ("my-agent",)),
        },
    ),
    store=store,
)

# 线程 1：代理学到新偏好
config1 = {"configurable": {"thread_id": str(uuid7())}}
agent.invoke(
    {"messages": [{"role": "user", "content": "I prefer detailed explanations. Remember that."}]},
    config=config1,
)

# 线程 2：代理读取记忆并应用偏好
config2 = {"configurable": {"thread_id": str(uuid7())}}
agent.invoke(
    {"messages": [{"role": "user", "content": "Explain how transformers work."}]},
    config=config2,
)
```

## Demo 4: 跨用户隔离记忆

```python
from langchain_core.utils.uuid import uuid7
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 为两个用户种子偏好
store.put(("user-alice",), "/memories/preferences.md",
    create_file_data("## Preferences\n- Likes concise bullet points\n- Prefers Python examples"))
store.put(("user-bob",), "/memories/preferences.md",
    create_file_data("## Preferences\n- Likes detailed explanations\n- Prefers TypeScript examples"))

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=["/memories/preferences.md"],
    backend=lambda rt: CompositeBackend(
        default=StateBackend(rt),
        routes={"/memories/": StoreBackend(rt, namespace=lambda rt: (rt.server_info.user.identity,))},
    ),
    store=store,
)

# Alice 和 Bob 各自只看到自己的偏好
```

## Demo 5: 组织级记忆（只读）

```python
from deepagents import create_deep_agent, FilesystemPermission
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=[
        "/memories/preferences.md",
        "/policies/compliance.md",
    ],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
            "/policies/": StoreBackend(
                namespace=lambda rt: (rt.context.org_id,),
            ),
        },
    ),
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/policies/**"],
            mode="deny",
        ),
    ],
)
# /policies/ 对代理只读
# 通过应用代码填充组织策略
```

## Demo 6: 情景性记忆（搜索历史对话）

```python
from langgraph_sdk import get_client
from langchain.tools import tool, ToolRuntime

client = get_client(url="<DEPLOYMENT_URL>")


@tool
async def search_past_conversations(query: str, runtime: ToolRuntime) -> str:
    """Search past conversations for relevant context."""
    user_id = runtime.server_info.user.identity
    threads = await client.threads.search(
        metadata={"user_id": user_id},
        limit=5,
    )
    results = []
    for thread in threads:
        history = await client.threads.get_history(thread_id=thread["thread_id"])
        results.append(history)
    return str(results)


agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    tools=[search_past_conversations],
    system_prompt="When asked about past conversations, use search_past_conversations.",
)
```

## Demo 7: 整合代理

```python
# consolidation_agent.py
from datetime import datetime, timedelta, timezone
from deepagents import create_deep_agent
from langchain.tools import tool, ToolRuntime
from langgraph_sdk import get_client

sdk_client = get_client(url="<DEPLOYMENT_URL>")


@tool
async def search_recent_conversations(query: str, runtime: ToolRuntime) -> str:
    """Search this user's conversations updated in the last 6 hours."""
    user_id = runtime.server_info.user.identity
    since = datetime.now(timezone.utc) - timedelta(hours=6)
    threads = await sdk_client.threads.search(
        metadata={"user_id": user_id},
        updated_after=since.isoformat(),
        limit=20,
    )
    conversations = []
    for thread in threads:
        history = await sdk_client.threads.get_history(thread_id=thread["thread_id"])
        conversations.append(history["values"]["messages"])
    return str(conversations)


agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="""Review recent conversations and update the user's memory file.
Merge new facts, remove outdated information, and keep it concise.""",
    tools=[search_recent_conversations],
)
```

## Demo 8: Cron 计划整合

```python
from langgraph_sdk import get_client

client = get_client(url="<DEPLOYMENT_URL>")

# 每 6 小时运行整合
cron_job = await client.crons.create(
    assistant_id="consolidation_agent",
    schedule="0 */6 * * *",
    input={"messages": [{"role": "user", "content": "Consolidate recent memories."}]},
)

# langgraph.json
# {
#   "graphs": {
#     "agent": "./agent.py:agent",
#     "consolidation_agent": "./consolidation_agent.py:agent"
#   }
# }
```

## Demo 9: 多代理部署

```python
from deepagents.backends import StoreBackend

# 按代理 + 按用户隔离
StoreBackend(
    namespace=lambda rt: (
        rt.server_info.assistant_id,
        rt.server_info.user.identity,
    ),
)

# 只按代理隔离（无按用户）
StoreBackend(
    namespace=lambda rt: (rt.server_info.assistant_id,),
)
```

## Demo 10: 完整 Memory 应用

```python
from deepagents import create_deep_agent, FilesystemPermission
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=[
        "/memories/preferences.md",   # 用户范围，可读写
        "/policies/compliance.md",    # 组织范围，只读
    ],
    skills=["/skills/"],              # 代理范围
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
            "/policies/": StoreBackend(
                namespace=lambda rt: (rt.context.org_id,),
            ),
            "/skills/": StoreBackend(
                namespace=lambda rt: (rt.server_info.assistant_id,),
            ),
        },
    ),
    permissions=[
        # 组织策略只读
        FilesystemPermission(
            operations=["write"],
            paths=["/policies/**"],
            mode="deny",
        ),
    ],
    checkpointer=checkpointer,
    system_prompt="""You are a helpful assistant with persistent memory.

At the start of each conversation:
1. Read /memories/preferences.md to recall user preferences
2. Read /policies/compliance.md for organization rules

When you learn new preferences:
- Update /memories/preferences.md using edit_file

NEVER modify /policies/compliance.md.""",
)

# 使用：
# 线程 1：用户说 "I prefer concise responses"
# → 代理更新 /memories/preferences.md
# 线程 2：新对话开始
# → 代理读取 /memories/preferences.md，已知用户偏好简洁响应
# → 代理读取 /policies/compliance.md，遵守组织规则
```
