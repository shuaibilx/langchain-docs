# Backward Compatibility 功能 Demo

## 环境准备

```bash
pip install langgraph pytest
```

---

## Demo 1：安全添加新字段

```python
from typing import NotRequired
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

# 旧版 State（v1）
class OldState(TypedDict):
    messages: list[str]

# 新版 State（v2）— 安全添加字段
class State(TypedDict):
    messages: list[str]
    summary: NotRequired[str]  # 新字段，旧检查点兼容

def process(state: State) -> dict:
    result = {"messages": state["messages"] + ["处理完成"]}
    if "summary" in state:
        result["summary"] = f"摘要: {state['summary']}"
    return result

graph = (
    StateGraph(State)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "compat-1"}}

# 模拟旧检查点（无 summary 字段）
graph.update_state(config, {"messages": ["旧消息"]}, as_node="__start__")

# 用新代码恢复旧检查点 — 不会崩溃
result = graph.invoke(None, config)
print(f"结果: {result}")
print("安全添加字段测试通过!")
```

---

## Demo 2：版本化路由 — 业务兼容性

```python
from typing import NotRequired
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    request: str
    flow_version: NotRequired[int]
    response: NotRequired[str]

def intake(state: State) -> dict:
    # 新线程打版本 2，旧线程保留原值
    return {"flow_version": state.get("flow_version", 2)}

def triage(state: State) -> dict:
    return {"response": f"分类: {state['request']}"}

def policy_check(state: State) -> dict:
    return {"response": f"策略检查: {state['response']}"}

def respond(state: State) -> dict:
    return {"response": f"响应: {state['response']}"}

def after_triage(state: State) -> str:
    if state.get("flow_version", 1) >= 2:
        return "policy_check"
    return "respond"

graph = (
    StateGraph(State)
    .add_node("intake", intake)
    .add_node("triage", triage)
    .add_node("policy_check", policy_check)
    .add_node("respond", respond)
    .add_edge(START, "intake")
    .add_edge("intake", "triage")
    .add_conditional_edges("triage", after_triage)
    .add_edge("policy_check", "respond")
    .add_edge("respond", END)
    .compile(checkpointer=InMemorySaver())
)

# 新线程（v2 流程）
config_new = {"configurable": {"thread_id": "new-thread"}}
result = graph.invoke({"request": "新请求"}, config_new)
print(f"新线程: {result['response']}")

# 旧线程模拟（v1 流程）
config_old = {"configurable": {"thread_id": "old-thread"}}
graph.update_state(
    config_old,
    {"request": "旧请求", "flow_version": 1},
    as_node="intake"
)
result = graph.invoke(None, config_old)
print(f"旧线程: {result['response']}")
```

---

## Demo 3：先添加后删除 — 安全重命名

```python
from typing import NotRequired
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

# 过渡期 State — 两个字段都存在
class State(TypedDict):
    data: str
    old_field: NotRequired[str]    # 旧字段（弃用中）
    new_field: NotRequired[str]    # 新字段

def migrate_node(state: State) -> dict:
    # 双写：同时更新新旧字段
    value = f"处理: {state.get('data', '')}"
    return {
        "old_field": value,
        "new_field": value,
    }

def use_field(state: State) -> dict:
    # 优先使用新字段，回退到旧字段
    value = state.get("new_field") or state.get("old_field", "默认")
    return {"data": f"使用: {value}"}

graph = (
    StateGraph(State)
    .add_node("migrate", migrate_node)
    .add_node("use", use_field)
    .add_edge(START, "migrate")
    .add_edge("migrate", "use")
    .add_edge("use", END)
    .compile(checkpointer=InMemorySaver())
)

result = graph.invoke({"data": "测试"}, {"configurable": {"thread_id": "rename-1"}})
print(f"结果: {result['data']}")
```

---

## Demo 4：检测正在运行的线程

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def step_a(state: State) -> dict:
    return {"value": f"{state['value']} -> A"}

def step_b(state: State) -> dict:
    answer = interrupt("需要输入:")
    return {"value": f"{state['value']} -> B: {answer}"}

def step_c(state: State) -> dict:
    return {"value": f"{state['value']} -> C"}

graph = (
    StateGraph(State)
    .add_node("step_a", step_a)
    .add_node("step_b", step_b)
    .add_node("step_c", step_c)
    .add_edge(START, "step_a")
    .add_edge("step_a", "step_b")
    .add_edge("step_b", "step_c")
    .add_edge("step_c", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "check-1"}}

# 运行到中断
graph.invoke({"value": "开始"}, config)

# 检查线程状态
state = graph.get_state(config)
print(f"当前状态: {state.values}")
print(f"下一个节点: {state.next}")
print(f"是否有中断: {bool(state.tasks and any(t.interrupts for t in state.tasks))}")

# 检查历史
history = list(graph.get_state_history(config))
print(f"历史长度: {len(history)}")
```

---

## Demo 5：Functional API 安全更新

```python
from langgraph.func import entrypoint, task
from langgraph.types import interrupt

# v1 版本
@task
def fetch_data_v1(url: str) -> str:
    return f"v1 数据: {url}"

@entrypoint()
def workflow_v1(inputs: dict) -> str:
    data = fetch_data_v1(inputs["url"]).result()
    return f"v1 结果: {data}"

# v2 版本 — 安全地添加新 task
@task
def fetch_data_v2(url: str) -> str:
    return f"v2 数据: {url}"

@task
def enrich_data(data: str) -> str:
    return f"增强: {data}"

@entrypoint()
def workflow_v2(inputs: dict) -> str:
    data = fetch_data_v2(inputs["url"]).result()
    enriched = enrich_data(data).result()
    return f"v2 结果: {enriched}"

# 新逻辑用新 task 包装，不影响现有缓存
print("Functional API 安全更新模式演示")
```

---

## 运行说明

1. Demo 1 安全添加新字段
2. Demo 2 版本化路由
3. Demo 3 先添加后删除
4. Demo 4 检测正在运行的线程
5. Demo 5 Functional API 安全更新
