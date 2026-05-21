# Use Graph API 功能 Demo

## 环境准备

```bash
pip install langgraph
```

---

## Demo 1：状态定义与 Reducer

```python
from typing import Annotated, TypedDict
from operator import add
from langchain.messages import AnyMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

# 使用 add_messages reducer
class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    extra: str

def chat(state: State) -> dict:
    return {
        "messages": [AIMessage(content=f"收到: {state['messages'][-1].content}")],
        "extra": "已处理"
    }

graph = (
    StateGraph(State)
    .add_node("chat", chat)
    .add_edge(START, "chat")
    .add_edge("chat", END)
    .compile()
)

result = graph.invoke({"messages": [HumanMessage(content="你好")], "extra": ""})
for msg in result["messages"]:
    print(f"{type(msg).__name__}: {msg.content}")
```

---

## Demo 2：输入/输出 Schema

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class InputState(TypedDict):
    question: str

class OutputState(TypedDict):
    answer: str

class OverallState(InputState, OutputState):
    context: str

def enrich(state: InputState) -> dict:
    return {"context": f"上下文: {state['question']}", "question": state["question"]}

def answer(state: OverallState) -> dict:
    return {"answer": f"回答: {state['context']}"}

graph = (
    StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
    .add_node("enrich", enrich)
    .add_node("answer", answer)
    .add_edge(START, "enrich")
    .add_edge("enrich", "answer")
    .add_edge("answer", END)
    .compile()
)

# 输出只包含 OutputState 的键
result = graph.invoke({"question": "什么是AI?"})
print(result)  # {'answer': '...'}
```

---

## Demo 3：序列 + 简写

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    value: str

def step_1(state: State) -> dict:
    return {"value": f"{state['value']} -> 1"}

def step_2(state: State) -> dict:
    return {"value": f"{state['value']} -> 2"}

def step_3(state: State) -> dict:
    return {"value": f"{state['value']} -> 3"}

# 方式1：手动添加
graph1 = (
    StateGraph(State)
    .add_node("step_1", step_1)
    .add_node("step_2", step_2)
    .add_node("step_3", step_3)
    .add_edge(START, "step_1")
    .add_edge("step_1", "step_2")
    .add_edge("step_2", "step_3")
    .add_edge("step_3", END)
    .compile()
)

# 方式2：add_sequence 简写
graph2 = (
    StateGraph(State)
    .add_sequence([step_1, step_2, step_3])
    .add_edge(START, "step_1")
    .add_edge("step_3", END)
    .compile()
)

print(graph1.invoke({"value": "开始"}))
print(graph2.invoke({"value": "开始"}))
```

---

## Demo 4：并行 + 延迟执行

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    results: Annotated[list[str], add]

def task_a(state: State) -> dict:
    return {"results": ["A"]}

def task_b(state: State) -> dict:
    return {"results": ["B"]}

def task_b2(state: State) -> dict:
    return {"results": ["B2"]}

def task_c(state: State) -> dict:
    return {"results": ["C"]}

def combine(state: State) -> dict:
    return {"results": [f"合并: {state['results']}"]}

graph = (
    StateGraph(State)
    .add_node("a", task_a)
    .add_node("b", task_b)
    .add_node("b2", task_b2)
    .add_node("c", task_c)
    .add_node("combine", combine, defer=True)  # 延迟执行
    .add_edge(START, "a")
    .add_edge("a", "b")
    .add_edge("a", "c")
    .add_edge("b", "b2")
    .add_edge("b2", "combine")
    .add_edge("c", "combine")
    .add_edge("combine", END)
    .compile()
)

result = graph.invoke({"results": []})
print(result["results"])
```

---

## Demo 5：条件分支

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    input: str
    result: str

def classify(state: State) -> dict:
    return {"input": state["input"]}

def handle_greeting(state: State) -> dict:
    return {"result": "你好！有什么可以帮你的？"}

def handle_question(state: State) -> dict:
    return {"result": f"关于 '{state['input']}' 的回答..."}

def handle_unknown(state: State) -> dict:
    return {"result": "我不太理解你的意思"}

def route(state: State) -> str:
    text = state["input"].lower()
    if any(w in text for w in ["你好", "hi", "hello"]):
        return "greeting"
    elif "?" in text or "什么" in text:
        return "question"
    return "unknown"

graph = (
    StateGraph(State)
    .add_node("classify", classify)
    .add_node("greeting", handle_greeting)
    .add_node("question", handle_question)
    .add_node("unknown", handle_unknown)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", route)
    .add_edge("greeting", END)
    .add_edge("question", END)
    .add_edge("unknown", END)
    .compile()
)

print(graph.invoke({"input": "你好世界", "result": ""}))
print(graph.invoke({"input": "什么是机器学习?", "result": ""}))
print(graph.invoke({"input": "随便说说", "result": ""}))
```

---

## Demo 6：循环

```python
from typing import TypedDict, Literal, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[str], add]
    count: int

def think(state: State) -> dict:
    return {"messages": [f"思考第{state['count']}次"], "count": state["count"] + 1}

def should_continue(state: State) -> str:
    if state["count"] >= 3:
        return END
    return "think"

graph = (
    StateGraph(State)
    .add_node("think", think)
    .add_edge(START, "think")
    .add_conditional_edges("think", should_continue)
    .compile()
)

result = graph.invoke({"messages": [], "count": 0})
print(result["messages"])
```

---

## Demo 7：Command 组合控制流

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

class State(TypedDict):
    score: int
    result: str

def evaluate(state: State) -> Command[Literal["pass", "fail"]]:
    if state["score"] >= 60:
        return Command(update={"result": "及格"}, goto="pass")
    return Command(update={"result": "不及格"}, goto="fail")

def pass_node(state: State) -> dict:
    return {"result": f"{state['result']} - 恭喜!"}

def fail_node(state: State) -> dict:
    return {"result": f"{state['result']} - 继续努力"}

graph = (
    StateGraph(State)
    .add_node("evaluate", evaluate)
    .add_node("pass", pass_node)
    .add_node("fail", fail_node)
    .add_edge(START, "evaluate")
    .add_edge("pass", END)
    .add_edge("fail", END)
    .compile()
)

print(graph.invoke({"score": 85, "result": ""}))
print(graph.invoke({"score": 45, "result": ""}))
```

---

## Demo 8：运行时配置

```python
from typing import TypedDict
from dataclasses import dataclass
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime

class State(TypedDict):
    result: str

@dataclass
class Context:
    model: str = "gpt-4"
    language: str = "zh"

def generate(state: State, runtime: Runtime[Context]) -> dict:
    return {
        "result": f"使用 {runtime.context.model} 以 {runtime.context.language} 生成"
    }

graph = (
    StateGraph(State, context_schema=Context)
    .add_node("generate", generate)
    .add_edge(START, "generate")
    .add_edge("generate", END)
    .compile()
)

print(graph.invoke({"result": ""}, context=Context(model="claude", language="en")))
print(graph.invoke({"result": ""}, context={"model": "gemini", "language": "zh"}))
```

---

## 运行说明

1. Demo 1 状态与 Reducer
2. Demo 2 输入/输出 Schema
3. Demo 3 序列
4. Demo 4 并行 + 延迟
5. Demo 5 条件分支
6. Demo 6 循环
7. Demo 7 Command
8. Demo 8 运行时配置
