# Time Travel 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础重放

```python
from typing import TypedDict, NotRequired
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    topic: NotRequired[str]
    joke: NotRequired[str]

def generate_topic(state: State) -> dict:
    print("[generate_topic] 执行")
    return {"topic": "袜子在烘干机里消失"}

def write_joke(state: State) -> dict:
    print(f"[write_joke] 为 '{state['topic']}' 写笑话")
    return {"joke": f"为什么 {state['topic']}？因为它们私奔了！"}

graph = (
    StateGraph(State)
    .add_node("generate_topic", generate_topic)
    .add_node("write_joke", write_joke)
    .add_edge(START, "generate_topic")
    .add_edge("generate_topic", "write_joke")
    .add_edge("write_joke", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "replay-1"}}

# 首次运行
print("=== 首次运行 ===")
result = graph.invoke({}, config)
print(f"结果: {result['joke']}")

# 查看历史
print("\n=== 检查点历史 ===")
history = list(graph.get_state_history(config))
for s in history:
    print(f"next={s.next}, step={s.metadata.get('step')}")

# 从 write_joke 之前重放
print("\n=== 重放 ===")
before_joke = next(s for s in history if s.next == ("write_joke",))
replay_result = graph.invoke(None, before_joke.config)
print(f"重放结果: {replay_result['joke']}")
```

---

## Demo 2：分叉 — 修改状态

```python
from typing import TypedDict, NotRequired
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    topic: NotRequired[str]
    joke: NotRequired[str]

def generate_topic(state: State) -> dict:
    return {"topic": "袜子"}

def write_joke(state: State) -> dict:
    return {"joke": f"关于 {state['topic']} 的笑话"}

graph = (
    StateGraph(State)
    .add_node("generate_topic", generate_topic)
    .add_node("write_joke", write_joke)
    .add_edge(START, "generate_topic")
    .add_edge("generate_topic", "write_joke")
    .add_edge("write_joke", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "fork-1"}}

# 首次运行
result = graph.invoke({}, config)
print(f"原始结果: {result['joke']}")

# 分叉：修改主题
history = list(graph.get_state_history(config))
before_joke = next(s for s in history if s.next == ("write_joke",))

fork_config = graph.update_state(
    before_joke.config,
    values={"topic": "鸡"},  # 修改主题
)

# 从分叉恢复
fork_result = graph.invoke(None, fork_config)
print(f"分叉结果: {fork_result['joke']}")
```

---

## Demo 3：指定 as_node

```python
from typing import TypedDict, NotRequired
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    data: NotRequired[str]
    result: NotRequired[str]

def step_a(state: State) -> dict:
    print("[step_a] 执行")
    return {"data": "来自 A 的数据"}

def step_b(state: State) -> dict:
    print("[step_b] 执行")
    return {"result": f"处理: {state.get('data', '无数据')}"}

graph = (
    StateGraph(State)
    .add_node("step_a", step_a)
    .add_node("step_b", step_b)
    .add_edge(START, "step_a")
    .add_edge("step_a", "step_b")
    .add_edge("step_b", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "as-node-1"}}

# 首次运行
result = graph.invoke({}, config)
print(f"原始结果: {result['result']}")

# 分叉并指定 as_node
history = list(graph.get_state_history(config))
before_b = next(s for s in history if s.next == ("step_b",))

# 指定 as_node="step_a"，让图认为 step_a 产生了这个更新
fork_config = graph.update_state(
    before_b.config,
    values={"data": "分叉的数据"},
    as_node="step_a",
)

fork_result = graph.invoke(None, fork_config)
print(f"分叉结果: {fork_result['result']}")
```

---

## Demo 4：中断 + 重放

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: list[str]

def ask_human(state: State) -> dict:
    answer = interrupt("你叫什么名字?")
    return {"value": [f"你好, {answer}!"]}

