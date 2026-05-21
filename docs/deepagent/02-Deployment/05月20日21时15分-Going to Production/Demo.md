# Going to Production - Demo

## Demo 1: 基础生产调用（thread_id + context）

```python
from dataclasses import dataclass
from deepagents import create_deep_agent
from langchain_core.utils.uuid import uuid7

@dataclass
class Context:
    user_id: str
    org_id: str = "default"

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    context_schema=Context,
)

# 开始对话
config = {"configurable": {"thread_id": str(uuid7())}}
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Plan a trip to Tokyo"}]},
    config=config,
    context=Context(user_id="user-123", org_id="org-456"),
)

# 同一对话的后续
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Make it 5 days"}]},
    config=config,
    context=Context(user_id="user-123", org_id="org-456"),
)
```

## Demo 2: User 范围记忆

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (
                    rt.server_info.assistant_id,
                    rt.server_info.user.identity,
                ),
            ),
        },
    ),
    system_prompt="""You have persistent memory at /memories/.
    Read /memories/instructions.txt at the start of each conversation.
    When you learn something that should persist, update that file.""",
)
```

## Demo 3: Thread-scoped 沙箱

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent
from langchain_core.runnables import RunnableConfig
from langchain_daytona import DaytonaSandbox

client = Daytona()

async def agent(config: RunnableConfig):
    thread_id = config["configurable"]["thread_id"]
    try:
        sandbox = await client.find_one(labels={"thread_id": thread_id})
    except Exception:
        sandbox = await client.create(
            CreateSandboxFromSnapshotParams(
                labels={"thread_id": thread_id},
                auto_delete_interval=3600,  # 1 小时 TTL
            )
        )
    return create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        backend=DaytonaSandbox(sandbox=sandbox)
    )
```

## Demo 4: Assistant-scoped 沙箱

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent
from langchain_core.runnables import RunnableConfig
from langchain_daytona import DaytonaSandbox

client = Daytona()

async def agent(config: RunnableConfig):
    assistant_id = config["configurable"]["assistant_id"]
    try:
        sandbox = await client.find_one(labels={"assistant_id": assistant_id})
    except Exception:
        sandbox = await client.create(
            CreateSandboxFromSnapshotParams(labels={"assistant_id": assistant_id})
        )
    return create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        backend=DaytonaSandbox(sandbox=sandbox)
    )
```

## Demo 5: 速率限制防护

```python
from deepagents import create_deep_agent
from langchain.agents.middleware import ModelCallLimitMiddleware, ToolCallLimitMiddleware

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    middleware=[
        ModelCallLimitMiddleware(run_limit=50),    # 单次运行最多 50 次模型调用
        ToolCallLimitMiddleware(run_limit=200),     # 单次运行最多 200 次工具调用
    ],
)
```

## Demo 6: 错误处理与回退

```python
from deepagents import create_deep_agent
from langchain.agents.middleware import (
    ModelFallbackMiddleware,
    ModelRetryMiddleware,
    ToolRetryMiddleware,
)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    middleware=[
        # 模型调用重试：速率限制、超时、5xx
        ModelRetryMiddleware(max_retries=3, backoff_factor=2.0, initial_delay=1.0),
        # 主模型完全宕机时回退
        ModelFallbackMiddleware("openai:gpt-5.4"),
        # 特定工具重试
        ToolRetryMiddleware(
            max_retries=2,
            tools=["internet_search"],
            retry_on=(TimeoutError, ConnectionError),
        ),
    ],
)
```

## Demo 7: PII 脱敏

```python
from deepagents import create_deep_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    middleware=[
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
        PIIMiddleware("credit_card", strategy="mask", apply_to_input=True),
    ],
)

# 输入 "My email is john@example.com and card is 4111-1111-1111-1111"
# 会被脱敏为 "My email is [REDACTED_EMAIL] and card is ****-****-****-1111"
```

## Demo 8: 前端连接 (React)

```tsx
import { useStream } from "@langchain/react";

function App() {
  const stream = useStream<typeof agent>({
    apiUrl: "https://your-deployment.langsmith.dev",
    assistantId: "agent",
    reconnectOnMount: true,
    fetchStateHistory: true,
  });

  const handleSubmit = (text: string) => {
    stream.submit(
      { messages: [{ type: "human", content: text }] },
      {
        streamSubgraphs: true,
        config: { recursionLimit: 10000 },
      },
    );
  };

  return (
    <div>
      {stream.messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
    </div>
  );
}
```

## Demo 9: LangGraph SDK 调用

```python
from langgraph_sdk import get_client

client = get_client(url="<DEPLOYMENT_URL>", api_key="<LANGSMITH_API_KEY>")

# 创建线程
thread = await client.threads.create()

# 流式执行
async for chunk in client.runs.stream(
    thread["thread_id"],
    "agent",
    input={"messages": [{"role": "user", "content": "What is AI?"}]},
    context={"user_id": "user-123"},
    stream_mode="updates",
):
    print(chunk.data)

# 同一线程的后续
async for chunk in client.runs.stream(
    thread["thread_id"],
    "agent",
    input={"messages": [{"role": "user", "content": "Tell me more"}]},
    context={"user_id": "user-123"},
    stream_mode="updates",
):
    print(chunk.data)
```

## Demo 10: 沙箱 Auth Proxy 配置

```json
{
  "proxy_config": {
    "rules": [
      {
        "name": "openai-api",
        "match_hosts": ["api.openai.com"],
        "inject_headers": {
          "Authorization": "Bearer ${OPENAI_API_KEY}"
        }
      },
      {
        "name": "anthropic-api",
        "match_hosts": ["api.anthropic.com"],
        "inject_headers": {
          "x-api-key": "${ANTHROPIC_API_KEY}"
        }
      },
      {
        "name": "github-api",
        "match_hosts": ["api.github.com"],
        "inject_headers": {
          "Authorization": "Bearer ${GITHUB_TOKEN}"
        }
      }
    ]
  }
}
```

## Demo 11: langgraph.json 配置

```json
{
  "dependencies": [
    ".",
    "deepagents>=0.5.0",
    "langchain-anthropic",
    "tavily-python"
  ],
  "graphs": {
    "agent": "./agent.py:agent"
  },
  "env": ".env"
}
```
