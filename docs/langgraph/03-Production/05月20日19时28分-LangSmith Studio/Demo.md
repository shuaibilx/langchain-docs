# LangSmith Studio 功能 Demo

## 环境准备

```bash
pip install --upgrade "langgraph-cli[inmem]"
pip install langchain langchain-openai
```

---

## Demo 1：最小化 Studio 项目

### 项目结构

```
studio-demo/
├── src/
│   └── agent.py
├── .env
└── langgraph.json
```

### src/agent.py

```python
from langchain.agents import create_agent

def get_weather(city: str) -> str:
    """Get the weather for a city."""
    return f"{city} 的天气：晴天，25°C"

agent = create_agent(
    "gpt-4o-mini",
    tools=[get_weather],
    system_prompt="你是一个天气助手，使用 get_weather 工具回答天气问题。",
)
```

### .env

```
LANGSMITH_API_KEY=lsv2_your_key_here
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

### 启动

```bash
cd studio-demo
langgraph dev
```

然后访问 `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`

---

## Demo 2：带中断的代理

### src/agent_with_interrupt.py

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.types import interrupt

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email to a recipient."""
    # 人类审批
    approval = interrupt({
        "action": "send_email",
        "to": to,
        "subject": subject,
        "body": body,
        "message": "批准发送此邮件?"
    })

    if approval.get("action") == "approve":
        return f"邮件已发送到 {to}"
    return "邮件已取消"

agent = create_agent(
    "gpt-4o-mini",
    tools=[send_email],
    system_prompt="你是一个邮件助手。使用 send_email 工具发送邮件。",
)
```

### langgraph.json

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent_with_interrupt.py:agent"
  },
  "env": ".env"
}
```

---

## Demo 3：多工具代理

### src/multi_tool_agent.py

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"搜索结果: {query} 相关信息..."

@tool
def calculate(expression: str) -> str:
    """Calculate a math expression."""
    return str(eval(expression))

@tool
def get_time() -> str:
    """Get the current time."""
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

agent = create_agent(
    "gpt-4o-mini",
    tools=[search_web, calculate, get_time],
    system_prompt="你是一个多功能助手，可以搜索、计算和获取时间。",
)
```

---

## Demo 4：禁用追踪（纯本地）

### .env

```
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=lsv2_your_key_here
```

这样数据不会发送到 LangSmith，完全在本地运行。

---

## Demo 5：使用 tunnel（Safari）

```bash
# Safari 需要 tunnel
langgraph dev --tunnel
```

启动后会显示 tunnel URL，在 Studio UI 中手动输入该 URL 连接。

---

## 运行说明

1. Demo 1 最小化项目
2. Demo 2 带中断的代理
3. Demo 3 多工具代理
4. Demo 4 禁用追踪
5. Demo 5 使用 tunnel
