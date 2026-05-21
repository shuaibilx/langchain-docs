# Fault Tolerance 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础重试 — RetryPolicy

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy

class State(TypedDict):
    result: str

attempt_count = 0

def flaky_node(state: State) -> dict:
    global attempt_count
    attempt_count += 1
    print(f"[尝试 #{attempt_count}]")
    if attempt_count < 3:
        raise ConnectionError("网络连接失败")
    return {"result": f"成功！经过 {attempt_count} 次尝试"}

builder = StateGraph(State)
builder.add_node("flaky", flaky_node, retry_policy=RetryPolicy(max_attempts=5, initial_interval=0.1))
builder.add_edge(START, "flaky")
builder.add_edge("flaky", END)

graph = builder.compile()
result = graph.invoke({"result": ""})
print(f"结果: {result['result']}")
```

---

## Demo 2：自定义重试逻辑

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy, default_retry_on

class State(TypedDict):
    result: str

class MyCustomError(Exception):
    pass

def custom_retry_on(exc: BaseException) -> bool:
    if isinstance(exc, MyCustomError):
        return False  # 不重试自定义错误
    return default_retry_on(exc)

attempt = 0

def api_node(state: State) -> dict:
    global attempt
    attempt += 1
    if attempt == 1:
        raise MyCustomError("业务逻辑错误，不应重试")
    return {"result": "done"}

builder = StateGraph(State)
builder.add_node(
    "api",
    api_node,
    retry_policy=RetryPolicy(max_attempts=3, retry_on=custom_retry_on),
)
builder.add_edge(START, "api")
builder.add_edge("api", END)

graph = builder.compile()
# MyCustomError 不会被重试，直接失败
try:
    graph.invoke({"result": ""})
except MyCustomError as e:
    print(f"未重试，直接失败: {e}")
```

---

## Demo 3：检查重试状态 — execution_info

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import RetryPolicy

class State(TypedDict):
    result: str

def smart_node(state: State, runtime: Runtime) -> dict:
    attempt = runtime.execution_info.node_attempt
    print(f"[attempt={attempt}]")
    if attempt == 1:
        raise ConnectionError("主 API 超时")
    if attempt >= 2:
        return {"result": f"备用 API 返回（第 {attempt} 次尝试）"}
    return {"result": "主 API 成功"}

builder = StateGraph(State)
builder.add_node("smart", smart_node, retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.1))
builder.add_edge(START, "smart")
builder.add_edge("smart", END)

graph = builder.compile()
result = graph.invoke({"result": ""})
print(f"结果: {result['result']}")
```

---

## Demo 4：超时 — TimeoutPolicy

```python
import asyncio
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import TimeoutPolicy

class State(TypedDict):
    result: str

async def slow_node(state: State) -> dict:
    print("[slow_node] 开始执行...")
    await asyncio.sleep(10)  # 模拟长时间运行
    return {"result": "完成"}

async def main():
    builder = StateGraph(State)
    builder.add_node(
        "slow",
        slow_node,
        timeout=TimeoutPolicy(run_timeout=2),  # 2秒超时
    )
    builder.add_edge(START, "slow")
    builder.add_edge("slow", END)

    graph = builder.compile()

    try:
        result = await graph.ainvoke({"result": ""})
        print(f"结果: {result['result']}")
    except Exception as e:
        print(f"超时错误: {type(e).__name__}: {e}")

asyncio.run(main())
```

---

## Demo 5：超时 + 重试组合

```python
import asyncio
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy, TimeoutPolicy

class State(TypedDict):
    result: str

attempt = 0

async def intermittent_node(state: State) -> dict:
    global attempt
    attempt += 1
    print(f"[尝试 #{attempt}]")
    if attempt <= 2:
        await asyncio.sleep(10)  # 前两次超时
    return {"result": f"成功（第 {attempt} 次）"}

