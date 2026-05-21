# Subgraphs 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：不同 schema — 在节点内调用子图

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 子图状态
class SubgraphState(TypedDict):
    bar: str

def sub_node_1(state: SubgraphState) -> dict:
    return {"bar": "hi! " + state["bar"]}

def sub_node_2(state: SubgraphState) -> dict:
    return {"bar": state["bar"] + "!"}

subgraph = (
    StateGraph(SubgraphState)
    .add_node("sub1", sub_node_1)
    .add_node("sub2", sub_node_2)
    .add_edge(START, "sub1")
    .add_edge("sub1", "sub2")
    .add_edge("sub2", END)
    .compile()
)

# 父图状态（不同 schema）
class ParentState(TypedDict):
    foo: str

def node_1(state: ParentState) -> dict:
    return {"foo": "你好! " + state["foo"]}

def node_2(state: ParentState) -> dict:
    # 在节点内调用子图，手动转换状态
    sub_result = subgraph.invoke({"bar": state["foo"]})
    return {"foo": sub_result["bar"]}

graph = (
    StateGraph(ParentState)
    .add_node("node_1", node_1)
    .add_node("node_2", node_2)
    .add_edge(START, "node_1")
    .add_edge("node_1", "node_2")
    .add_edge("node_2", END)
    .compile()
)

result = graph.invoke({"foo": "世界"})
print(f"结果: {result['foo']}")
```

---

## Demo 2：共享 schema — 添加子图为节点

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 共享状态
class State(TypedDict):
    foo: str

def sub_node(state: State) -> dict:
    return {"foo": "子图: " + state["foo"]}

subgraph = (
    StateGraph(State)
    .add_node("sub", sub_node)
    .add_edge(START, "sub")
    .add_edge("sub", END)
    .compile()
)

def parent_node(state: State) -> dict:
    return {"foo": "父图: " + state["foo"]}

# 直接将子图添加为节点
graph = (
    StateGraph(State)
    .add_node("parent", parent_node)
    .add_node("sub", subgraph)  # 子图作为节点
    .add_edge(START, "parent")
    .add_edge("parent", "sub")
    .add_edge("sub", END)
    .compile()
)

result = graph.invoke({"foo": "测试"})
print(f"结果: {result['foo']}")
```

---

## Demo 3：两层子图嵌套

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 孙子图
class GrandChildState(TypedDict):
    value: str

def grandchild_node(state: GrandChildState) -> dict:
    return {"value": state["value"] + " -> 孙子图"}

grandchild = (
    StateGraph(GrandChildState)
    .add_node("gc", grandchild_node)
    .add_edge(START, "gc")
    .add_edge("gc", END)
    .compile()
)

# 子图
class ChildState(TypedDict):
    value: str

def child_node(state: ChildState) -> dict:
    result = grandchild.invoke({"value": state["value"]})
    return {"value": result["value"] + " -> 子图"}

child = (
    StateGraph(ChildState)
    .add_node("child", child_node)
    .add_edge(START, "child")
    .add_edge("child", END)
    .compile()
)

# 父图
class ParentState(TypedDict):
    value: str

def parent_node(state: ParentState) -> dict:
    result = child.invoke({"value": state["value"]})
    return {"value": result["value"] + " -> 父图"}

graph = (
    StateGraph(ParentState)
    .add_node("parent", parent_node)
    .add_edge(START, "parent")
    .add_edge("parent", END)
    .compile()
)

