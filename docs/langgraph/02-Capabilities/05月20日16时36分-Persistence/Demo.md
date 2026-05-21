# Persistence 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础检查点 — InMemorySaver

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    foo: str
    bar: Annotated[list[str], add]

def node_a(state: State) -> dict:
    print(f"[node_a] 输入: {state}")
    return {"foo": "a", "bar": ["a"]}

def node_b(state: State) -> dict:
    print(f"[node_b] 输入: {state}")
    return {"foo": "b", "bar": ["b"]}

workflow = StateGraph(State)
workflow.add_node("node_a", node_a)
workflow.add_node("node_b", node_b)
workflow.add_edge(START, "node_a")
workflow.add_edge("node_a", "node_b")
workflow.add_edge("node_b", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "1"}}
result = graph.invoke({"foo": "", "bar": []}, config)
print(f"\n最终结果: {result}")
```

---

## Demo 2：获取状态和历史

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    foo: str
    bar: Annotated[list[str], add]

def node_a(state: State) -> dict:
    return {"foo": "a", "bar": ["a"]}

def node_b(state: State) -> dict:
    return {"foo": "b", "bar": ["b"]}

workflow = StateGraph(State)
workflow.add_node("node_a", node_a)
workflow.add_node("node_b", node_b)
workflow.add_edge(START, "node_a")
workflow.add_edge("node_a", "node_b")
workflow.add_edge("node_b", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "2"}}
graph.invoke({"foo": "", "bar": []}, config)

# 获取最新状态
state = graph.get_state(config)
print(f"最新状态: {state.values}")
print(f"下一个节点: {state.next}")

# 获取历史
print("\n=== 状态历史 ===")
for snapshot in graph.get_state_history(config):
    print(f"步骤 {snapshot.metadata.get('step')}: {snapshot.values} | next={snapshot.next}")
```

---

## Demo 3：对话记忆 — thread_id

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    messages: Annotated[list[str], add]

def chat_node(state: State) -> dict:
    last = state["messages"][-1] if state["messages"] else ""
    return {"messages": [f"回复: {last}"]}

workflow = StateGraph(State)
workflow.add_node("chat", chat_node)
workflow.add_edge(START, "chat")
workflow.add_edge("chat", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)

# 第一轮对话
config = {"configurable": {"thread_id": "conv-1"}}
r1 = graph.invoke({"messages": ["你好"]}, config)
print(f"轮次1: {r1['messages']}")

# 第二轮（同一 thread_id，保留历史）
r2 = graph.invoke({"messages": ["今天天气怎么样？"]}, config)
print(f"轮次2: {r2['messages']}")

# 不同线程
config2 = {"configurable": {"thread_id": "conv-2"}}
r3 = graph.invoke({"messages": ["新对话"]}, config2)
print(f"新线程: {r3['messages']}")
```

---

## Demo 4：更新状态 — 分叉

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str
    history: Annotated[list[str], add]

def step_a(state: State) -> dict:
    return {"value": "A", "history": ["step_a"]}

def step_b(state: State) -> dict:
    return {"value": "B", "history": ["step_b"]}

workflow = StateGraph(State)
workflow.add_node("step_a", step_a)
workflow.add_node("step_b", step_b)
workflow.add_edge(START, "step_a")
workflow.add_edge("step_a", "step_b")
workflow.add_edge("step_b", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "fork-1"}}
result = graph.invoke({"value": "", "history": []}, config)
print(f"原始结果: {result}")

# 更新状态（分叉）
graph.update_state(config, {"value": "MODIFIED"})
new_state = graph.get_state(config)
print(f"更新后: {new_state.values}")
```

---

## Demo 5：Store — 跨线程记忆

