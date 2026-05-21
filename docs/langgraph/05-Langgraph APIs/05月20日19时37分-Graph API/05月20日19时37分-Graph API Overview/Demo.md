# Graph API Overview 功能 Demo

## 环境准备

```bash
pip install langgraph
```

---

## Demo 1：基础 State + Node + Edge

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    value: str

def node_a(state: State) -> dict:
    return {"value": f"{state['value']} -> A"}

def node_b(state: State) -> dict:
    return {"value": f"{state['value']} -> B"}

graph = (
    StateGraph(State)
    .add_node("a", node_a)
    .add_node("b", node_b)
    .add_edge(START, "a")
    .add_edge("a", "b")
    .add_edge("b", END)
    .compile()
)

result = graph.invoke({"value": "开始"})
print(result["value"])  # 开始 -> A -> B
```

---

## Demo 2：Reducer — 消息追加

```python
from typing import Annotated, TypedDict
from operator import add
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[str], add]

def node_a(state: State) -> dict:
    return {"messages": ["消息A"]}

def node_b(state: State) -> dict:
    return {"messages": ["消息B"]}

graph = (
    StateGraph(State)
    .add_node("a", node_a)
    .add_node("b", node_b)
    .add_edge(START, "a")
    .add_edge("a", "b")
    .add_edge("b", END)
    .compile()
)

result = graph.invoke({"messages": ["初始"]})
print(result["messages"])  # ['初始', '消息A', '消息B']
```

---

## Demo 3：条件边

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    value: int
    result: str

def process(state: State) -> dict:
    return {"value": state["value"]}

def positive(state: State) -> dict:
    return {"result": f"正数: {state['value']}"}

def negative(state: State) -> dict:
    return {"result": f"负数: {state['value']}"}

def route(state: State) -> str:
    return "positive" if state["value"] >= 0 else "negative"

graph = (
    StateGraph(State)
    .add_node("process", process)
    .add_node("positive", positive)
    .add_node("negative", negative)
    .add_edge(START, "process")
    .add_conditional_edges("process", route)
    .add_edge("positive", END)
    .add_edge("negative", END)
    .compile()
)

print(graph.invoke({"value": 5, "result": ""}))
print(graph.invoke({"value": -3, "result": ""}))
```

---

## Demo 4：并行执行

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    results: Annotated[list[str], add]

def task_a(state: State) -> dict:
    return {"results": ["A完成"]}

def task_b(state: State) -> dict:
    return {"results": ["B完成"]}

def task_c(state: State) -> dict:
    return {"results": ["C完成"]}

def combine(state: State) -> dict:
    return {"results": [f"合并: {state['results']}"]}

graph = (
    StateGraph(State)
    .add_node("a", task_a)
    .add_node("b", task_b)
    .add_node("c", task_c)
    .add_node("combine", combine)
    .add_edge(START, "a")
    .add_edge(START, "b")
    .add_edge(START, "c")
    .add_edge("a", "combine")
    .add_edge("b", "combine")
    .add_edge("c", "combine")
    .add_edge("combine", END)
    .compile()
)

result = graph.invoke({"results": []})
print(result["results"])
```

---

## Demo 5：Command 控制流

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

class State(TypedDict):
    action: str
    result: str

def decide(state: State) -> Command[Literal["approve", "reject"]]:
    if state["action"] == "approve":
        return Command(update={"result": "已批准"}, goto="approve")
    return Command(update={"result": "已拒绝"}, goto="reject")

def approve(state: State) -> dict:
    return {"result": f"{state['result']} - 执行中"}

def reject(state: State) -> dict:
    return {"result": f"{state['result']} - 终止"}

graph = (
    StateGraph(State)
    .add_node("decide", decide)
    .add_node("approve", approve)
    .add_node("reject", reject)
    .add_edge(START, "decide")
    .add_edge("approve", END)
    .add_edge("reject", END)
    .compile()
)

print(graph.invoke({"action": "approve", "result": ""}))
print(graph.invoke({"action": "reject", "result": ""}))
```

---

## Demo 6：Send Map-Reduce

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

class State(TypedDict):
    items: list[str]
    results: Annotated[list[str], add]

def fan_out(state: State):
    return [Send("process", {"item": item, "results": []}) for item in state["items"]]

class WorkerState(TypedDict):
    item: str
    results: Annotated[list[str], add]

def process(state: WorkerState) -> dict:
    return {"results": [f"处理: {state['item']}"]}

def combine(state: State) -> dict:
    return {"results": [f"合并完成: {len(state['results'])}项"]}

graph = (
    StateGraph(State)
    .add_node("process", process)
    .add_node("combine", combine)
    .add_conditional_edges(START, fan_out, ["process"])
    .add_edge("process", "combine")
    .add_edge("combine", END)
    .compile()
)

result = graph.invoke({"items": ["苹果", "香蕉", "橙子"], "results": []})
print(result["results"])
```

---

## Demo 7：运行时上下文

```python
from typing import TypedDict
from dataclasses import dataclass
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime

class State(TypedDict):
    result: str

@dataclass
class Context:
    user_id: str

def greet(state: State, runtime: Runtime[Context]) -> dict:
    return {"result": f"你好, {runtime.context.user_id}!"}

graph = (
    StateGraph(State, context_schema=Context)
    .add_node("greet", greet)
    .add_edge(START, "greet")
    .add_edge("greet", END)
    .compile()
)

print(graph.invoke({"result": ""}, context=Context(user_id="小明")))
```

---

## Demo 8：节点缓存

```python
import time
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import CachePolicy
from langgraph.cache.memory import InMemoryCache

class State(TypedDict):
    x: int
    result: int

def expensive_node(state: State) -> dict:
    time.sleep(1)  # 模拟耗时计算
    return {"result": state["x"] * 2}

graph = (
    StateGraph(State)
    .add_node("compute", expensive_node, cache_policy=CachePolicy(ttl=60))
    .add_edge(START, "compute")
    .add_edge("compute", END)
    .compile(cache=InMemoryCache())
)

# 第一次：耗时
start = time.time()
print(graph.invoke({"x": 5, "result": 0}))
print(f"耗时: {time.time() - start:.1f}s")

# 第二次：缓存
start = time.time()
print(graph.invoke({"x": 5, "result": 0}))
print(f"耗时: {time.time() - start:.1f}s")
```

---

## 运行说明

1. Demo 1 基础组件
2. Demo 2 Reducer
3. Demo 3 条件边
4. Demo 4 并行执行
5. Demo 5 Command
6. Demo 6 Send Map-Reduce
7. Demo 7 运行时上下文
8. Demo 8 节点缓存