result = graph.invoke({"value": "开始"})
print(f"结果: {result['value']}")
```

---

## Demo 4：每次调用模式 — 中断

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def sub_node(state: State) -> dict:
    answer = interrupt("子图需要输入:")
    return {"value": state["value"] + " + " + answer}

subgraph = (
    StateGraph(State)
    .add_node("sub", sub_node)
    .add_edge(START, "sub")
    .add_edge("sub", END)
    .compile()  # 继承父图检查点器
)

def call_subgraph(state: State) -> dict:
    result = subgraph.invoke({"value": state["value"]})
    return {"value": result["value"]}

graph = (
    StateGraph(State)
    .add_node("caller", call_subgraph)
    .add_edge(START, "caller")
    .add_edge("caller", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "sub-interrupt-1"}}

# 首次执行
result = graph.invoke({"value": "开始"}, config)
print(f"中断: {result.get('__interrupt__', '无')}")

# 恢复
result = graph.invoke(Command(resume="子图回答"), config)
print(f"结果: {result['value']}")
```

---

## Demo 5：每线程模式 — 累积记忆

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    messages: Annotated[list[str], add]

def sub_node(state: State) -> dict:
    count = len(state["messages"])
    return {"messages": [f"子图处理第 {count} 条消息"]}

subgraph = (
    StateGraph(State)
    .add_node("sub", sub_node)
    .add_edge(START, "sub")
    .add_edge("sub", END)
    .compile(checkpointer=True)  # 每线程模式
)

def call_sub(state: State) -> dict:
    result = subgraph.invoke({"messages": state["messages"]})
    return {"messages": result["messages"]}

graph = (
    StateGraph(State)
    .add_node("caller", call_sub)
    .add_edge(START, "caller")
    .add_edge("caller", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "per-thread-1"}}

# 第一次调用
r1 = graph.invoke({"messages": ["你好"]}, config)
print(f"调用1: {r1['messages']}")

# 第二次调用（子图记得上次的状态）
r2 = graph.invoke({"messages": ["天气怎么样"]}, config)
print(f"调用2: {r2['messages']}")
```

---

## Demo 6：流式子图输出

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class SubState(TypedDict):
    value: str

def sub_node(state: SubState) -> dict:
    return {"value": "子图: " + state["value"]}

subgraph = (
    StateGraph(SubState)
    .add_node("sub", sub_node)
    .add_edge(START, "sub")
    .add_edge("sub", END)
    .compile()
)

class ParentState(TypedDict):
    value: str

def parent_node(state: ParentState) -> dict:
    result = subgraph.invoke({"value": state["value"]})
    return {"value": result["value"]}

graph = (
    StateGraph(ParentState)
    .add_node("parent", parent_node)
    .add_edge(START, "parent")
    .add_edge("parent", END)
    .compile()
)

print("=== 流式子图输出 ===")
for chunk in graph.stream(
    {"value": "测试"},
    subgraphs=True,
    stream_mode="updates",
    version="v2",
):
    if chunk["type"] == "updates":
        if chunk["ns"]:
            print(f"[子图] {chunk['ns']}: {chunk['data']}")
        else:
            print(f"[根图] {chunk['data']}")
```

---

## Demo 7：查看子图状态

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def sub_node(state: State) -> dict:
    answer = interrupt("请输入:")
    return {"value": state["value"] + " + " + answer}

subgraph = (
    StateGraph(State)
    .add_node("sub", sub_node)
    .add_edge(START, "sub")
    .add_edge("sub", END)
    .compile()
)

graph = (
    StateGraph(State)
    .add_node("caller", subgraph)
    .add_edge(START, "caller")
    .add_edge("caller", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "view-state-1"}}

# 执行到中断
graph.invoke({"value": "开始"}, config)

# 查看子图状态
parent_state = graph.get_state(config, subgraphs=True)
sub_state = parent_state.tasks[0].state
print(f"子图状态: {sub_state.values}")
print(f"子图 next: {sub_state.next}")

# 恢复
graph.invoke(Command(resume="回答"), config)
```

---

## 运行说明

1. Demo 1 不同 schema — 节点内调用
2. Demo 2 共享 schema — 添加为节点
3. Demo 3 两层嵌套
4. Demo 4 每次调用模式 — 中断
5. Demo 5 每线程模式 — 累积记忆
6. Demo 6 流式子图输出
7. Demo 7 查看子图状态
