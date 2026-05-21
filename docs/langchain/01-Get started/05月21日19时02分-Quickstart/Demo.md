# Quickstart - Demo

## Demo 1: 安装依赖

```bash
# uv 方式
uv init my-agent
cd my-agent
uv add langchain deepagents
uv sync

# pip 方式
pip install -U langchain deepagents
```

## Demo 2: 设置 API 密钥

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Google Gemini
export GOOGLE_API_KEY="AIza..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# LangSmith（可选但推荐）
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."
```

## Demo 3: 最简 Agent（5 行代码）

```python
from langchain.agents import create_agent

def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"

agent = create_agent(
    model="openai:gpt-5.4",
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What's the weather in San Francisco?"}]}
)
print(result["messages"][-1].content_blocks)
```

## Demo 4: 使用不同提供商

```python
# Google Gemini
agent = create_agent(
    model="google_genai:gemini-2.5-flash-lite",
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)

# Anthropic Claude
agent = create_agent(
    model="claude-sonnet-4-6",
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)

# 本地 Ollama
agent = create_agent(
    model="ollama:devstral-2",
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)
```

## Demo 5: 定义工具

```python
import urllib.error
import urllib.request
from langchain.tools import tool

@tool
def fetch_text_from_url(url: str) -> str:
    """Fetch the document from a URL."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; quickstart-research/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
    except urllib.error.URLError as e:
        return f"Fetch failed: {e}"
    text = raw.decode("utf-8", errors="replace")
    return text
```

## Demo 6: 配置模型参数

```python
from langchain.chat_models import init_chat_model

# OpenAI（基本配置）
model = init_chat_model(
    "openai:gpt-5.4",
    temperature=0.5,
    timeout=300,
    max_tokens=25000,
)

# Anthropic（流式输出）
model = init_chat_model(
    "claude-sonnet-4-6",
    temperature=0.5,
    timeout=600,
    max_tokens=25000,
    streaming=True,
)
```

## Demo 7: 添加记忆

```python
from langgraph.checkpoint.memory import InMemorySaver

# 内存记忆（开发用）
checkpointer = InMemorySaver()

# 创建带记忆的 agent
agent = create_agent(
    model=model,
    tools=[fetch_text_from_url],
    system_prompt=SYSTEM_PROMPT,
    checkpointer=checkpointer,
)
```

## Demo 8: LangChain Agent vs Deep Agent

```python
from langchain.agents import create_agent
from deepagents import create_deep_agent

# LangChain agent（细粒度控制）
agent = create_agent(
    model=model,
    tools=[fetch_text_from_url],
    system_prompt=SYSTEM_PROMPT,
    checkpointer=checkpointer,
)

# Deep agent（内置功能）
deep_agent = create_deep_agent(
    model=model,
    tools=[fetch_text_from_url],
    system_prompt=SYSTEM_PROMPT,
    checkpointer=checkpointer,
)
```

## Demo 9: 运行研究任务

```python
content = """Project Gutenberg hosts a full plain-text copy of The Great Gatsby.
URL: https://www.gutenberg.org/files/64317/64317-0.txt

Answer:
1) How many lines contain the substring `Gatsby`?
2) The 1-based line number of the first line containing `Daisy`.
3) A two-sentence neutral synopsis.

If you cannot verify an exact answer, use `null` for that field."""

# LangChain agent
result = agent.invoke(
    {"messages": [{"role": "user", "content": content}]},
    config={"configurable": {"thread_id": "research-1"}},
)
print(result["messages"][-1].content_blocks)

# Deep agent
deep_result = deep_agent.invoke(
    {"messages": [{"role": "user", "content": content}]},
    config={"configurable": {"thread_id": "research-2"}},
)
print(deep_result["messages"][-1].content_blocks)
```

## Demo 10: LangSmith 追踪

```bash
# 设置环境变量
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."

# 运行脚本后，在 LangSmith 控制台查看追踪
# https://smith.langchain.com
```

## Demo 11: 完整工作流

```python
import urllib.error
import urllib.request

from langchain.agents import create_agent
from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

# 1. 系统提示
SYSTEM_PROMPT = """You are a literary data assistant.
- `fetch_text_from_url`: loads document text from a URL into the conversation.
Do not guess line counts—ground them in tool results."""

# 2. 工具
@tool
def fetch_text_from_url(url: str) -> str:
    """Fetch the document from a URL."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; quickstart/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
    except urllib.error.URLError as e:
        return f"Fetch failed: {e}"
    return raw.decode("utf-8", errors="replace")

# 3. 模型
model = init_chat_model(
    "gemini-3.1-pro-preview",
    model_provider="google-genai",
    temperature=0.5,
    timeout=600,
    max_tokens=25000,
    streaming=True,
)

# 4. 记忆
checkpointer = InMemorySaver()

# 5. 创建 agent
agent = create_agent(
    model=model,
    tools=[fetch_text_from_url],
    system_prompt=SYSTEM_PROMPT,
    checkpointer=checkpointer,
)

# 6. 运行
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Summarize The Great Gatsby from this URL: https://www.gutenberg.org/files/64317/64317-0.txt"}]},
    config={"configurable": {"thread_id": "demo"}},
)
print(result["messages"][-1].content_blocks)
```
