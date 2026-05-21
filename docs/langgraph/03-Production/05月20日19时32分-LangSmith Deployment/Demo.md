# LangSmith Deployment 功能 Demo

## 环境准备

```bash
pip install langgraph-sdk langchain langchain-openai
```

---

## Demo 1：准备部署项目

### 项目结构

```
my-deployed-agent/
├── src/
│   └── agent.py
├── .env
├── requirements.txt
└── langgraph.json
```

### src/agent.py

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """Get weather for a city."""
    return f"{city}: 晴天, 25°C"

agent = create_agent(
    "gpt-4o-mini",
    tools=[get_weather],
    system_prompt="你是天气助手，使用 get_weather 工具。",
)
```

### requirements.txt

```
langchain
langchain-openai
```

### langgraph.json

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent.py:agent"
  },
  "env": ".env"
}
```

### .env

```
OPENAI_API_KEY=sk-...
```

---

## Demo 2：使用 Python SDK 调用

```python
from langgraph_sdk import get_sync_client

# 连接到已部署的代理
client = get_sync_client(
    url="https://your-deployment-url",
    api_key="your-langsmith-api-key"
)

# 流式调用
for chunk in client.runs.stream(
    None,    # 无线程运行
    "agent", # langgraph.json 中定义的图名
    input={
        "messages": [{
            "role": "human",
            "content": "北京今天天气怎么样？"
        }]
    },
    stream_mode="updates",
):
    print(f"事件类型: {chunk.event}")
    print(chunk.data)
    print("---")
```

---

## Demo 3：使用 REST API 调用

```bash
curl -s --request POST \
    --url https://your-deployment-url/runs/stream \
    --header 'Content-Type: application/json' \
    --header 'X-Api-Key: your-langsmith-api-key' \
    --data '{
        "assistant_id": "agent",
        "input": {
            "messages": [
                {
                    "role": "human",
                    "content": "北京今天天气怎么样？"
                }
            ]
        },
        "stream_mode": "updates"
    }'
```

---

## Demo 4：带线程的多轮对话

```python
from langgraph_sdk import get_sync_client

client = get_sync_client(
    url="https://your-deployment-url",
    api_key="your-langsmith-api-key"
)

# 创建线程
thread = client.threads.create()
print(f"线程 ID: {thread['thread_id']}")

# 第一轮对话
for chunk in client.runs.stream(
    thread['thread_id'],
    "agent",
    input={"messages": [{"role": "human", "content": "我叫小明"}]},
):
    print(chunk.data)

# 第二轮对话（同一线程，保留历史）
for chunk in client.runs.stream(
    thread['thread_id'],
    "agent",
    input={"messages": [{"role": "human", "content": "我叫什么？"}]},
):
    print(chunk.data)
```

---

## Demo 5：处理中断

```python
from langgraph_sdk import get_sync_client
from langgraph.types import Command

client = get_sync_client(
    url="https://your-deployment-url",
    api_key="your-langsmith-api-key"
)

thread = client.threads.create()

# 首次运行（可能中断）
for chunk in client.runs.stream(
    thread['thread_id'],
    "agent",
    input={"messages": [{"role": "human", "content": "发送邮件给 alice"}]},
):
    if chunk.event == "interrupt":
        print(f"中断: {chunk.data}")
        # 保存中断信息用于恢复
        interrupt_data = chunk.data

# 恢复执行
for chunk in client.runs.stream(
    thread['thread_id'],
    "agent",
    input=Command(resume=True),
):
    print(chunk.data)
```

---

## 运行说明

1. Demo 1 准备部署项目
2. Demo 2 Python SDK 调用
3. Demo 3 REST API 调用
4. Demo 4 多轮对话
5. Demo 5 处理中断
