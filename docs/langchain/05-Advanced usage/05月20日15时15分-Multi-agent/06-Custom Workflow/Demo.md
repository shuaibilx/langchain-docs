# Custom Workflow 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础工作流 — Agent 作为节点

```python
from langchain.agents import create_agent
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class State(TypedDict):
    query: str
    answer: str

agent = create_agent(model="openai:gpt-4o-mini", tools=[])

def agent_node(state: State) -> dict:
    """LangGraph 节点调用 LangChain Agent。"""
    result = agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"answer": result["messages"][-1].content}

workflow = (
    StateGraph(State)
    .add_node("agent", agent_node)
    .add_edge(START, "agent")
    .add_edge("agent", END)
    .compile()
)

result = workflow.invoke({"query": "什么是 Python？"})
print(f"回答: {result['answer'][:80]}")
```

---

## Demo 2：条件分支工作流

```python
from langchain.agents import create_agent
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Literal

class State(TypedDict):
    query: str
    category: str
    answer: str

classifier = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt="将问题分类为: tech 或 general。只回答分类名称。"
)

tech_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt="你是技术专家。"
)

general_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt="你是通用助手。"
)

def classify_node(state: State) -> dict:
    r = classifier.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    category = r["messages"][-1].content.strip().lower()
    return {"category": category}

def route(state: State) -> Literal["tech_agent", "general_agent"]:
    return "tech_agent" if "tech" in state["category"] else "general_agent"

def tech_node(state: State) -> dict:
    r = tech_agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"answer": r["messages"][-1].content}

def general_node(state: State) -> dict:
    r = general_agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"answer": r["messages"][-1].content}

workflow = (
    StateGraph(State)
    .add_node("classify", classify_node)
    .add_node("tech_agent", tech_node)
    .add_node("general_agent", general_node)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", route, ["tech_agent", "general_agent"])
    .add_edge("tech_agent", END)
    .add_edge("general_agent", END)
    .compile()
)

r = workflow.invoke({"query": "Python 的 async/await 怎么用？"})
print(f"回答: {r['answer'][:80]}")
```

---

## Demo 3：RAG 管道工作流

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain.agents import create_agent
from langchain.tools import tool

class State(TypedDict):
    question: str
    context: str
    answer: str

# 模拟知识库
KNOWLEDGE = {
    "python": "Python 是一种高级编程语言，以简洁易读著称。",
    "langchain": "LangChain 是一个用于构建 LLM 应用的框架。",
    "agent": "Agent 是能够自主决策和执行任务的 AI 系统。",
}

@tool
def search_knowledge(query: str) -> str:
    """搜索知识库。"""
    for key, value in KNOWLEDGE.items():
        if key in query.lower():
            return value
    return "未找到相关信息"

agent = create_agent(model="openai:gpt-4o-mini", tools=[search_knowledge])

def retrieve_node(state: State) -> dict:
    """确定性节点：检索。"""
    results = []
    for key, value in KNOWLEDGE.items():
        if key in state["question"].lower():
            results.append(value)
    return {"context": "\n".join(results) if results else "无相关信息"}

def agent_node(state: State) -> dict:
    """Agent 节点：推理。"""
    prompt = f"上下文: {state['context']}\n\n问题: {state['question']}"
    r = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return {"answer": r["messages"][-1].content}

workflow = (
    StateGraph(State)
    .add_node("retrieve", retrieve_node)
    .add_node("agent", agent_node)
    .add_edge(START, "retrieve")
    .add_edge("retrieve", "agent")
    .add_edge("agent", END)
    .compile()
)

r = workflow.invoke({"question": "什么是 LangChain？"})
print(f"回答: {r['answer'][:80]}")
```

---

## Demo 4：循环工作流

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain.agents import create_agent

class State(TypedDict):
    task: str
    result: str
    quality: str
    iterations: int

agent = create_agent(model="openai:gpt-4o-mini", tools=[])

def execute_node(state: State) -> dict:
    """执行任务。"""
    r = agent.invoke({"messages": [{"role": "user", "content": state["task"]}]})
    return {"result": r["messages"][-1].content, "iterations": state.get("iterations", 0) + 1}

def check_quality(state: State) -> dict:
    """检查质量。"""
    quality = "good" if len(state["result"]) > 50 else "needs_improvement"
    return {"quality": quality}

def should_continue(state: State) -> str:
    if state["quality"] == "good" or state.get("iterations", 0) >= 3:
        return "end"
    return "retry"

workflow = (
    StateGraph(State)
    .add_node("execute", execute_node)
    .add_node("check", check_quality)
    .add_edge(START, "execute")
    .add_edge("execute", "check")
    .add_conditional_edges("check", should_continue, {"end": END, "retry": "execute"})
    .compile()
)

r = workflow.invoke({"task": "用一句话解释量子计算", "result": "", "quality": "", "iterations": 0})
print(f"回答: {r['result'][:80]}")
print(f"迭代次数: {r['iterations']}")
```

---

## 运行说明

1. Demo 1 基础工作流（Agent 作为节点）
2. Demo 2 条件分支
3. Demo 3 RAG 管道
4. Demo 4 循环工作流
