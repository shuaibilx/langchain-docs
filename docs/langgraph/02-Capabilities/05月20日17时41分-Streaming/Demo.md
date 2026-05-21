# Streaming 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：updates 模式 — 状态增量

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    topic: str
    joke: str

def refine_topic(state: State) -> dict:
    return {"topic": state["topic"] + " and cats"}

def generate_joke(state: State) -> dict:
    return {"joke": f"This is a joke about {state['topic']}"}

graph = (
    StateGraph(State)
    .add_node(refine_topic)
    .add_node(generate_joke)
    .add_edge(START, "refine_topic")
    .add_edge("refine_topic", "generate_joke")
    .add_edge("generate_joke", END)
    .compile()
)

print("=== updates 模式 ===")
for chunk in graph.stream(
    {"topic": "ice cream"},
    stream_mode="updates",
    version="v2",
):
    if chunk["type"] == "updates":
        for node_name, state in chunk["data"].items():
            print(f"Node `{node_name}` updated: {state}")
```

---

## Demo 2：values 模式 — 完整状态

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    topic: str
    joke: str

def refine_topic(state: State) -> dict:
    return {"topic": state["topic"] + " and cats"}

def generate_joke(state: State) -> dict:
    return {"joke": f"This is a joke about {state['topic']}"}

graph = (
    StateGraph(State)
    .add_node(refine_topic)
    .add_node(generate_joke)
    .add_edge(START, "refine_topic")
    .add_edge("refine_topic", "generate_joke")
    .add_edge("generate_joke", END)
    .compile()
)

print("=== values 模式 ===")
for chunk in graph.stream(
    {"topic": "ice cream"},
    stream_mode="values",
    version="v2",
):
    if chunk["type"] == "values":
        print(f"topic: {chunk['data']['topic']}, joke: {chunk['data'].get('joke', '')}")
```

---

## Demo 3：messages 模式 — LLM Token 流

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    topic: str
    joke: str

def call_model(state: State) -> dict:
    response = llm.invoke([HumanMessage(content=f"Write a joke about {state['topic']}")])
    return {"joke": response.content}

graph = (
    StateGraph(State)
    .add_node(call_model)
    .add_edge(START, "call_model")
    .add_edge("call_model", END)
    .compile()
)