def final_step(state: State) -> dict:
    return {"value": state["value"] + ["完成"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .add_edge("final_step", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "interrupt-replay-1"}}

# 首次运行
print("=== 首次运行 ===")
graph.invoke({"value": []}, config)

# 恢复
graph.invoke(Command(resume="Alice"), config)

# 查看历史
history = list(graph.get_state_history(config))
print(f"历史长度: {len(history)}")

# 从 ask_human 之前重放
print("\n=== 重放 ===")
before_ask = [s for s in history if s.next == ("ask_human",)][-1]
graph.invoke(None, before_ask.config)
# 再次中断

# 用不同答案恢复
graph.invoke(Command(resume="Bob"))
print("用不同名字恢复完成")
```

---

## Demo 5：中断 + 分叉

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: list[str]

def ask_human(state: State) -> dict:
    answer = interrupt("你叫什么名字?")
    return {"value": state["value"] + [f"名字: {answer}"]}

def process(state: State) -> dict:
    return {"value": state["value"] + ["处理完成"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("process", process)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "process")
    .add_edge("process", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "interrupt-fork-1"}}

# 首次运行
print("=== 首次运行 ===")
graph.invoke({"value": []}, config)
graph.invoke(Command(resume="Alice"), config)
print("原始完成")

# 分叉：从 ask_human 之前开始，用不同值
print("\n=== 分叉 ===")
history = list(graph.get_state_history(config))
before_ask = [s for s in history if s.next == ("ask_human",)][-1]

fork_config = graph.update_state(before_ask.config, {"value": ["分叉版本"]})
graph.invoke(None, fork_config)
graph.invoke(Command(resume="Bob"), fork_config)
print("分叉完成")
```

---

## Demo 6：多个中断分叉

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    answers: list[str]

def ask_name(state: State) -> dict:
    name = interrupt("你叫什么名字?")
    return {"answers": state["answers"] + [f"名字:{name}"]}

def ask_age(state: State) -> dict:
    age = interrupt("你多大了?")
    return {"answers": state["answers"] + [f"年龄:{age}"]}

def final(state: State) -> dict:
    return {"answers": state["answers"] + ["完成"]}

graph = (
    StateGraph(State)
    .add_node("ask_name", ask_name)
    .add_node("ask_age", ask_age)
    .add_node("final", final)
    .add_edge(START, "ask_name")
    .add_edge("ask_name", "ask_age")
    .add_edge("ask_age", "final")
    .add_edge("final", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "multi-interrupt-1"}}

# 完成两个中断
print("=== 原始执行 ===")
graph.invoke({"answers": []}, config)
graph.invoke(Command(resume="Alice"), config)
graph.invoke(Command(resume=25), config)
print("原始完成")

# 从两个中断之间分叉（只改年龄，保留名字）
print("\n=== 分叉（只改年龄）===")
history = list(graph.get_state_history(config))
between = [s for s in history if s.next == ("ask_age",)][-1]

fork_config = graph.update_state(between.config, {"answers": ["名字:已保留"]})
graph.invoke(None, fork_config)
graph.invoke(Command(resume=30), fork_config)  # 新年龄
print("分叉完成")
```

---

## Demo 7：子图时间旅行 — 继承检查点器

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def sub_step_a(state: State) -> dict:
    print("[sub_step_a] 执行")
    return {"value": f"{state['value']} -> 子A"}

def sub_step_b(state: State) -> dict:
    print("[sub_step_b] 执行")
    return {"value": f"{state['value']} -> 子B"}

subgraph = (
    StateGraph(State)
    .add_node("sub_a", sub_step_a)
    .add_node("sub_b", sub_step_b)
    .add_edge(START, "sub_a")
    .add_edge("sub_a", "sub_b")
    .add_edge("sub_b", END)
    .compile()  # 无检查点器，继承父图
)

def parent_node(state: State) -> dict:
    result = subgraph.invoke({"value": state["value"]})
    return {"value": result["value"]}

graph = (
    StateGraph(State)
    .add_node("parent", parent_node)
    .add_edge(START, "parent")
    .add_edge("parent", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "subgraph-1"}}

# 首次运行
result = graph.invoke({"value": "开始"}, config)
print(f"结果: {result['value']}")

# 从父图级别分叉
history = list(graph.get_state_history(config))
before_parent = next(s for s in history if s.next == ("parent",))

fork_config = graph.update_state(before_parent.config, {"value": "分叉"})
fork_result = graph.invoke(None, fork_config)
print(f"分叉结果: {fork_result['value']}")
```

---

## Demo 8：子图时间旅行 — 独立检查点器

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: list[str]

def sub_step_a(state: State) -> dict:
    answer = interrupt("子图问题 A:")
    return {"value": state["value"] + [f"子A:{answer}"]}

def sub_step_b(state: State) -> dict:
    answer = interrupt("子图问题 B:")
    return {"value": state["value"] + [f"子B:{answer}"]}

subgraph = (
    StateGraph(State)
    .add_node("sub_a", sub_step_a)
    .add_node("sub_b", sub_step_b)
    .add_edge(START, "sub_a")
    .add_edge("sub_a", "sub_b")
    .add_edge("sub_b", END)
    .compile(checkpointer=True)  # 独立检查点器
)

def parent_node(state: State) -> dict:
    result = subgraph.invoke({"value": state["value"]})
    return {"value": result["value"]}

graph = (
    StateGraph(State)
    .add_node("parent", parent_node)
    .add_edge(START, "parent")
    .add_edge("parent", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "subgraph-checkpoint-1"}}

# 运行到 sub_a 中断
print("=== 运行到 sub_a 中断 ===")
graph.invoke({"value": []}, config)

# 恢复 sub_a -> 命中 sub_b 中断
print("=== 恢复 sub_a ===")
graph.invoke(Command(resume="Alice"), config)

# 获取子图检查点
print("=== 获取子图检查点 ===")
parent_state = graph.get_state(config, subgraphs=True)
sub_config = parent_state.tasks[0].state.config

# 从子图检查点分叉
print("=== 从子图分叉 ===")
fork_config = graph.update_state(sub_config, {"value": ["分叉版本"]})
graph.invoke(None, fork_config)
graph.invoke(Command(resume="新答案"), fork_config)
print("子图分叉完成")
```

---

## 运行说明

1. Demo 1 基础重放
2. Demo 2 分叉修改状态
3. Demo 3 指定 as_node
4. Demo 4 中断 + 重放
5. Demo 5 中断 + 分叉
6. Demo 6 多个中断分叉
7. Demo 7 子图继承检查点器
8. Demo 8 子图独立检查点器
