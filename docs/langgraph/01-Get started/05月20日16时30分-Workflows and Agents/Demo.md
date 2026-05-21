# Workflows and Agents 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：提示链 — 笑话生成器

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    topic: str
    joke: str
    improved_joke: str
    final_joke: str

def generate_joke(state: State) -> dict:
    msg = llm.invoke(f"Write a short joke about {state['topic']}")
    return {"joke": msg.content}

def check_punchline(state: State) -> str:
    return "Pass" if "?" in state["joke"] or "!" in state["joke"] else "Fail"

def improve_joke(state: State) -> dict:
    msg = llm.invoke(f"Make this joke funnier by adding wordplay: {state['joke']}")
    return {"improved_joke": msg.content}

def polish_joke(state: State) -> dict:
    msg = llm.invoke(f"Add a surprising twist to this joke: {state['improved_joke']}")
    return {"final_joke": msg.content}

workflow = StateGraph(State)
workflow.add_node("generate", generate_joke)
workflow.add_node("improve", improve_joke)
workflow.add_node("polish", polish_joke)

workflow.add_edge(START, "generate")
workflow.add_conditional_edges("generate", check_punchline, {"Fail": "improve", "Pass": END})
workflow.add_edge("improve", "polish")
workflow.add_edge("polish", END)

chain = workflow.compile()
result = chain.invoke({"topic": "cats"})
print(f"笑话: {result.get('final_joke', result.get('joke', ''))}")
```

---

## Demo 2：并行化 — 多任务同时执行

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    topic: str
    joke: str
    story: str
    poem: str
    combined: str

def gen_joke(state: State) -> dict:
    return {"joke": llm.invoke(f"Write a joke about {state['topic']}").content}

def gen_story(state: State) -> dict:
    return {"story": llm.invoke(f"Write a story about {state['topic']}").content}

def gen_poem(state: State) -> dict:
    return {"poem": llm.invoke(f"Write a poem about {state['topic']}").content}

def aggregate(state: State) -> dict:
    return {"combined": f"STORY:\n{state['story']}\n\nJOKE:\n{state['joke']}\n\nPOEM:\n{state['poem']}"}

builder = StateGraph(State)
builder.add_node("joke", gen_joke)
builder.add_node("story", gen_story)
builder.add_node("poem", gen_poem)
builder.add_node("aggregate", aggregate)

# 并行：三个节点都从 START 开始
builder.add_edge(START, "joke")
builder.add_edge(START, "story")
builder.add_edge(START, "poem")
builder.add_edge("joke", "aggregate")
builder.add_edge("story", "aggregate")
builder.add_edge("poem", "aggregate")
builder.add_edge("aggregate", END)

app = builder.compile()
result = app.invoke({"topic": "cats"})
print(result["combined"][:200])
```

---

## Demo 3：路由 — 结构化输出分类

```python
from typing import TypedDict, Literal
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langchain.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class Route(BaseModel):
    step: Literal["poem", "story", "joke"] = Field(description="Next step")

router = llm.with_structured_output(Route)

class State(TypedDict):
    input: str
    decision: str
    output: str

def route_node(state: State) -> dict:
    decision = router.invoke([
        SystemMessage(content="Route to story, joke, or poem."),
        HumanMessage(content=state["input"]),
    ])
    return {"decision": decision.step}

def write_story(state: State) -> dict:
    return {"output": llm.invoke(state["input"]).content}

def write_joke(state: State) -> dict:
    return {"output": llm.invoke(state["input"]).content}

def write_poem(state: State) -> dict:
    return {"output": llm.invoke(state["input"]).content}

def route_decision(state: State) -> str:
    return {"story": "story", "joke": "joke", "poem": "poem"}[state["decision"]]

builder = StateGraph(State)
builder.add_node("router", route_node)
builder.add_node("story", write_story)
builder.add_node("joke", write_joke)
builder.add_node("poem", write_poem)

builder.add_edge(START, "router")
builder.add_conditional_edges("router", route_decision, {"story": "story", "joke": "joke", "poem": "poem"})
builder.add_edge("story", END)
builder.add_edge("joke", END)
builder.add_edge("poem", END)

app = builder.compile()
result = app.invoke({"input": "Write me a joke about cats", "decision": "", "output": ""})
print(f"路由到: {result['decision']}")
print(f"输出: {result['output'][:100]}")
```

---

## Demo 4：编排者-工作者 — 报告生成

```python
from typing import TypedDict, Annotated
from pydantic import BaseModel, Field
import operator
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from langchain.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class Section(BaseModel):
    name: str = Field(description="Section name")
    description: str = Field(description="Section description")

class Sections(BaseModel):
    sections: list[Section] = Field(description="List of sections")

planner = llm.with_structured_output(Sections)

class State(TypedDict):
    topic: str
    sections: list[Section]
    completed_sections: Annotated[list, operator.add]
    final_report: str

class WorkerState(TypedDict):
    section: Section
    completed_sections: Annotated[list, operator.add]

def orchestrator(state: State) -> dict:
    result = planner.invoke([
        SystemMessage(content="Generate a plan for the report."),
        HumanMessage(content=f"Topic: {state['topic']}"),
    ])
    return {"sections": result.sections}

def worker(state: WorkerState) -> dict:
    result = llm.invoke([
        SystemMessage(content="Write a brief report section."),
        HumanMessage(content=f"Section: {state['section'].name} - {state['section'].description}"),
    ])
    return {"completed_sections": [result.content]}

def synthesizer(state: State) -> dict:
    return {"final_report": "\n\n---\n\n".join(state["completed_sections"])}

def assign_workers(state: State):
    return [Send("worker", {"section": s}) for s in state["sections"]]

builder = StateGraph(State)
builder.add_node("orchestrator", orchestrator)
builder.add_node("worker", worker)
builder.add_node("synthesizer", synthesizer)

builder.add_edge(START, "orchestrator")
builder.add_conditional_edges("orchestrator", assign_workers, ["worker"])
builder.add_edge("worker", "synthesizer")
builder.add_edge("synthesizer", END)

app = builder.compile()
result = app.invoke({"topic": "Python 编程语言", "sections": [], "completed_sections": [], "final_report": ""})
print(f"报告:\n{result['final_report'][:300]}")
```