print("=== messages 模式 ===")
for chunk in graph.stream(
    {"topic": "cats"},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        if msg.content:
            print(msg.content, end="|", flush=True)
print()
```

---

## Demo 4：按节点过滤 messages

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    topic: str
    joke: str
    poem: str

def write_joke(state: State) -> dict:
    response = llm.invoke([HumanMessage(content=f"Write a joke about {state['topic']}")])
    return {"joke": response.content}

def write_poem(state: State) -> dict:
    response = llm.invoke([HumanMessage(content=f"Write a poem about {state['topic']}")])
    return {"poem": response.content}

graph = (
    StateGraph(State)
    .add_node(write_joke)
    .add_node(write_poem)
    .add_edge(START, "write_joke")
    .add_edge(START, "write_poem")
    .compile()
)

print("=== 按节点过滤（仅 poem）===")
for chunk in graph.stream(
    {"topic": "cats"},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        if msg.content and metadata.get("langgraph_node") == "write_poem":
            print(msg.content, end="|", flush=True)
print()
```

---

## Demo 5：custom 模式 — 自定义数据

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    query: str
    result: str

def process_node(state: State) -> dict:
    writer = get_stream_writer()
    writer({"status": "开始处理...", "progress": 0})
    # 模拟处理
    writer({"status": "处理中...", "progress": 50})
    writer({"status": "完成!", "progress": 100})
    return {"result": f"已处理: {state['query']}"}

graph = (
    StateGraph(State)
    .add_node(process_node)
    .add_edge(START, "process_node")
    .add_edge("process_node", END)
    .compile()
)

print("=== custom 模式 ===")
for chunk in graph.stream(
    {"query": "测试数据"},
    stream_mode="custom",
    version="v2",
):
    if chunk["type"] == "custom":
        print(f"自定义事件: {chunk['data']}")
```

---

## Demo 6：多模式同时使用

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    topic: str
    result: str

def process(state: State) -> dict:
    writer = get_stream_writer()
    writer({"status": "processing"})
    return {"result": f"Done with {state['topic']}"}

graph = (
    StateGraph(State)
    .add_node(process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
)

print("=== 多模式（updates + custom）===")
for chunk in graph.stream(
    {"topic": "test"},
    stream_mode=["updates", "custom"],
    version="v2",
):
    if chunk["type"] == "updates":
        for node_name, state in chunk["data"].items():
            print(f"[updates] {node_name}: {state}")
    elif chunk["type"] == "custom":
        print(f"[custom] {chunk['data']}")
```

---

## Demo 7：子图流式传输

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 子图
class SubState(TypedDict):
    data: str

def sub_node(state: SubState) -> dict:
    return {"data": f"子图处理: {state['data']}"}

sub_builder = StateGraph(SubState)
sub_builder.add_node(sub_node)
sub_builder.add_edge(START, sub_node)
sub_builder.add_edge(sub_node, END)
subgraph = sub_builder.compile()

# 父图
class MainState(TypedDict):
    result: str

def call_sub(state: MainState) -> dict:
    sub_result = subgraph.invoke({"data": "输入"})
    return {"result": sub_result["data"]}

main_builder = StateGraph(MainState)
main_builder.add_node("caller", call_sub)
main_builder.add_edge(START, "caller")
main_builder.add_edge("caller", END)
main_graph = main_builder.compile()

print("=== 子图流式传输 ===")
for chunk in main_graph.stream(
    {"result": ""},
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

## Demo 8：invoke v2 格式

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import GraphOutput

class State(TypedDict):
    value: str

def process(state: State) -> dict:
    return {"value": f"处理: {state['value']}"}

graph = (
    StateGraph(State)
    .add_node(process)
    .add_edge(START, process)
    .add_edge(process, END)
    .compile()
)

print("=== invoke v2 格式 ===")
result = graph.invoke({"value": "测试"}, version="v2")

print(f"类型: {type(result)}")
print(f"值: {result.value}")
print(f"中断: {result.interrupts}")

# v1 格式（仍然兼容）
result_v1 = graph.invoke({"value": "测试"})
print(f"\nv1 类型: {type(result_v1)}")
print(f"v1 值: {result_v1}")
```

---

## Demo 9：nostream 标签

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

# 可流式传输的模型
stream_model = ChatOpenAI(model="gpt-4o-mini")
# 不流式传输的模型（内部处理用）
internal_model = ChatOpenAI(model="gpt-4o-mini").with_config({"tags": ["nostream"]})

class State(TypedDict):
    topic: str
    answer: str
    notes: str

def answer(state: State) -> dict:
    r = stream_model.invoke([HumanMessage(content=f"Reply briefly about {state['topic']}")])
    return {"answer": r.content}

def internal_notes(state: State) -> dict:
    # 此模型的 token 不会出现在 messages 流中
    r = internal_model.invoke([HumanMessage(content=f"Private notes on {state['topic']}")])
    return {"notes": r.content}

graph = (
    StateGraph(State)
    .add_node("answer", answer)
    .add_node("notes", internal_notes)
    .add_edge(START, "answer")
    .add_edge("answer", "notes")
    .compile()
)

print("=== nostream 标签（仅流式 answer 节点）===")
for chunk in graph.stream(
    {"topic": "AI", "answer": "", "notes": ""},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        if msg.content:
            print(msg.content, end="|", flush=True)
print()
```

---

## 运行说明

1. Demo 1 updates 模式
2. Demo 2 values 模式
3. Demo 3 messages 模式
4. Demo 4 按节点过滤
5. Demo 5 custom 模式
6. Demo 6 多模式
7. Demo 7 子图流式传输
8. Demo 8 invoke v2 格式
9. Demo 9 nostream 标签
