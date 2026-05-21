# Functional API 概述 - Demo

## Demo 1: 基础工作流 + 人机交互

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint, task
from langgraph.types import interrupt, Command

@task
def write_essay(topic: str) -> str:
    """模拟长时间运行的任务"""
    return f"An essay about topic: {topic}"

@task
def review_essay(essay: str) -> dict:
    """中断以获取人工审核"""
    is_approved = interrupt({
        "essay": essay,
        "action": "Please approve/reject the essay",
    })
    return {"essay": essay, "is_approved": is_approved}

@entrypoint(checkpointer=InMemorySaver())
def workflow(topic: str) -> dict:
    essay = write_essay(topic).result()
    return review_essay(essay).result()

# 执行
config = {"configurable": {"thread_id": "demo-1"}}
for item in workflow.stream("cat", config):
    print(item)
# 输出:
# {'write_essay': 'An essay about topic: cat'}
# {'__interrupt__': (Interrupt(value={'essay': '...', 'action': '...'}, id='...'),)}

# 恢复
for item in workflow.stream(Command(resume=True), config):
    print(item)
# 输出:
# {'review_essay': {'essay': '...', 'is_approved': True}}
# {'workflow': {'essay': '...', 'is_approved': True}}
```

## Demo 2: 并行执行 Task

```python
from langgraph.func import entrypoint, task

@task
def fetch_data(source: str) -> str:
    """模拟 API 调用"""
    return f"Data from {source}"

@entrypoint()
def parallel_workflow(sources: list[str]) -> list[str]:
    futures = [fetch_data(s) for s in sources]
    return [f.result() for f in futures]

result = parallel_workflow.invoke(["api-1", "api-2", "api-3"])
print(result)
# 输出: ['Data from api-1', 'Data from api-2', 'Data from api-3']
```

## Demo 3: 短期记忆 (previous)

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint

@entrypoint(checkpointer=InMemorySaver())
def counter(number: int, *, previous: int = None) -> int:
    previous = previous or 0
    return number + previous

config = {"configurable": {"thread_id": "counter-1"}}
print(counter.invoke(1, config))  # 1
print(counter.invoke(2, config))  # 3 (1 + 2)
print(counter.invoke(3, config))  # 6 (3 + 3)
```

## Demo 4: entrypoint.final 解耦返回值和保存值

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint

@entrypoint(checkpointer=InMemorySaver())
def accumulate(n: int, *, previous: int = None) -> entrypoint.final[int, int]:
    previous = previous or 0
    total = previous + n
    # 返回 previous 给调用者，保存 total 到检查点
    return entrypoint.final(value=previous, save=total)

config = {"configurable": {"thread_id": "acc-1"}}
print(accumulate.invoke(1, config))  # 0 (previous was None)
print(accumulate.invoke(2, config))  # 1 (previous was 1)
print(accumulate.invoke(3, config))  # 3 (previous was 1+2=3)
```

## Demo 5: Task 重试策略

```python
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy

attempts = 0

retry_policy = RetryPolicy(retry_on=ValueError)

@task(retry_policy=retry_policy)
def unreliable_api():
    global attempts
    attempts += 1
    if attempts < 3:
        raise ValueError("API failure")
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

@task(cache_policy=CachePolicy(ttl=120))
def slow_add(x: int) -> int:
    time.sleep(1)
    return x * 2

@entrypoint(cache=InMemoryCache())
def main(inputs: dict) -> dict:
    result1 = slow_add(inputs["x"]).result()
    result2 = slow_add(inputs["x"]).result()
    return {"result1": result1, "result2": result2}

for chunk in main.stream({"x": 5}, stream_mode="updates"):
    print(chunk)
# 第二次调用标记为 cached: True
```

## Demo 7: 调用 Graph API 图

```python
from typing import TypedDict
from langgraph.func import entrypoint
from langgraph.graph import StateGraph

class State(TypedDict):
    foo: int

def double(state: State) -> State:
    return {"foo": state["foo"] * 2}

builder = StateGraph(State)
builder.add_node("double", double)
builder.set_entry_point("double")
graph = builder.compile()

@entrypoint()
def workflow(x: int) -> dict:
    result = graph.invoke({"foo": x})
    return {"bar": result["foo"]}

print(workflow.invoke(5))  # {'bar': 10}
```

## Demo 8: Chatbot with 短期记忆

```python
from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

model = ...  # 你的 LLM

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
# 第一轮
for chunk in chatbot.stream([{"role": "user", "content": "hi! I'm bob"}], config):
    print(chunk)
# 第二轮 - 记住之前的对话
for chunk in chatbot.stream([{"role": "user", "content": "what's my name?"}], config):
    print(chunk)
# AI 会回答 "Your name is Bob"
```
