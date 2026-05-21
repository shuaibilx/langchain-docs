# DeepAgent Quickstart - Demo

## Demo 1: 最小 Deep Agent

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

# 设置 API keys
# os.environ["TAVILY_API_KEY"] = "your-key"
# os.environ["ANTHROPIC_API_KEY"] = "your-key"

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(
        query,
        max_results=max_results,
        include_raw_content=include_raw_content,
        topic=topic,
    )

# 创建 agent
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a helpful research assistant.",
)

# 运行
result = agent.invoke({"messages": [{"role": "user", "content": "What is LangGraph?"}]})
print(result["messages"][-1].content)
```

## Demo 2: 研究报告代理

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(
        query,
        max_results=max_results,
        include_raw_content=include_raw_content,
        topic=topic,
    )

research_instructions = """You are an expert researcher. Your job is to conduct thorough research and then write a polished report.

You have access to an internet search tool as your primary means of gathering information.

## `internet_search`

Use this to run an internet search for a given query. You can specify the max number of results to return, the topic, and whether raw content should be included.

Always:
1. Plan your research approach first
2. Search for relevant information
3. Save important findings to files for reference
4. Synthesize findings into a coherent report
"""

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt=research_instructions,
)

# 运行研究任务
result = agent.invoke({
    "messages": [{
        "role": "user",
        "content": "Write a comprehensive report about the current state of AI agents in 2025."
    }]
})
print(result["messages"][-1].content)
```

## Demo 3: 使用不同模型提供商

```python
from deepagents import create_deep_agent

# Google Gemini
agent_google = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
)

# OpenAI
agent_openai = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
)

# OpenRouter (access many models)
agent_openrouter = create_deep_agent(
    model="openrouter:anthropic/claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
)

# 本地 Ollama
agent_local = create_deep_agent(
    model="ollama:devstral-2",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
)
```

## Demo 4: 多工具 Agent

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(query, max_results=max_results, topic=topic)

def calculate(expression: str) -> str:
    """Evaluate a mathematical expression"""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"Error: {e}"

def get_current_time() -> str:
    """Get the current date and time"""
    from datetime import datetime
    return datetime.now().isoformat()

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search, calculate, get_current_time],
    system_prompt="You are a versatile assistant with search, calculation, and time capabilities.",
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "What time is it and what's 15% of 2847?"}]
})
print(result["messages"][-1].content)
```

## Demo 5: 流式输出

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
)

# 流式执行
for chunk in agent.stream({"messages": [{"role": "user", "content": "What is AI?"}]}):
    # chunk 包含代理执行的各个步骤
    print(chunk)
```

## Demo 6: 使用初始化的模型实例

```python
from langchain_anthropic import ChatAnthropic
from deepagents import create_deep_agent

# 初始化模型（可自定义参数）
model = ChatAnthropic(
    model="claude-sonnet-4-6",
    temperature=0,
    max_tokens=4096,
)

agent = create_deep_agent(
    model=model,  # 传递实例而非字符串
    tools=[internet_search],
    system_prompt="You are a precise research assistant.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "Explain quantum computing."}]})
print(result["messages"][-1].content)
```
