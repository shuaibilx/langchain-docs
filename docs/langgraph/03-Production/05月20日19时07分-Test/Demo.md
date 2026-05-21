# Test 功能 Demo

## 环境准备

```bash
pip install langgraph pytest
```

---

## Demo 1：基本执行测试

```python
import pytest
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", END)
    return graph

def test_basic_agent_execution():
    checkpointer = MemorySaver()
    graph = create_graph()
    compiled_graph = graph.compile(checkpointer=checkpointer)

    result = compiled_graph.invoke(
        {"my_key": "initial_value"},
        config={"configurable": {"thread_id": "1"}}
    )

    assert result["my_key"] == "hello from node2"
    print(f"测试通过: {result['my_key']}")

# 运行
test_basic_agent_execution()
```

---

## Demo 2：测试单个节点

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", END)
    return graph

def test_individual_node():
    graph = create_graph()
    compiled_graph = graph.compile()

    # 直接测试 node1
    result = compiled_graph.nodes["node1"].invoke({"my_key": "input"})
    assert result["my_key"] == "hello from node1"
    print(f"node1 测试通过: {result['my_key']}")

    # 直接测试 node2
    result = compiled_graph.nodes["node2"].invoke({"my_key": "input"})
    assert result["my_key"] == "hello from node2"
    print(f"node2 测试通过: {result['my_key']}")

test_individual_node()
```

---

## Demo 3：部分执行 — 测试中间节点

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_node("node3", lambda state: {"my_key": "hello from node3"})
    graph.add_node("node4", lambda state: {"my_key": "hello from node4"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", "node3")
    graph.add_edge("node3", "node4")
    graph.add_edge("node4", END)
    return graph

def test_partial_execution_node2_to_node3():
    checkpointer = MemorySaver()
    graph = create_graph()
    compiled_graph = graph.compile(checkpointer=checkpointer)

    # 模拟节点 1 执行后的状态
    compiled_graph.update_state(
        config={"configurable": {"thread_id": "1"}},
        values={"my_key": "after node1"},
        as_node="node1",  # 假装来自节点 1
    )

    # 从节点 2 开始，到节点 3 停止
    result = compiled_graph.invoke(
        None,
        config={"configurable": {"thread_id": "1"}},
        interrupt_after="node3",
    )

    assert result["my_key"] == "hello from node3"
    print(f"部分执行测试通过: {result['my_key']}")

test_partial_execution_node2_to_node3()
```

---

## Demo 4：测试带工具的代理

```python
from typing import TypedDict, Annotated
from operator import add
from langchain.tools import tool
from langchain.messages import HumanMessage, AnyMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

@tool
def add_numbers(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

@tool
def multiply_numbers(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b

def test_agent_with_tools():
    # 创建代理（使用模拟 LLM）
    class MockLLM:
        def bind_tools(self, tools):
            return self

        def invoke(self, messages):
            # 模拟工具调用
            from langchain.messages import AIMessage
            return AIMessage(
                content="",
                tool_calls=[{
                    "id": "call_1",
                    "name": "add_numbers",
                    "args": {"a": 5, "b": 3}
                }]
            )

    agent = create_react_agent(
        model=MockLLM(),
        tools=[add_numbers, multiply_numbers],
    )

    # 测试工具调用
    result = agent.invoke(
        {"messages": [HumanMessage(content="What is 5 + 3?")]},
        config={"configurable": {"thread_id": "test-1"}}
    )

    print(f"代理测试结果: {result['messages'][-1].content}")

test_agent_with_tools()
```

---

## Demo 5：测试中断和恢复

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def ask_node(state: State) -> dict:
    answer = interrupt("请输入:")
    return {"value": state["value"] + " + " + answer}

def create_graph():
    graph = StateGraph(State)
    graph.add_node("ask", ask_node)
    graph.add_edge(START, "ask")
    graph.add_edge("ask", END)
    return graph

def test_interrupt_resume():
    checkpointer = InMemorySaver()
    graph = create_graph()
    compiled = graph.compile(checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "test-interrupt"}}

    # 第一次执行：命中中断
    result = compiled.invoke({"value": "开始"}, config)
    assert "__interrupt__" in result or "interrupts" in str(result)
    print("中断测试通过: 已暂停")

    # 恢复执行
    result = compiled.invoke(Command(resume="回答"), config)
    assert result["value"] == "开始 + 回答"
    print(f"恢复测试通过: {result['value']}")

test_interrupt_resume()
```

---

## Demo 6：测试子图

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    value: str

def sub_node(state: State) -> dict:
    return {"value": "子图: " + state["value"]}

def create_subgraph():
    return (
        StateGraph(State)
        .add_node("sub", sub_node)
        .add_edge(START, "sub")
        .add_edge("sub", END)
        .compile()
    )

def test_subgraph():
    subgraph = create_subgraph()

    # 直接测试子图
    result = subgraph.invoke({"value": "测试"})
    assert result["value"] == "子图: 测试"
    print(f"子图测试通过: {result['value']}")

    # 测试带子图的父图
    def parent_node(state: State) -> dict:
        return {"value": "父图: " + subgraph.invoke({"value": state["value"]})["value"]}

    parent = (
        StateGraph(State)
        .add_node("parent", parent_node)
        .add_edge(START, "parent")
        .add_edge("parent", END)
        .compile()
    )

    result = parent.invoke({"value": "输入"})
    print(f"父图+子图测试通过: {result['value']}")

test_subgraph()
```

---

## 运行说明

1. Demo 1 基本执行测试
2. Demo 2 单节点测试
3. Demo 3 部分执行测试
4. Demo 4 带工具的代理测试
5. Demo 5 中断恢复测试
6. Demo 6 子图测试