---

## Demo 5：评估者-优化者 — 迭代优化

```python
from typing import TypedDict, Literal
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

class Feedback(BaseModel):
    grade: Literal["funny", "not funny"] = Field(description="Is it funny?")
    feedback: str = Field(description="How to improve")

evaluator = llm.with_structured_output(Feedback)

class State(TypedDict):
    topic: str
    joke: str
    feedback: str
    funny_or_not: str

def generator(state: State) -> dict:
    if state.get("feedback"):
        msg = llm.invoke(f"Write a joke about {state['topic']}, considering: {state['feedback']}")
    else:
        msg = llm.invoke(f"Write a joke about {state['topic']}")
    return {"joke": msg.content}

def eval_node(state: State) -> dict:
    grade = evaluator.invoke(f"Grade this joke: {state['joke']}")
    return {"funny_or_not": grade.grade, "feedback": grade.feedback}

def route(state: State) -> str:
    return "Accepted" if state["funny_or_not"] == "funny" else "Rejected"

builder = StateGraph(State)
builder.add_node("generator", generator)
builder.add_node("evaluator", eval_node)

builder.add_edge(START, "generator")
builder.add_edge("generator", "evaluator")
builder.add_conditional_edges("evaluator", route, {"Accepted": END, "Rejected": "generator"})

app = builder.compile()
result = app.invoke({"topic": "cats", "joke": "", "feedback": "", "funny_or_not": ""})
print(f"最终笑话: {result['joke']}")
```

---

## Demo 6：Agent — 完整工具调用循环

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langchain.messages import SystemMessage, HumanMessage, ToolMessage, AnyMessage
from langchain_openai import ChatOpenAI
from langchain.tools import tool
import operator

llm = ChatOpenAI(model="gpt-4o-mini")

@tool
def add(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

tools = [add, multiply]
tools_by_name = {t.name: t for t in tools}
llm_with_tools = llm.bind_tools(tools)

class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

def llm_call(state: MessagesState) -> dict:
    return {"messages": [llm_with_tools.invoke([
        SystemMessage(content="You are a math assistant.")
    ] + state["messages"])]}

def tool_node(state: MessagesState) -> dict:
    result = []
    for tc in state["messages"][-1].tool_calls:
        tool = tools_by_name[tc["name"]]
        result.append(ToolMessage(content=str(tool.invoke(tc["args"])), tool_call_id=tc["id"]))
    return {"messages": result}

def should_continue(state: MessagesState) -> str:
    return "tools" if state["messages"][-1].tool_calls else END

builder = StateGraph(MessagesState)
builder.add_node("llm", llm_call)
builder.add_node("tools", tool_node)
builder.add_edge(START, "llm")
builder.add_conditional_edges("llm", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "llm")

app = builder.compile()
result = app.invoke({"messages": [HumanMessage(content="What is (3 + 5) * 12?")]})
for m in result["messages"]:
    m.pretty_print()
```

---

## Demo 7：ToolNode — 预构建工具节点

```python
from langgraph.prebuilt import ToolNode
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain.tools import tool
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage, SystemMessage, AnyMessage
import operator

llm = ChatOpenAI(model="gpt-4o-mini")

@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expression))

tools = [search, calculator]
llm_with_tools = llm.bind_tools(tools)

class State(MessagesState):
    messages: Annotated[list[AnyMessage], operator.add]

def llm_call(state: State) -> dict:
    return {"messages": [llm_with_tools.invoke([
        SystemMessage(content="You are a helpful assistant.")
    ] + state["messages"])]}

def should_continue(state: State) -> str:
    return "tools" if state["messages"][-1].tool_calls else END

builder = StateGraph(State)
builder.add_node("llm", llm_call)
builder.add_node("tools", ToolNode(tools))  # 预构建 ToolNode
builder.add_edge(START, "llm")
builder.add_conditional_edges("llm", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "llm")

app = builder.compile()
result = app.invoke({"messages": [HumanMessage(content="计算 15 * 23 + 47")]})
for m in result["messages"]:
    m.pretty_print()
```

---

## 运行说明

1. Demo 1 提示链（笑话生成器）
2. Demo 2 并行化（多任务同时）
3. Demo 3 路由（结构化输出分类）
4. Demo 4 编排者-工作者（报告生成）
5. Demo 5 评估者-优化者（迭代优化）
6. Demo 6 Agent（工具调用循环）
7. Demo 7 ToolNode（预构建节点）
