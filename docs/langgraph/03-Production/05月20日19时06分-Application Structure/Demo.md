# Application Structure 功能 Demo

## 环境准备

```bash
pip install langgraph langchain-openai
```

---

## Demo 1：最小化 LangGraph 应用

### 项目结构

```
my-first-agent/
├── agent.py
├── requirements.txt
└── langgraph.json
```

### agent.py

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    input: str
    output: str

def process(state: State) -> dict:
    return {"output": f"处理: {state['input']}"}

# 编译后的图（部署时加载这个变量）
graph = (
    StateGraph(State)
    .add_node("process", process)
    .add_edge(START, "process")
    .add_edge("process", END)
    .compile()
)
```

### requirements.txt

```
langgraph>=0.2.0
```

### langgraph.json

```json
{
  "dependencies": ["."],
  "graphs": {
    "my_agent": "./agent.py:graph"
  }
}
```

---

## Demo 2：带工具的代理应用

### 项目结构

```
tool-agent/
├── my_agent/
│   ├── __init__.py
│   ├── agent.py
│   ├── tools.py
│   └── state.py
├── .env
├── requirements.txt
└── langgraph.json
```

### my_agent/state.py

```python
from typing import TypedDict, Annotated
from operator import add
from langchain.messages import AnyMessage

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add]
```

### my_agent/tools.py

```python
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """搜索信息"""
    return f"搜索结果: {query}"

@tool
def calculator(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))
```

### my_agent/agent.py

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from .tools import search, calculator
from .state import AgentState

llm = ChatOpenAI(model="gpt-4o-mini")

# 编译后的图
graph = create_react_agent(
    model=llm,
    tools=[search, calculator],
    state_schema=AgentState,
)
```

### my_agent/__init__.py

```python
from .agent import graph
```

### .env

```
OPENAI_API_KEY=sk-...
```

### requirements.txt

```
langgraph>=0.2.0
langchain-openai>=0.1.0
```

### langgraph.json

```json
{
  "dependencies": ["langchain-openai", "./my_agent"],
  "graphs": {
    "tool_agent": "./my_agent/agent.py:graph"
  },
  "env": "./.env"
}
```

---

## Demo 3：多图应用

### langgraph.json

```json
{
  "dependencies": ["langchain-openai", "./agents"],
  "graphs": {
    "chat_agent": "./agents/chat.py:graph",
    "research_agent": "./agents/research.py:graph",
    "code_agent": "./agents/code.py:graph"
  },
  "env": "./.env"
}
```

---

## Demo 4：使用 pyproject.toml

### pyproject.toml

```toml
[project]
name = "my-langgraph-app"
version = "0.1.0"
dependencies = [
    "langgraph>=0.2.0",
    "langchain-openai>=0.1.0",
]

[build-system]
requires = ["setuptools"]
build-backend = "setuptools.backends._legacy:_Backend"
```

### langgraph.json

```json
{
  "dependencies": ["./my_agent"],
  "graphs": {
    "agent": "./my_agent/agent.py:graph"
  },
  "env": "./.env"
}
```

---

## Demo 5：带系统依赖的应用

### langgraph.json

```json
{
  "dependencies": ["langchain-openai", "./my_agent"],
  "graphs": {
    "agent": "./my_agent/agent.py:graph"
  },
  "env": "./.env",
  "dockerfile_lines": [
    "RUN apt-get update && apt-get install -y ffmpeg"
  ]
}
```

---

## 运行说明

1. Demo 1 最小化应用
2. Demo 2 带工具的代理
3. Demo 3 多图应用
4. Demo 4 pyproject.toml
5. Demo 5 系统依赖
