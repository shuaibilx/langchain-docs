# Router 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础路由器 — 单 Agent 路由

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def handle_billing(question: str) -> str:
    """处理账单相关问题。"""
    return f"账单回答: {question}"

@tool
def handle_technical(question: str) -> str:
    """处理技术相关问题。"""
    return f"技术回答: {question}"

@tool
def handle_general(question: str) -> str:
    """处理一般问题。"""
    return f"一般回答: {question}"

router = create_agent(
    model="openai:gpt-4o-mini",
    tools=[handle_billing, handle_technical, handle_general],
    system_prompt="""你是路由器。根据用户问题选择工具：
- 账单/付费/退款 → handle_billing
- 技术/bug/故障 → handle_technical
- 其他 → handle_general"""
)

r = router.invoke({"messages": [{"role": "user", "content": "我的账单多了10块钱"}]})
print(f"路由结果: {r['messages'][-1].content[:60]}")

r = router.invoke({"messages": [{"role": "user", "content": "系统登录不了"}]})
print(f"路由结果: {r['messages'][-1].content[:60]}")
```

---

## Demo 2：LLM 分类路由

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langchain.chat_models import init_chat_model

# 分类器
classifier = init_chat_model("openai:gpt-4o-mini")

def classify_query(query: str) -> str:
    """用 LLM 分类查询。"""
    r = classifier.invoke([{"role": "user", "content": f"""将以下问题分类为: billing, technical, general
问题: {query}
只回答分类名称。"""}])
    return r.content.strip().lower()

# 专门化 Agent
@tool
def billing_agent(query: str) -> str:
    """账单专家。"""
    return f"账单: {query}"

@tool
def technical_agent(query: str) -> str:
    """技术专家。"""
    return f"技术: {query}"

@tool
def general_agent(query: str) -> str:
    """通用助手。"""
    return f"通用: {query}"

router = create_agent(
    model="openai:gpt-4o-mini",
    tools=[billing_agent, technical_agent, general_agent],
    system_prompt="你是路由器。使用分类工具回答问题。"
)

r = router.invoke({"messages": [{"role": "user", "content": "我想退款"}]})
print(f"回复: {r['messages'][-1].content[:60]}")
```

---

## Demo 3：无状态 vs 有状态路由器

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

# 无状态路由器（作为工具）
@tool
def search_docs(query: str) -> str:
    """搜索文档。"""
    # 模拟无状态路由器
    return f"文档结果: {query}"

# 有状态对话 Agent
conversational_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_docs],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "router-1"}}

# 第一轮
r = conversational_agent.invoke(
    {"messages": [{"role": "user", "content": "搜索 Python 异步编程"}]},
    config
)
print(f"轮次1: {r['messages'][-1].content[:60]}")

# 第二轮（记住上下文）
r = conversational_agent.invoke(
    {"messages": [{"role": "user", "content": "再搜索相关的最佳实践"}]},
    config
)
print(f"轮次2: {r['messages'][-1].content[:60]}")
```

---

## 运行说明

1. Demo 1 基础路由器
2. Demo 2 LLM 分类路由
3. Demo 3 无状态 vs 有状态