```python
from langgraph.store.memory import InMemoryStore
import uuid

store = InMemoryStore()

# 用户 1 的记忆
user_id = "user_001"
namespace = (user_id, "memories")

store.put(namespace, str(uuid.uuid4()), {"food": "喜欢披萨"})
store.put(namespace, str(uuid.uuid4()), {"hobby": "喜欢编程"})
store.put(namespace, str(uuid.uuid4()), {"language": "中文"})

# 搜索记忆
memories = store.search(namespace)
print(f"用户 {user_id} 的记忆:")
for m in memories:
    print(f"  {m.key}: {m.value}")

# 用户 2 的记忆（隔离）
store.put(("user_002", "memories"), str(uuid.uuid4()), {"food": "喜欢寿司"})
print(f"\n用户 user_002 的记忆:")
for m in store.search(("user_002", "memories")):
    print(f"  {m.key}: {m.value}")
```

---

## Demo 6：Store + 图 — 跨线程对话

```python
from typing import TypedDict, Annotated
from operator import add
from dataclasses import dataclass
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.runtime import Runtime
import uuid

class MessagesState(TypedDict):
    messages: Annotated[list[str], add]

@dataclass
class Context:
    user_id: str

store = InMemoryStore()

def chat_node(state: MessagesState, runtime: Runtime[Context]) -> dict:
    user_id = runtime.context.user_id
    namespace = (user_id, "memories")

    # 读取记忆
    memories = runtime.store.search(namespace)
    mem_str = ", ".join(str(m.value) for m in memories) if memories else "无"

    last_msg = state["messages"][-1] if state["messages"] else ""

    # 保存新记忆
    if "我叫" in last_msg:
        runtime.store.put(namespace, str(uuid.uuid4()), {"name": last_msg})

    return {"messages": [f"记忆: {mem_str} | 回复: 收到 '{last_msg}'"]}

workflow = StateGraph(MessagesState, context_schema=Context)
workflow.add_node("chat", chat_node)
workflow.add_edge(START, "chat")
workflow.add_edge("chat", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer, store=store)

# 线程 1
config1 = {"configurable": {"thread_id": "t1"}}
r = graph.invoke({"messages": ["我叫小明"]}, config1, context=Context(user_id="u1"))
print(f"线程1: {r['messages'][-1]}")

# 线程 2（同一用户，共享记忆）
config2 = {"configurable": {"thread_id": "t2"}}
r = graph.invoke({"messages": ["你好"]}, config2, context=Context(user_id="u1"))
print(f"线程2: {r['messages'][-1]}")

# 不同用户（隔离）
config3 = {"configurable": {"thread_id": "t3"}}
r = graph.invoke({"messages": ["你好"]}, config3, context=Context(user_id="u2"))
print(f"用户2: {r['messages'][-1]}")
```

---

## Demo 7：语义搜索记忆

```python
from langgraph.store.memory import InMemoryStore
import uuid

# 模拟嵌入函数
def mock_embed(texts):
    results = []
    for t in texts:
        vec = [float(ord(c) % 10) / 10 for c in t[:5]]
        vec.extend([0.0] * (5 - len(vec)))
        results.append(vec)
    return results

store = InMemoryStore(index={"embed": mock_embed, "dims": 5, "fields": ["$"]})

namespace = ("user_1", "memories")
store.put(namespace, str(uuid.uuid4()), {"memory": "用户喜欢意大利菜"})
store.put(namespace, str(uuid.uuid4()), {"memory": "用户是 Python 开发者"})
store.put(namespace, str(uuid.uuid4()), {"memory": "用户在北京工作"})

# 语义搜索
results = store.search(namespace, query="用户喜欢什么食物", limit=2)
print("语义搜索 '用户喜欢什么食物':")
for r in results:
    print(f"  {r.value}")
```

---

## 运行说明

1. Demo 1 基础检查点
2. Demo 2 获取状态和历史
3. Demo 3 对话记忆
4. Demo 4 更新状态/分叉
5. Demo 5 Store 跨线程记忆
6. Demo 6 Store + 图集成
7. Demo 7 语义搜索
