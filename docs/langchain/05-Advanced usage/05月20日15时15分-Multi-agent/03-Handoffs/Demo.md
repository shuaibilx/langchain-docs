# Handoffs 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础切换 — 状态驱动

```python
from langchain.agents import AgentState, create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.tools import tool, ToolRuntime
from langchain.messages import ToolMessage
from langgraph.types import Command
from langgraph.checkpoint.memory import InMemorySaver
from typing import Callable

# 1. 定义状态
class SupportState(AgentState):
    current_step: str = "triage"
    issue_type: str | None = None

# 2. 工具更新状态
@tool
def record_issue(issue: str, runtime: ToolRuntime[None, SupportState]) -> Command:
    """记录问题类型并切换到下一步。"""
    return Command(update={
        "messages": [ToolMessage(content=f"已记录: {issue}", tool_call_id=runtime.tool_call_id)],
        "issue_type": issue,
        "current_step": "specialist"
    })

@tool
def provide_solution(solution: str) -> str:
    """提供解决方案。"""
    return f"解决方案: {solution}"

# 3. 中间件动态配置
@wrap_model_call
def apply_config(request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse) -> ModelResponse:
    step = request.state.get("current_step", "triage")
    configs = {
        "triage": {"prompt": "你负责分类问题。请询问用户问题详情，然后用 record_issue 记录。", "tools": [record_issue]},
        "specialist": {"prompt": "你是专家，根据问题提供解决方案。", "tools": [provide_solution]},
    }
    config = configs[step]
    request = request.override(system_prompt=config["prompt"], tools=config["tools"])
    return handler(request)

# 4. 创建 Agent
agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[record_issue, provide_solution],
    state_schema=SupportState,
    middleware=[apply_config],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "handoff-1"}}

r = agent.invoke({"messages": [{"role": "user", "content": "我的手机屏幕碎了"}]}, config)
print(f"回复: {r['messages'][-1].content[:60]}")
```

---

## Demo 2：切换工具 — Command

```python
from langchain.tools import tool, ToolRuntime
from langchain.messages import ToolMessage
from langchain.agents import create_agent
from langgraph.types import Command

@tool
def transfer_to_sales(runtime: ToolRuntime) -> Command:
    """转接到销售部门。"""
    return Command(update={
        "messages": [ToolMessage(content="已转接销售", tool_call_id=runtime.tool_call_id)],
        "active_agent": "sales"
    })

@tool
def transfer_to_support(runtime: ToolRuntime) -> Command:
    """转接到技术支持。"""
    return Command(update={
        "messages": [ToolMessage(content="已转接技术支持", tool_call_id=runtime.tool_call_id)],
        "active_agent": "support"
    })

@tool
def answer_sales(question: str) -> str:
    """回答销售问题。"""
    return f"销售回答: {question}"

@tool
def answer_support(question: str) -> str:
    """回答技术问题。"""
    return f"技术回答: {question}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[transfer_to_sales, transfer_to_support, answer_sales, answer_support],
    system_prompt="你是客服。销售问题转 sales，技术问题转 support。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "我想了解价格"}]})
print(f"回复: {r['messages'][-1].content[:60]}")
```

---

## Demo 3：多 Agent 子图切换

```python
from typing import Literal
from langchain.agents import AgentState, create_agent
from langchain.messages import AIMessage, ToolMessage
from langchain.tools import tool, ToolRuntime
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
from typing_extensions import NotRequired

class MultiAgentState(AgentState):
    active_agent: NotRequired[str]

@tool
def transfer_to_sales(runtime: ToolRuntime) -> Command:
    """转接到销售。"""
    last_ai = next(msg for msg in reversed(runtime.state["messages"]) if isinstance(msg, AIMessage))
    return Command(
        goto="sales_agent",
        update={
            "active_agent": "sales_agent",
            "messages": [last_ai, ToolMessage(content="转接销售", tool_call_id=runtime.tool_call_id)],
        },
        graph=Command.PARENT,
    )

@tool
def transfer_to_support(runtime: ToolRuntime) -> Command:
    """转接到技术支持。"""
    last_ai = next(msg for msg in reversed(runtime.state["messages"]) if isinstance(msg, AIMessage))
    return Command(
        goto="support_agent",
        update={
            "active_agent": "support_agent",
            "messages": [last_ai, ToolMessage(content="转接技术支持", tool_call_id=runtime.tool_call_id)],
        },
        graph=Command.PARENT,
    )

sales_agent = create_agent(model="openai:gpt-4o-mini", tools=[transfer_to_support],
    system_prompt="你是销售。技术问题转给技术支持。")
support_agent = create_agent(model="openai:gpt-4o-mini", tools=[transfer_to_sales],
    system_prompt="你是技术支持。销售问题转给销售。")

def route(state: MultiAgentState) -> Literal["sales_agent", "support_agent", "__end__"]:
    msgs = state.get("messages", [])
    if msgs and isinstance(msgs[-1], AIMessage) and not msgs[-1].tool_calls:
        return "__end__"
    return state.get("active_agent", "sales_agent")

builder = StateGraph(MultiAgentState)
builder.add_node("sales_agent", lambda s: sales_agent.invoke(s))
builder.add_node("support_agent", lambda s: support_agent.invoke(s))
builder.add_conditional_edges(START, route, ["sales_agent", "support_agent"])
builder.add_conditional_edges("sales_agent", route, ["sales_agent", "support_agent", END])
builder.add_conditional_edges("support_agent", route, ["sales_agent", "support_agent", END])

graph = builder.compile()
r = graph.invoke({"messages": [{"role": "user", "content": "我想买你们的产品"}]})
for msg in r["messages"]:
    print(f"[{msg.type}] {str(msg.content)[:60]}")
```

---

## 运行说明

1. Demo 1 状态驱动切换（单 Agent + 中间件）
2. Demo 2 切换工具（Command）
3. Demo 3 多 Agent 子图切换
