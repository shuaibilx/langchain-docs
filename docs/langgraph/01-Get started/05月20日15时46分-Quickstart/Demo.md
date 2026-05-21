# LangGraph Quickstart 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：Graph API — 完整计算器 Agent

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, HumanMessage, ToolMessage
from typing_extensions import TypedDict, Annotated
from typing import Literal
from langgraph.graph import StateGraph, START, END
import operator

# 1. 定义工具和模型
model = init_chat_model("openai:gpt-4o-mini", temperature=0)

@tool
def add(a: int, b: int) -> int:
    """Adds `a` and `b`."""
    return a + b

@tool
def multiply(a: int, b: int) -> int:
    """Multiply `a` and `b`."""
    return a * b

@tool
def divide(a: int, b: int) -> float:
    """Divide `a` and `b`."""
    return a / b

tools = [add, multiply, divide]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

# 2. 定义状态
class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int

# 3. 模型节点
def llm_call(state: dict):
    return {
        "messages": [model_with_tools.invoke([
            SystemMessage(content="You are a helpful assistant tasked with performing arithmetic.")
        ] + state["messages"])],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

# 4. 工具节点
def tool_node(state: dict):
    result = []
    for tc in state["messages"][-1].tool_calls:
        tool = tools_by_name[tc["name"]]
        observation = tool.invoke(tc["args"])
        result.append(ToolMessage(content=observation, tool_call_id=tc["id"]))
    return {"messages": result}

# 5. 结束逻辑
def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
    if state["messages"][-1].tool_calls:
        return "tool_node"
    return "__end__"

# 6. 构建图
builder = StateGraph(MessagesState)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", "__end__"])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()

# 调用
result = agent.invoke({"messages": [HumanMessage(content="Add 3 and 4.")]})
for m in result["messages"]:
    m.pretty_print()
print(f"LLM 调用次数: {result['llm_calls']}")
```

---

## Demo 2：Graph API — 流式输出

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, HumanMessage, ToolMessage
from typing_extensions import TypedDict, Annotated
from typing import Literal
from langgraph.graph import StateGraph, START, END
import operator

model = init_chat_model("openai:gpt-4o-mini", temperature=0)

@tool
def add(a: int, b: int) -> int:
    """Adds `a` and `b`."""
    return a + b

@tool
def multiply(a: int, b: int) -> int:
    """Multiply `a` and `b`."""
    return a * b

tools = [add, multiply]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

def llm_call(state: dict):
    return {"messages": [model_with_tools.invoke([
        SystemMessage(content="You are a math assistant.")
    ] + state["messages"])]}

def tool_node(state: dict):
    result = []
    for tc in state["messages"][-1].tool_calls:
        tool = tools_by_name[tc["name"]]
        result.append(ToolMessage(content=tool.invoke(tc["args"]), tool_call_id=tc["id"]))
    return {"messages": result}

def should_continue(state) -> Literal["tool_node", "__end__"]:
    return "tool_node" if state["messages"][-1].tool_calls else "__end__"

builder = StateGraph(MessagesState)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", "__end__"])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()

# 流式调用
print("=== 流式输出 ===")
for chunk in agent.stream({"messages": [HumanMessage(content="(3 + 5) * 12")]}, stream_mode="updates"):
    for key, value in chunk.items():
        if "messages" in value:
            for m in value["messages"]:
                print(f"[{key}] {m.type}: {str(m.content)[:60]}")
```

---

## Demo 3：Functional API — 完整计算器 Agent

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage, ToolCall
from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from langgraph.func import entrypoint, task

model = init_chat_model("openai:gpt-4o-mini", temperature=0)

@tool
def add(a: int, b: int) -> int:
    """Adds `a` and `b`."""
    return a + b

@tool
def multiply(a: int, b: int) -> int:
    """Multiply `a` and `b`."""
    return a * b

@tool
def divide(a: int, b: int) -> float:
    """Divide `a` and `b`."""
    return a / b

tools = [add, multiply, divide]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

@task
def call_llm(messages: list[BaseMessage]):
    return model_with_tools.invoke([
        SystemMessage(content="You are a math assistant.")
    ] + messages)

@task
def call_tool(tool_call: ToolCall):
    tool = tools_by_name[tool_call["name"]]
    return tool.invoke(tool_call)

@entrypoint()
def agent(messages: list[BaseMessage]):
    model_response = call_llm(messages).result()

    while True:
        if not model_response.tool_calls:
            break

        tool_result_futures = [call_tool(tc) for tc in model_response.tool_calls]
        tool_results = [fut.result() for fut in tool_result_futures]
        messages = add_messages(messages, [model_response, *tool_results])
        model_response = call_llm(messages).result()

    messages = add_messages(messages, model_response)
    return messages

# 调用
print("=== Functional API ===")
messages = [HumanMessage(content="(3 + 5) * 12")]
for chunk in agent.stream(messages, stream_mode="updates"):
    print(chunk)
    print()
```

---

## Demo 4：Graph API — 带日志的 Agent

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, HumanMessage, ToolMessage
from typing_extensions import TypedDict, Annotated
from typing import Literal
from langgraph.graph import StateGraph, START, END
import operator

model = init_chat_model("openai:gpt-4o-mini", temperature=0)

@tool
def calculator(expr: str) -> str:
    """计算数学表达式。"""
    return str(eval(expr))

tools = [calculator]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

class State(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    steps: int

def llm_call(state: dict):
    steps = state.get("steps", 0) + 1
    print(f"[步骤 {steps}] LLM 调用")
    return {
        "messages": [model_with_tools.invoke([
            SystemMessage(content="You are a calculator assistant. Use the calculator tool.")
        ] + state["messages"])],
        "steps": steps
    }

def tool_node(state: dict):
    result = []
    for tc in state["messages"][-1].tool_calls:
        print(f"[步骤 {state['steps']}] 工具调用: {tc['name']}({tc['args']})")
        tool = tools_by_name[tc["name"]]
        result.append(ToolMessage(content=tool.invoke(tc["args"]), tool_call_id=tc["id"]))
    return {"messages": result}

def should_continue(state) -> Literal["tool_node", "__end__"]:
    return "tool_node" if state["messages"][-1].tool_calls else "__end__"

builder = StateGraph(State)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", "__end__"])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()

result = agent.invoke({"messages": [HumanMessage(content="计算 (15 + 27) * 3")], "steps": 0})
print(f"\n总步骤数: {result['steps']}")
for m in result["messages"]:
    m.pretty_print()
```

---

## Demo 5：Graph API — 多工具复杂计算

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, HumanMessage, ToolMessage
from typing_extensions import TypedDict, Annotated
from typing import Literal
from langgraph.graph import StateGraph, START, END
import operator

model = init_chat_model("openai:gpt-4o-mini", temperature=0)

@tool
def add(a: float, b: float) -> float:
    """Add a and b."""
    return a + b

@tool
def subtract(a: float, b: float) -> float:
    """Subtract b from a."""
    return a - b

@tool
def multiply(a: float, b: float) -> float:
    """Multiply a and b."""
    return a * b

@tool
def divide(a: float, b: float) -> float:
    """Divide a by b."""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

@tool
def power(base: float, exponent: float) -> float:
    """Raise base to exponent."""
    return base ** exponent

tools = [add, subtract, multiply, divide, power]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

def llm_call(state: dict):
    return {"messages": [model_with_tools.invoke([
        SystemMessage(content="You are a math assistant. Use tools for all calculations.")
    ] + state["messages"])]}

def tool_node(state: dict):
    result = []
    for tc in state["messages"][-1].tool_calls:
        tool = tools_by_name[tc["name"]]
        result.append(ToolMessage(content=str(tool.invoke(tc["args"])), tool_call_id=tc["id"]))
    return {"messages": result}

def should_continue(state) -> Literal["tool_node", "__end__"]:
    return "tool_node" if state["messages"][-1].tool_calls else "__end__"

builder = StateGraph(MessagesState)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", "__end__"])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()

result = agent.invoke({"messages": [HumanMessage(content="计算 2 的 10 次方，然后加上 100，再除以 3")]})
for m in result["messages"]:
    m.pretty_print()
```

---

## 运行说明

1. Demo 1 Graph API 完整计算器
2. Demo 2 Graph API 流式输出
3. Demo 3 Functional API 完整计算器
4. Demo 4 带日志的 Agent
5. Demo 5 多工具复杂计算
