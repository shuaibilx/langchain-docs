# DeepAgent Customization - Demo

## Demo 1: 基础自定义 Agent

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(query: str, max_results: int = 5, topic: Literal["general", "news", "finance"] = "general"):
    """Run a web search"""
    return tavily_client.search(query, max_results=max_results, topic=topic)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are an expert researcher. Write polished reports.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "What is LangGraph?"}]})
print(result["messages"][-1].content)
```

## Demo 2: 自定义 Middleware（日志记录）

```python
from langchain.agents.middleware import wrap_tool_call
from langchain.tools import tool
from deepagents import create_deep_agent

@tool
def get_weather(city: str) -> str:
    """Get the weather in a city."""
    return f"The weather in {city} is sunny."

call_count = [0]

@wrap_tool_call
def log_tool_calls(request, handler):
    """Intercept and log every tool call"""
    call_count[0] += 1
    tool_name = request.name if hasattr(request, "name") else str(request)
    print(f"[Middleware] Tool call #{call_count[0]}: {tool_name}")
    result = handler(request)
    print(f"[Middleware] Tool call #{call_count[0]} completed")
    return result

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[get_weather],
    middleware=[log_tool_calls],
)

result = agent.invoke({"messages": [{"role": "user", "content": "What's the weather in Tokyo?"}]})
```

## Demo 3: 子代理委派

```python
import os
from typing import Literal
from deepagents import create_deep_agent
from tavily import TavilyClient

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(query: str, max_results: int = 5, topic: Literal["general", "news", "finance"] = "general"):
    """Run a web search"""
    return tavily_client.search(query, max_results=max_results, topic=topic)

research_subagent = {
    "name": "research-agent",
    "description": "Used to research more in depth questions",
    "system_prompt": "You are a great researcher. Always cite sources.",
    "tools": [internet_search],
    "model": "openai:gpt-5.4",  # 子代理使用不同模型
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    subagents=[research_subagent],
    system_prompt="You are a research coordinator. Delegate deep research to the research-agent.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "Compare LangGraph and CrewAI"}]})
print(result["messages"][-1].content)
```

## Demo 4: Human-in-the-Loop

```python
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

@tool
def remove_file(path: str) -> str:
    """Delete a file from the filesystem."""
    return f"Deleted {path}"

@tool
def read_file(path: str) -> str:
    """Read a file from the filesystem."""
    return f"Contents of {path}"

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email."""
    return f"Sent email to {to}"

checkpointer = MemorySaver()

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[remove_file, read_file, send_email],
    interrupt_on={
        "remove_file": True,  # 需要批准
        "read_file": False,   # 不需要批准
        "send_email": {"allowed_decisions": ["approve", "reject"]},  # 只能批准或拒绝
    },
    checkpointer=checkpointer,  # 必需！
)

# 执行 - 会在敏感操作处暂停
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Delete temp.txt and read data.csv"}]},
    config={"configurable": {"thread_id": "hitl-1"}},
)
```

## Demo 5: 结构化输出

```python
from pydantic import BaseModel, Field
from deepagents import create_deep_agent

class ResearchReport(BaseModel):
    """A structured research report."""
    title: str = Field(description="Report title")
    summary: str = Field(description="Executive summary")
    key_findings: list[str] = Field(description="List of key findings")
    confidence_score: float = Field(description="Confidence in findings, 0-1")

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    response_format=ResearchReport,
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "Research the current state of quantum computing"}]
})

print(result["structured_response"])
# title='...' summary='...' key_findings=[...] confidence_score=0.85
```

## Demo 6: Skills 按需加载

```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.backends.utils import create_file_data
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
backend = StateBackend()

# 下载 skill 内容
skill_url = "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/libs/cli/examples/skills/langgraph-docs/SKILL.md"
with urlopen(skill_url) as response:
    skill_content = response.read().decode('utf-8')

skills_files = {
    "/skills/langgraph-docs/SKILL.md": create_file_data(skill_content),
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=backend,
    skills=["/skills/"],  # 注册 skill 路径
    checkpointer=checkpointer,
)

# skill 只在需要时加载
result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "What is langgraph?"}],
        "files": skills_files,
    },
    config={"configurable": {"thread_id": "skill-1"}},
)
```

## Demo 7: Memory 上下文

```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends.utils import create_file_data
from langgraph.checkpoint.memory import MemorySaver

# 加载 AGENTS.md 内容
with urlopen(
    "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/examples/text-to-sql-agent/AGENTS.md"
) as response:
    agents_md = response.read().decode("utf-8")

checkpointer = MemorySaver()

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    memory=["/AGENTS.md"],  # 注册记忆文件
    checkpointer=checkpointer,
)

result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "What's in your memory files?"}],
        "files": {"/AGENTS.md": create_file_data(agents_md)},
    },
    config={"configurable": {"thread_id": "mem-1"}},
)
```

## Demo 8: CompositeBackend 灵活路由

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=CompositeBackend(
        default=StateBackend(),  # 默认：线程内状态
        routes={
            "/memories/": StoreBackend(namespace=lambda _rt: ("memories",)),  # 长期记忆
        },
    ),
    store=InMemoryStore(),
)
```

## Demo 9: Profile 自动调整

```python
from deepagents import HarnessProfile, register_harness_profile

# 注册 profile：使用 gpt-5.4 时自动追加后缀
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(system_prompt_suffix="Respond in under 100 words."),
)

# 使用该模型时自动应用 profile
agent = create_deep_agent(model="openai:gpt-5.4")
# 系统提示自动包含 "Respond in under 100 words."
```

## Demo 10: Code Interpreter

```python
from deepagents import create_deep_agent
from langchain_quickjs import CodeInterpreterMiddleware

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    middleware=[CodeInterpreterMiddleware()],
)

# 代理现在有 eval 工具，可以执行 JavaScript
result = agent.invoke({
    "messages": [{"role": "user", "content": "Calculate the fibonacci sequence up to 100 using code"}]
})
```
