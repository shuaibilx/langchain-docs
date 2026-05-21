# 使用 Functional API - Demo

## Demo 1: 基础工作流 - 数字分类

```python
from langchain_core.utils.uuid import uuid7
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

@task
def is_even(number: int) -> bool:
    return number % 2 == 0

@task
def format_message(is_even: bool) -> str:
    return "The number is even." if is_even else "The number is odd."

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def workflow(inputs: dict) -> str:
    even = is_even(inputs["number"]).result()
    return format_message(even).result()

config = {"configurable": {"thread_id": str(uuid7())}}
print(workflow.invoke({"number": 7}, config=config))  # "The number is odd."
```

## Demo 2: 并行 LLM 调用

```python
import uuid
from langchain.chat_models import init_chat_model
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

model = init_chat_model("gpt-3.5-turbo")

@task
def generate_paragraph(topic: str) -> str:
    response = model.invoke([
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": f"Write a paragraph about {topic}."}
    ])
    return response.content

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def workflow(topics: list[str]) -> str:
    futures = [generate_paragraph(topic) for topic in topics]
    paragraphs = [f.result() for f in futures]
    return "\n\n".join(paragraphs)

config = {"configurable": {"thread_id": str(uuid7())}}
result = workflow.invoke(["quantum computing", "climate change"], config=config)
print(result)
```

## Demo 3: 从 Functional API 调用 Graph API 图

```python
from typing import TypedDict
from langgraph.func import entrypoint
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph

class State(TypedDict):
    foo: int

def double(state: State) -> State:
    return {"foo": state["foo"] * 2}

builder = StateGraph(State)
builder.add_node("double", double)
builder.set_entry_point("double")
graph = builder.compile()

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def workflow(x: int) -> dict:
    result = graph.invoke({"foo": x})
    return {"bar": result["foo"]}

config = {"configurable": {"thread_id": str(uuid7())}}
print(workflow.invoke(5, config=config))  # {'bar': 10}
```

## Demo 4: 人机交互 - 文章审核

```python
from langgraph.func import entrypoint, task
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

@task
def write_essay(topic: str) -> str:
    return f"An essay about {topic}"

@task
def get_review(essay: str) -> dict:
    is_approved = interrupt({"essay": essay, "action": "Please approve/reject"})
    return {"essay": essay, "approved": is_approved}

@task
def publish(essay: str) -> str:
    return f"Published: {essay}"

@entrypoint(checkpointer=InMemorySaver())
def workflow(topic: str) -> dict:
    essay = write_essay(topic).result()
    review = get_review(essay).result()
    if review["approved"]:
        result = publish(essay).result()
        return {"status": "published", "result": result}
    return {"status": "rejected", "essay": essay}

config = {"configurable": {"thread_id": "review-1"}}

# 执行 - 会中断
for item in workflow.stream("AI", config):
    print(item)

# 恢复 - 批准
for item in workflow.stream(Command(resume=True), config):
    print(item)
```

## Demo 5: 重试策略

```python
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy

attempts = 0

@task(retry_policy=RetryPolicy(retry_on=ValueError))
def unreliable_api():
    global attempts
    attempts += 1
    if attempts < 3:
        raise ValueError(f"Attempt {attempts} failed")
    return "Success!"

@entrypoint()
def workflow(inputs):
    return unreliable_api().result()

print(workflow.invoke({}))  # "Success!"
```

## Demo 6: 任务缓存

```python
import time
from langgraph.cache.memory import InMemoryCache
from langgraph.func import entrypoint, task
from langgraph.types import CachePolicy

call_count = 0

@task(cache_policy=CachePolicy(ttl=60))
def expensive_computation(x: int) -> int:
    global call_count
    call_count += 1
    time.sleep(1)  # 模拟耗时操作
    return x * x

@entrypoint(cache=InMemoryCache())
def workflow(inputs: dict) -> dict:
    r1 = expensive_computation(inputs["x"]).result()
    r2 = expensive_computation(inputs["x"]).result()  # 缓存命中
    return {"result": r1, "call_count": call_count}

for chunk in workflow.stream({"x": 5}, stream_mode="updates"):
    print(chunk)
# 第二次调用标记为 cached: True
# call_count 为 1（只实际调用了一次）
```

## Demo 7: 流式传输自定义数据

```python
from langgraph.func import entrypoint
from langgraph.config import get_stream_writer
from langgraph.checkpoint.memory import InMemorySaver

@entrypoint(checkpointer=InMemorySaver())
def workflow(inputs: dict) -> int:
    writer = get_stream_writer()
    writer("Starting computation...")
    result = inputs["x"] * 2
    writer(f"Intermediate: {result}")
    result += 10
    writer(f"Final: {result}")
    return result

config = {"configurable": {"thread_id": "stream-1"}}

for mode, chunk in workflow.stream(
    {"x": 5},
    stream_mode=["custom", "updates"],
    config=config
):
    print(f"[{mode}] {chunk}")
# [custom] Starting computation...
# [custom] Intermediate: 10
# [custom] Final: 20
# [updates] {'workflow': 20}
```

## Demo 8: Chatbot with 记忆

```python
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import add_messages
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

# 假设已初始化 model
model = ...

@task
def call_model(messages: list[BaseMessage]):
    return model.invoke(messages)

@entrypoint(checkpointer=InMemorySaver())
def chatbot(inputs: list[BaseMessage], *, previous: list[BaseMessage] = None):
    if previous:
        inputs = add_messages(previous, inputs)
    response = call_model(inputs).result()
    return entrypoint.final(value=response, save=add_messages(inputs, response))

config = {"configurable": {"thread_id": "chat-1"}}

# 第一轮对话
for chunk in chatbot.stream(
    [HumanMessage(content="hi! I'm bob")],
    config,
    stream_mode="values"
):
    chunk.pretty_print()

# 第二轮对话 - 机器人记得你的名字
for chunk in chatbot.stream(
    [HumanMessage(content="what's my name?")],
    config,
    stream_mode="values"
):
    chunk.pretty_print()
# AI: "Your name is Bob."
```

## Demo 9: 调用其他 Entrypoint

```python
from langgraph.func import entrypoint
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()

@entrypoint()
def multiply(inputs: dict) -> int:
    return inputs["a"] * inputs["b"]

@entrypoint()
def add(inputs: dict) -> int:
    return inputs["a"] + inputs["b"]

@entrypoint(checkpointer=checkpointer)
def calculator(inputs: dict) -> dict:
    product = multiply.invoke({"a": inputs["x"], "b": inputs["y"]})
    total = add.invoke({"a": inputs["x"], "b": inputs["y"]})
    return {"product": product, "sum": total}

config = {"configurable": {"thread_id": str(uuid7())}}
print(calculator.invoke({"x": 6, "y": 7}, config=config))
# {'product': 42, 'sum': 13}
```
