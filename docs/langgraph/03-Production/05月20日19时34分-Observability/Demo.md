# Observability 功能 Demo

## 环境准备

```bash
pip install langsmith langchain langchain-openai
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=lsv2_your_key_here
```

---

## Demo 1：基础追踪

```python
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

llm = ChatOpenAI(model="gpt-4o-mini")

def chat(state):
    response = llm.invoke([HumanMessage(content=state["input"])])
    return {"output": response.content}

graph = (
    StateGraph(dict)
    .add_node("chat", chat)
    .add_edge(START, "chat")
    .add_edge("chat", END)
    .compile()
)

# 追踪自动发送到 LangSmith
result = graph.invoke({"input": "Hello!"})
print(result["output"])
```

---

## Demo 2：选择性追踪

```python
import langsmith as ls
from langgraph.graph import StateGraph, START, END

def process(state):
    return {"output": f"处理: {state['input']}"}

graph = (
    StateGraph(dict)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
)

# 这次调用会被追踪
with ls.tracing_context(enabled=True):
    result1 = graph.invoke({"input": "追踪这次"})
    print(f"追踪: {result1['output']}")

# 这次调用不会被追踪
result2 = graph.invoke({"input": "不追踪这次"})
    print(f"不追踪: {result2['output']}")
```

---

## Demo 3：自定义项目名称

```python
import langsmith as ls

# 静态设置（环境变量）
# export LANGSMITH_PROJECT=my-agent-project

# 动态设置
with ls.tracing_context(project_name="email-agent-test", enabled=True):
    result = graph.invoke({"input": "测试"})
    print(result["output"])
```

---

## Demo 4：添加元数据和标签

```python
from langgraph.graph import StateGraph, START, END

def process(state):
    return {"output": f"处理: {state['input']}"}

graph = (
    StateGraph(dict)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
)

# 通过 config 添加元数据
result = graph.invoke(
    {"input": "带元数据的调用"},
    config={
        "tags": ["production", "email-assistant", "v1.0"],
        "metadata": {
            "user_id": "user_123",
            "session_id": "session_456",
            "environment": "production"
        }
    }
)
print(result["output"])
```

---

## Demo 5：使用匿名器

```python
from langchain_core.tracers.langchain import LangChainTracer
from langgraph.graph import StateGraph, START, END
from langsmith import Client
from langsmith.anonymizer import create_anonymizer

# 创建匿名器（屏蔽 SSN）
anonymizer = create_anonymizer([
    {"pattern": r"\b\d{3}-?\d{2}-?\d{4}\b", "replace": "<SSN>"}
])

tracer_client = Client(anonymizer=anonymizer)
tracer = LangChainTracer(client=tracer_client)

def process(state):
    return {"output": f"处理: {state['input']}"}

graph = (
    StateGraph(dict)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
    .with_config({'callbacks': [tracer]})
)

# SSN 会被匿名化
result = graph.invoke({"input": "我的 SSN 是 123-45-6789"})
print(result["output"])
```

---

## Demo 6：tracing_context 全功能

```python
import langsmith as ls

def process(state):
    return {"output": f"处理: {state['input']}"}

graph = (
    StateGraph(dict)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
)

# 使用 tracing_context 组合所有功能
with ls.tracing_context(
    project_name="my-test-project",
    enabled=True,
    tags=["test", "v2.0"],
    metadata={"test_run": True, "version": "2.0"}
):
    result = graph.invoke({"input": "完整追踪测试"})
    print(result["output"])
```

---

## 运行说明

1. Demo 1 基础追踪
2. Demo 2 选择性追踪
3. Demo 3 自定义项目名称
4. Demo 4 元数据和标签
5. Demo 5 匿名器
6. Demo 6 全功能 tracing_context
