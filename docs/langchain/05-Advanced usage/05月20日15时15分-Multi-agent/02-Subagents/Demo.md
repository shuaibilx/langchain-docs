# Subagents 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础子 Agent

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 创建研究子 Agent
research_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt="你是研究专家。简洁地回答研究问题。"
)

@tool("research", description="研究一个主题并返回发现")
def call_research(query: str) -> str:
    result = research_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content

# 主 Agent
main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_research],
)

r = main_agent.invoke({"messages": [{"role": "user", "content": "研究 Python 3.12 的新特性"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 2：多个子 Agent

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 研究 Agent
research_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="你是研究专家，负责搜索和整理信息。"
)

# 写作 Agent
writer_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="你是写作专家，负责将信息写成文章。"
)

@tool("research", description="搜索和整理信息")
def call_research(query: str) -> str:
    result = research_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content

@tool("write", description="将信息写成文章")
def call_writer(topic: str) -> str:
    result = writer_agent.invoke({"messages": [{"role": "user", "content": topic}]})
    return result["messages"][-1].content

main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_research, call_writer],
)

r = main_agent.invoke({"messages": [{"role": "user", "content": "研究 LangChain 并写一篇简介"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 3：单个分发工具模式

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 子 Agent 注册表
research_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="你是研究专家。"
)

writer_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="你是写作专家。"
)

SUBAGENTS = {
    "research": research_agent,
    "writer": writer_agent,
}

@tool
def task(agent_name: str, description: str) -> str:
    """调用专门化的子 Agent。
    可用: research（研究）, writer（写作）
    """
    agent = SUBAGENTS[agent_name]
    result = agent.invoke({"messages": [{"role": "user", "content": description}]})
    return result["messages"][-1].content

main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[task],
    system_prompt="使用 task 工具分发工作。可用: research, writer"
)

r = main_agent.invoke({"messages": [{"role": "user", "content": "用 research 研究 AI，然后用 writer 写总结"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 4：子 Agent 输入定制

```python
from langchain.agents import AgentState
from langchain.tools import tool, ToolRuntime

class MyState(AgentState):
    user_language: str = "中文"

sub_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="用指定语言回答。"
)

@tool("translate", description="翻译内容")
def call_translate(query: str, runtime: ToolRuntime[None, MyState]) -> str:
    lang = runtime.state.get("user_language", "中文")
    full_query = f"用{lang}回答: {query}"
    result = sub_agent.invoke({"messages": [{"role": "user", "content": full_query}]})
    return result["messages"][-1].content

main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_translate],
    state_schema=MyState,
)

r = main_agent.invoke({
    "messages": [{"role": "user", "content": "翻译: Hello World"}],
    "user_language": "法语"
})
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## Demo 5：子 Agent 输出定制（Command）

```python
from typing import Annotated
from langchain.agents import AgentState
from langchain.tools import tool, ToolRuntime, InjectedToolCallId
from langchain.messages import ToolMessage
from langgraph.types import Command

sub_agent = create_agent(
    model="openai:gpt-4o-mini",
    system_prompt="分析数据并返回结果。同时设置 analysis_done=True。"
)

@tool("analyze", description="分析数据")
def call_analyze(
    query: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    result = sub_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return Command(update={
        "analysis_done": True,
        "messages": [ToolMessage(
            content=result["messages"][-1].content,
            tool_call_id=tool_call_id
        )]
    })

class AnalysisState(AgentState):
    analysis_done: bool = False

main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_analyze],
    state_schema=AnalysisState,
)

r = main_agent.invoke({"messages": [{"role": "user", "content": "分析今天的天气数据"}]})
print(f"分析完成: {r.get('analysis_done')}")
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## 运行说明

1. Demo 1 基础子 Agent
2. Demo 2 多个子 Agent
3. Demo 3 单个分发工具模式
4. Demo 4 子 Agent 输入定制
5. Demo 5 子 Agent 输出定制
