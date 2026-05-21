# Multi-agent Overview 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：单 Agent vs 多智能体对比

```python
from langchain.agents import create_agent
from langchain.tools import tool

# 方式1：单 Agent，所有工具
@tool
def search_web(query: str) -> str:
    """搜索网页。"""
    return f"网页结果: {query}"

@tool
def write_code(language: str, task: str) -> str:
    """编写代码。"""
    return f"已用 {language} 编写: {task}"

@tool
def analyze_data(data: str) -> str:
    """分析数据。"""
    return f"分析结果: {data}"

single_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_web, write_code, analyze_data],
)

# 单 Agent 处理所有任务
r = single_agent.invoke({"messages": [{"role": "user", "content": "搜索 Python 最新版本并写个 Hello World"}]})
print(f"单 Agent: {r['messages'][-1].content[:80]}")
```

---

## Demo 2：子 Agent 模式预览

```python
from langchain.agents import create_agent
from langchain.tools import tool

# 创建专门化的子 Agent
research_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt="你是研究专家，专门搜索和整理信息。"
)

# 包装为工具
@tool("research", description="搜索并整理信息")
def call_research(query: str) -> str:
    result = research_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content

# 主 Agent 使用子 Agent
main_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_research],
)

r = main_agent.invoke({"messages": [{"role": "user", "content": "研究一下 LangChain 的最新版本"}]})
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## Demo 3：路由器模式预览

```python
from langchain.agents import create_agent
from langchain.tools import tool

# 专门化 Agent
@tool
def handle_billing(question: str) -> str:
    """处理账单问题。"""
    return f"账单回答: {question}"

@tool
def handle_technical(question: str) -> str:
    """处理技术问题。"""
    return f"技术回答: {question}"

# 路由器 Agent
router_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[handle_billing, handle_technical],
    system_prompt="你是一个路由器。根据用户问题选择合适的工具：账单问题用 handle_billing，技术问题用 handle_technical。"
)

r = router_agent.invoke({"messages": [{"role": "user", "content": "我的账单为什么多了10块钱？"}]})
print(f"路由结果: {r['messages'][-1].content[:80]}")
```

---

## 运行说明

1. Demo 1 单 Agent 模式
2. Demo 2 子 Agent 模式预览
3. Demo 3 路由器模式预览

后续子文件夹中有各模式的完整 Demo。
