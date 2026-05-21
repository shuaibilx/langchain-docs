# Thinking in LangGraph 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：邮件 Agent — 完整实现

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, RetryPolicy
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# 状态定义
class EmailClassification(TypedDict):
    intent: Literal["question", "bug", "billing", "feature"]
    urgency: Literal["low", "medium", "high"]
    topic: str

class EmailAgentState(TypedDict):
    email_content: str
    sender_email: str
    classification: EmailClassification | None
    search_results: list[str] | None
    draft_response: str | None

# 节点：读取邮件
def read_email(state: EmailAgentState) -> dict:
    print(f"[读取] 处理邮件: {state['email_content'][:30]}...")
    return {}

# 节点：分类意图
def classify_intent(state: EmailAgentState) -> Command:
    prompt = f"""分类这封邮件。返回 JSON:
    邮件: {state['email_content']}
    格式: {{"intent": "question|bug|billing|feature", "urgency": "low|medium|high", "topic": "主题"}}"""

    r = llm.invoke([HumanMessage(content=prompt)])
    try:
        import json
        classification = json.loads(r.content)
    except:
        classification = {"intent": "question", "urgency": "medium", "topic": "general"}

    print(f"[分类] 意图: {classification.get('intent')}, 紧急: {classification.get('urgency')}")

    goto = "search_docs" if classification.get("intent") in ["question", "feature"] else "draft_response"

    return Command(update={"classification": classification}, goto=goto)

# 节点：搜索文档
def search_docs(state: EmailAgentState) -> dict:
    topic = state.get("classification", {}).get("topic", "")
    results = [f"关于 {topic} 的文档1", f"关于 {topic} 的文档2"]
    print(f"[搜索] 找到 {len(results)} 条结果")
    return {"search_results": results}

# 节点：起草回复
def draft_response(state: EmailAgentState) -> dict:
    context = "\n".join(state.get("search_results", []))
    prompt = f"根据以下信息起草回复:\n邮件: {state['email_content']}\n文档: {context}"
    r = llm.invoke([HumanMessage(content=prompt)])
    print(f"[起草] 回复已生成")
    return {"draft_response": r.content}

# 节点：发送回复
def send_reply(state: EmailAgentState) -> dict:
    print(f"[发送] 回复已发送: {state.get('draft_response', '')[:50]}...")
    return {}

# 构建图
workflow = StateGraph(EmailAgentState)
workflow.add_node("read_email", read_email)
workflow.add_node("classify_intent", classify_intent)
workflow.add_node("search_docs", search_docs)
workflow.add_node("draft_response", draft_response)
workflow.add_node("send_reply", send_reply)

workflow.add_edge(START, "read_email")
workflow.add_edge("read_email", "classify_intent")
workflow.add_edge("search_docs", "draft_response")
workflow.add_edge("draft_response", "send_reply")
workflow.add_edge("send_reply", END)

app = workflow.compile()

# 运行
result = app.invoke({
    "email_content": "如何重置密码？我忘记了登录密码。",
    "sender_email": "user@example.com",
    "classification": None,
    "search_results": None,
    "draft_response": None,
})
print(f"\n最终回复: {result.get('draft_response', '')[:100]}")
```

---

## Demo 2：Command 路由模式

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

class State(TypedDict):
    query: str
    category: str
    answer: str

def classify(state: State) -> Command:
    query = state["query"].lower()
    if "价格" in query or "付费" in query:
        return Command(update={"category": "billing"}, goto="billing_agent")
    elif "bug" in query or "错误" in query:
        return Command(update={"category": "technical"}, goto="tech_agent")
    else:
        return Command(update={"category": "general"}, goto="general_agent")

def billing_agent(state: State) -> dict:
    return {"answer": f"账单回答: {state['query']}"}

def tech_agent(state: State) -> dict:
    return {"answer": f"技术回答: {state['query']}"}

def general_agent(state: State) -> dict:
    return {"answer": f"通用回答: {state['query']}"}

workflow = StateGraph(State)
workflow.add_node("classify", classify)
workflow.add_node("billing_agent", billing_agent)
workflow.add_node("tech_agent", tech_agent)
workflow.add_node("general_agent", general_agent)

workflow.add_edge(START, "classify")
workflow.add_edge("billing_agent", END)
workflow.add_edge("tech_agent", END)
workflow.add_edge("general_agent", END)

app = workflow.compile()

r = app.invoke({"query": "我的账单有问题", "category": "", "answer": ""})
print(f"路由到: {r['category']}, 回答: {r['answer']}")
```

