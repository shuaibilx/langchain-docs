# Choosing APIs 功能 Demo

## 环境准备

```bash
pip install langgraph
```

---

## Demo 1：Graph API — 复杂分支

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    input: str
    result: str
    route: str

def classify(state: State) -> dict:
    if "紧急" in state["input"]:
        return {"route": "urgent"}
    return {"route": "normal"}

def urgent_handler(state: State) -> dict:
    return {"result": f"紧急处理: {state['input']}"}

def normal_handler(state: State) -> dict:
    return {"result": f"普通处理: {state['input']}"}

def route(state: State) -> str:
    return state["route"]

graph = (
    StateGraph(State)
    .add_node("classify", classify)
    .add_node("urgent", urgent_handler)
    .add_node("normal", normal_handler)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", route, {"urgent": "urgent", "normal": "normal"})
    .add_edge("urgent", END)
    .add_edge("normal", END)
    .compile()
)

print(graph.invoke({"input": "紧急：服务器宕机", "result": "", "route": ""}))
print(graph.invoke({"input": "查看日志", "result": "", "route": ""}))
```

---

## Demo 2：Functional API — 简单线性流程

```python
from langgraph.func import entrypoint, task

@task
def step1(data: str) -> dict:
    return {"processed": data.upper()}

@task
def step2(data: dict) -> dict:
    return {"result": f"最终: {data['processed']}"}

@entrypoint()
def workflow(input_data: str) -> dict:
    s1 = step1(input_data).result()
    s2 = step2(s1).result()
    return s2

# 注意：Functional API 需要检查点器才能运行
# 这里展示的是代码结构
print("Functional API 代码结构展示")
```

---

## Demo 3：组合使用

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.func import entrypoint, task

# Functional API 做数据处理
@task
def process_data(data: str) -> dict:
    return {"processed": data.strip().lower()}

@entrypoint()
def data_processor(raw_data: str) -> dict:
    return process_data(raw_data).result()

# Graph API 做整体协调
class State(TypedDict):
    raw_data: str
    processed: str
    final: str

def fetch_data(state: State) -> dict:
    return {"raw_data": "  Hello World  "}

def process_node(state: State) -> dict:
    # 调用 Functional API
    result = data_processor.invoke(state["raw_data"])
    return {"processed": result["processed"]}

def finalize(state: State) -> dict:
    return {"final": f"完成: {state['processed']}"}

graph = (
    StateGraph(State)
    .add_node("fetch", fetch_data)
    .add_node("process", process_node)
    .add_node("finalize", finalize)
    .add_edge(START, "fetch")
    .add_edge("fetch", "process")
    .add_edge("process", "finalize")
    .add_edge("finalize", END)
    .compile()
)

result = graph.invoke({"raw_data": "", "processed": "", "final": ""})
print(result)
```

---

## 运行说明

1. Demo 1 Graph API 复杂分支
2. Demo 2 Functional API 线性流程
3. Demo 3 组合使用