async def main():
    builder = StateGraph(State)
    builder.add_node(
        "intermittent",
        intermittent_node,
        timeout=TimeoutPolicy(run_timeout=1),
        retry_policy=RetryPolicy(max_attempts=4, initial_interval=0.1),
    )
    builder.add_edge(START, "intermittent")
    builder.add_edge("intermittent", END)

    graph = builder.compile()

    result = await graph.ainvoke({"result": ""})
    print(f"结果: {result['result']}")

asyncio.run(main())
```

---

## Demo 6：错误处理器 — Saga 补偿模式

```python
from typing import TypedDict
from langgraph.errors import NodeError
from langgraph.types import Command, RetryPolicy
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    status: str

def reserve_inventory(state: State) -> dict:
    print("[reserve_inventory] 库存已预留")
    return {"status": "库存已预留"}

def charge_payment(state: State) -> dict:
    print("[charge_payment] 支付失败！")
    raise RuntimeError("支付网关超时")

def payment_error_handler(state: State, error: NodeError) -> Command:
    print(f"[补偿] 节点 {error.node} 失败: {error.error}")
    return Command(
        update={"status": f"已补偿: 释放库存，原因: {error.error}"},
        goto="finalize",
    )

def finalize(state: State) -> dict:
    print(f"[finalize] 最终状态: {state['status']}")
    return state

graph = (
    StateGraph(State)
    .add_node("reserve_inventory", reserve_inventory)
    .add_node(
        "charge_payment",
        charge_payment,
        retry_policy=RetryPolicy(max_attempts=2, initial_interval=0.1),
        error_handler=payment_error_handler,
    )
    .add_node("finalize", finalize)
    .add_edge(START, "reserve_inventory")
    .add_edge("reserve_inventory", "charge_payment")
    .add_edge("finalize", END)
    .compile()
)

result = graph.invoke({"status": ""})
print(f"最终结果: {result['status']}")
```

---

## Demo 7：图默认值 — set_node_defaults

```python
from typing import TypedDict
from langgraph.errors import NodeError
from langgraph.types import RetryPolicy, TimeoutPolicy
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    result: str

def default_error_handler(state: State, error: NodeError) -> dict:
    return {"result": f"全局错误处理: {error.node} - {error.error}"}

def step_a(state: State) -> dict:
    raise ValueError("step_a 出错")

def step_b(state: State) -> dict:
    return {"result": "step_b 完成"}

graph = (
    StateGraph(State)
    .set_node_defaults(
        retry_policy=RetryPolicy(max_attempts=2, initial_interval=0.1),
        error_handler=default_error_handler,
    )
    .add_node("step_a", step_a)
    .add_node("step_b", step_b)
    .add_edge(START, "step_a")
    .add_edge("step_a", "step_b")
    .add_edge("step_b", END)
    .compile()
)

result = graph.invoke({"result": ""})
print(f"结果: {result['result']}")
```

---

## Demo 8：Functional API 重试和超时

```python
import asyncio
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy, TimeoutPolicy

@task(
    retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.1),
)
async def fetch_data(url: str) -> str:
    print(f"[fetch_data] 请求 {url}")
    if url == "fail":
        raise ConnectionError("请求失败")
    return f"data from {url}"

@entrypoint()
async def my_workflow(inputs: dict) -> str:
    result = await fetch_data(inputs["url"])
    return f"结果: {result}"

async def main():
    try:
        result = await my_workflow.ainvoke({"url": "fail"})
        print(result)
    except ConnectionError as e:
        print(f"所有重试失败: {e}")

    result = await my_workflow.ainvoke({"url": "https://api.example.com"})
    print(result)

asyncio.run(main())
```

---

## 运行说明

1. Demo 1 基础重试
2. Demo 2 自定义重试逻辑
3. Demo 3 检查重试状态
4. Demo 4 超时
5. Demo 5 超时 + 重试组合
6. Demo 6 Saga 补偿模式
7. Demo 7 图默认值
8. Demo 8 Functional API