---

## Demo 3：错误处理 — 重试策略

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy

class State(TypedDict):
    data: str
    result: str

call_count = 0

def unreliable_node(state: State) -> dict:
    global call_count
    call_count += 1
    print(f"[尝试 {call_count}] 执行节点...")
    if call_count < 3:
        raise ConnectionError("网络超时")
    return {"result": f"成功！尝试了 {call_count} 次"}

def final_node(state: State) -> dict:
    print(f"[完成] {state['result']}")
    return {}

workflow = StateGraph(State)
workflow.add_node("unreliable", unreliable_node, retry_policy=RetryPolicy(max_attempts=3))
workflow.add_node("final", final_node)
workflow.add_edge(START, "unreliable")
workflow.add_edge("unreliable", "final")
workflow.add_edge("final", END)

app = workflow.compile()

try:
    r = app.invoke({"data": "test", "result": ""})
    print(f"结果: {r['result']}")
except Exception as e:
    print(f"最终失败: {e}")
```

---

## Demo 4：interrupt() 人工审查

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, interrupt
from langgraph.checkpoint.memory import MemorySaver

class State(TypedDict):
    task: str
    approved: bool
    result: str

def process_task(state: State) -> dict:
    print(f"[处理] 执行任务: {state['task']}")
    return {"result": f"任务 '{state['task']}' 的处理结果"}

def human_review(state: State) -> Command:
    # interrupt() 必须在最前面
    decision = interrupt({
        "task": state["task"],
        "result": state["result"],
        "action": "请审查并批准"
    })

    if decision.get("approved"):
        print("[审查] 已批准")
        return Command(update={"approved": True}, goto="finalize")
    else:
        print("[审查] 已拒绝")
        return Command(update={"approved": False}, goto="finalize")

def finalize(state: State) -> dict:
    status = "已批准" if state.get("approved") else "已拒绝"
    print(f"[完成] 状态: {status}")
    return {}

workflow = StateGraph(State)
workflow.add_node("process", process_task)
workflow.add_node("review", human_review)
workflow.add_node("finalize", finalize)

workflow.add_edge(START, "process")
workflow.add_edge("process", "review")
workflow.add_edge("finalize", END)

app = workflow.compile(checkpointer=MemorySaver())

# 第一次运行（会暂停在 interrupt）
config = {"configurable": {"thread_id": "review-1"}}
result = app.invoke({"task": "发送营销邮件", "approved": False, "result": ""}, config)
print(f"暂停: {result.get('__interrupt__')}")

# 恢复（提供人工决策）
result = app.invoke(Command(resume={"approved": True}), config)
print(f"最终结果: {result.get('result')}")
```

---

## Demo 5：状态设计 — 原始数据 vs 格式化

```python
from typing import TypedDict

# 好的设计：存储原始数据
class GoodState(TypedDict):
    user_query: str           # 原始查询
    search_results: list[str] # 原始结果
    classification: dict      # 原始分类

# 不好的设计：存储格式化文本
class BadState(TypedDict):
    formatted_prompt: str     # 格化后的提示（不应该存）
    context_text: str         # 拼接后的上下文（不应该存）

# 正确做法：在节点内按需格式化
def good_node(state: GoodState) -> dict:
    # 按需格式化
    context = "\n".join(state["search_results"])
    prompt = f"问题: {state['user_query']}\n上下文: {context}"
    # 使用 prompt 调用 LLM...
    return {}

print("状态设计原则：存储原始数据，在节点内按需格式化")
```

---

## 运行说明

1. Demo 1 完整邮件 Agent
2. Demo 2 Command 路由模式
3. Demo 3 重试策略
4. Demo 4 interrupt() 人工审查
5. Demo 5 状态设计原则
