# Event Streaming 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础事件流 — stream.messages

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage, AnyMessage

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]

def chat_node(state: State) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

builder = StateGraph(State)
builder.add_node("chat", chat_node)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)
graph = builder.compile()

# 使用 stream.messages 获取 token 流
stream = graph.stream_events(
    {"messages": [HumanMessage(content="用一句话介绍 Python")]},
    version="v3",
)

print("逐 token 输出: ")
for message in stream.messages:
    for token in message.text:
        print(token, end="", flush=True)
print()
```

---

## Demo 2：流式状态快照 — stream.values

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain.messages import HumanMessage, AnyMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]
    step: str

def step_1(state: State) -> dict:
    return {"step": "step_1 完成", "messages": [HumanMessage(content="步骤1处理中")]}

def step_2(state: State) -> dict:
    return {"step": "step_2 完成", "messages": [HumanMessage(content="步骤2处理中")]}

builder = StateGraph(State)
builder.add_node("step_1", step_1)
builder.add_node("step_2", step_2)
builder.add_edge(START, "step_1")
builder.add_edge("step_1", "step_2")
builder.add_edge("step_2", END)
graph = builder.compile()

# 使用 stream.values 获取每步状态
stream = graph.stream_events(
    {"messages": [HumanMessage(content="开始")], "step": "初始"},
    version="v3",
)

print("=== 状态快照 ===")
for snapshot in stream.values:
    print(f"step: {snapshot.get('step', 'N/A')}")

print(f"\n最终输出: {stream.output}")
```

---

## Demo 3：流式子图 — stream.subgraphs

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class SubState(TypedDict):
    data: str

def sub_node(state: SubState) -> dict:
    return {"data": f"子图处理: {state['data']}"}

sub_builder = StateGraph(SubState)
sub_builder.add_node("process", sub_node)
sub_builder.add_edge(START, "process")
sub_builder.add_edge("process", END)
subgraph = sub_builder.compile()

class MainState(TypedDict):
    result: str

def call_subgraph(state: MainState) -> dict:
    sub_result = subgraph.invoke({"data": "输入数据"})
    return {"result": sub_result["data"]}

main_builder = StateGraph(MainState)
main_builder.add_node("caller", call_subgraph)
main_builder.add_edge(START, "caller")
main_builder.add_edge("caller", END)
main_graph = main_builder.compile()

# 使用 stream.subgraphs 观察子图执行
stream = main_graph.stream_events({"result": ""}, version="v3")

print("=== 子图事件 ===")
for subgraph_event in stream.subgraphs:
    print(f"图名: {subgraph_event.graph_name}")
    print(f"路径: {subgraph_event.path}")
print(f"\n最终结果: {stream.output}")
```

---

## Demo 4：并发消费多个投影（异步）

```python
import asyncio
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain.messages import HumanMessage, AnyMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]

def chat(state: State) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(State)
builder.add_node("chat", chat)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)
graph = builder.compile()

async def main():
    stream = await graph.astream_events(
        {"messages": [HumanMessage(content="讲个笑话")]},
        version="v3",
    )

    async def consume_messages():
        async for message in stream.messages:
            print(f"[messages] token: {message.text[:20]}...")

    async def consume_values():
        async for snapshot in stream.values:
            print(f"[values] keys: {list(snapshot.keys())}")

    await asyncio.gather(consume_messages(), consume_values())

asyncio.run(main())
```

---

## Demo 5：交错消费 — stream.interleave

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain.messages import HumanMessage, AnyMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]

def chat(state: State) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(State)
builder.add_node("chat", chat)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)
graph = builder.compile()

# 使用 interleave 交错消费多个投影
stream = graph.stream_events(
    {"messages": [HumanMessage(content="你好")]},
    version="v3",
)

print("=== 交错消费 ===")
for name, item in stream.interleave("values", "messages"):
    if name == "values":
        print(f"[state] keys={list(item.keys())}")
    elif name == "messages":
        print(f"[llm] text={str(item.text)[:30]}...")
```

---

## Demo 6：原始协议事件

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain.messages import HumanMessage, AnyMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]

def chat(state: State) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(State)
builder.add_node("chat", chat)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)
graph = builder.compile()

# 直接迭代原始协议事件
stream = graph.stream_events(
    {"messages": [HumanMessage(content="Hi")]},
    version="v3",
)

print("=== 原始协议事件 ===")
event_count = 0
for event in stream:
    method = event["method"]
    namespace = event["params"]["namespace"]
    print(f"method={method}, namespace={namespace}")
    event_count += 1
    if event_count > 10:
        print("... (截断)")
        break
```

---

## Demo 7：自定义流转换器

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer
from langgraph.config import get_stream_writer
from langchain.messages import HumanMessage, AnyMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]

# 自定义转换器：统计 token 数
class TokenCounterTransformer(StreamTransformer):
    required_stream_modes = ("messages",)

    def __init__(self, scope=()):
        super().__init__(scope)
        self.count = 0
        self.token_log = StreamChannel[int]("token_count")

    def init(self):
        return {"token_count": self.token_log}

    def process(self, event: ProtocolEvent) -> bool:
        if event["method"] == "messages":
            data = event["params"]["data"]
            if isinstance(data, dict):
                usage = data.get("usage") or {}
                tokens = usage.get("output_tokens") or 0
                self.count += tokens
        return True

    def finalize(self):
        self.token_log.push(self.count)
        self.token_log.close()

def chat(state: State) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(State)
builder.add_node("chat", chat)
builder.add_edge(START, "chat")
builder.add_edge("chat", END)
graph = builder.compile()

# 注册自定义转换器
stream = graph.stream_events(
    {"messages": [HumanMessage(content="简短回答：什么是 Python?")]},
    version="v3",
    transformers=[TokenCounterTransformer],
)

for message in stream.messages:
    pass  # 消费消息

# 查看自定义扩展
print("=== 自定义投影 ===")
for count in stream.extensions["token_count"]:
    print(f"总 token 数: {count}")
```

---

## Demo 8：中断后恢复

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str
    approved: bool

def human_review(state: State) -> dict:
    # interrupt 暂停等待人类输入
    result = interrupt({"question": "请审批此操作", "value": state["value"]})
    return {"approved": result.get("approved", False)}

def process(state: State) -> dict:
    if state["approved"]:
        return {"value": f"已处理: {state['value']}"}
    return {"value": "已拒绝"}

builder = StateGraph(State)
builder.add_node("review", human_review)
builder.add_node("process", process)
builder.add_edge(START, "review")
builder.add_edge("review", "process")
builder.add_edge("process", END)

checkpointer = InMemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "demo-1"}}

# 第一次执行：会中断
stream = graph.stream_events(
    {"value": "删除数据库", "approved": False},
    version="v3",
    config=config,
)

for message in stream.messages:
    print(f"[消息] {message.text}")

if stream.interrupted:
    print(f"[中断] {stream.interrupts}")

    # 恢复执行
    stream = graph.stream_events(
        Command(resume={"approved": True}),
        version="v3",
        config=config,
    )
    print(f"最终结果: {stream.output}")
```

---

## 运行说明

1. Demo 1 基础消息流
2. Demo 2 状态快照流
3. Demo 3 子图流
4. Demo 4 异步并发消费
5. Demo 5 交错消费
6. Demo 6 原始协议事件
7. Demo 7 自定义转换器
8. Demo 8 中断恢复
