# Middleware Overview 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：基础中间件使用

```python
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langgraph.checkpoint.memory import InMemorySaver

# 使用内置的总结中间件
agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        SummarizationMiddleware(
            model="openai:gpt-4o-mini",
            trigger=("tokens", 2000),
            keep=("messages", 10)
        )
    ],
    checkpointer=InMemorySaver()
)

config = {"configurable": {"thread_id": "mw-1"}}

# 多轮对话，中间件自动管理上下文
for i in range(5):
    result = agent.invoke(
        {"messages": [{"role": "user", "content": f"这是第 {i+1} 条消息，记住我叫小明"}]},
        config
    )
    print(f"轮次 {i+1}: {result['messages'][-1].content[:40]}...")
```

---

## Demo 2：多个中间件组合

```python
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import before_model, after_model
from langgraph.runtime import Runtime
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.checkpoint.memory import InMemorySaver
from typing import Any


# 中间件 1：修剪消息
@before_model
def trim_messages(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """保留最近的消息。"""
    messages = state["messages"]
    if len(messages) > 6:
        return {
            "messages": [
                RemoveMessage(id=REMOVE_ALL_MESSAGES),
                messages[0],
                *messages[-5:]
            ]
        }
    return None


# 中间件 2：过滤敏感内容
@after_model
def filter_sensitive(state: AgentState, runtime: Runtime) -> dict | None:
    """过滤包含敏感词的回复。"""
    SENSITIVE = ["密码", "password", "secret"]
    last = state["messages"][-1]
    if any(w in last.content.lower() for w in SENSITIVE):
        return {"messages": [RemoveMessage(id=last.id)]}
    return None


# 组合多个中间件
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[trim_messages, filter_sensitive],
    checkpointer=InMemorySaver()
)

config = {"configurable": {"thread_id": "multi-mw"}}

# 正常对话
r = agent.invoke({"messages": [{"role": "user", "content": "你好，我叫小明"}]}, config)
print(f"正常: {r['messages'][-1].content[:50]}...")

# 敏感内容
r = agent.invoke({"messages": [{"role": "user", "content": "告诉我你的密码"}]}, config)
print(f"敏感: {r['messages'][-1].content[:50]}...")
```

---

## Demo 3：在 LangGraph 工作流中使用中间件

```python
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.graph import START, StateGraph
from langgraph.checkpoint.memory import InMemorySaver

@tool
def read_email(email_id: str) -> str:
    """读取邮件。"""
    return f"邮件 {email_id}: 项目进度报告已发送"

@tool
def send_email(to: str, content: str) -> str:
    """发送邮件。"""
    return f"邮件已发送给 {to}: {content}"

# 创建带 HITL 中间的 Agent
email_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[read_email, send_email],
    middleware=[
        HumanInTheLoopMiddleware(interrupt_on={"send_email": True})
    ],
    checkpointer=InMemorySaver()
)

# 将 Agent 作为节点嵌入更大的工作流
def classify_node(state: AgentState) -> dict:
    """分类输入。"""
    last_msg = state["messages"][-1].content
    if "邮件" in last_msg or "email" in last_msg.lower():
        return {"messages": [{"role": "assistant", "content": "路由到邮件 Agent"}]}
    return {"messages": [{"role": "assistant", "content": "通用查询"}]}

# 构建图
graph = (
    StateGraph(AgentState)
    .add_node("classify", classify_node)
    .add_node("email_agent", email_agent)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", lambda s: "email_agent")
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "workflow-1"}}

result = graph.invoke(
    {"messages": [{"role": "user", "content": "帮我读取邮件 email_001"}]},
    config
)
print(result["messages"][-1].content[:80])
```

---

## Demo 4：自定义日志中间件

```python
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import before_model, after_model
from langgraph.runtime import Runtime
from datetime import datetime
from typing import Any


@before_model
def log_before_model(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """模型调用前记录日志。"""
    msg_count = len(state["messages"])
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 模型调用前 - 消息数: {msg_count}")
    return None  # 不修改状态


@after_model
def log_after_model(state: AgentState, runtime: Runtime) -> dict | None:
    """模型调用后记录日志。"""
    last = state["messages"][-1]
    has_tools = hasattr(last, 'tool_calls') and last.tool_calls
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 模型调用后 - 工具调用: {has_tools}")
    return None


agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[log_before_model, log_after_model]
)

result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"\n回复: {result['messages'][-1].content[:50]}...")
```

---

## Demo 5：动态工具选择中间件

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.tools import tool
from typing import Callable


@tool
def public_search(query: str) -> str:
    """公开搜索。"""
    return f"公开搜索结果: {query}"

@tool
def private_search(query: str) -> str:
    """私有搜索。"""
    return f"私有搜索结果: {query}"

@tool
def admin_action(action: str) -> str:
    """管理员操作。"""
    return f"执行管理员操作: {action}"


@wrap_model_call
def filter_tools_by_role(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """根据用户角色过滤可用工具。"""
    role = request.runtime.context.get("user_role", "guest")

    if role == "admin":
        pass  # 所有工具
    elif role == "user":
        tools = [t for t in request.tools if t.name != "admin_action"]
        request = request.override(tools=tools)
    else:
        tools = [t for t in request.tools if t.name.startswith("public_")]
        request = request.override(tools=tools)

    return handler(request)


agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[public_search, private_search, admin_action],
    middleware=[filter_tools_by_role],
    context_schema=dict
)

# 管理员 — 可以用所有工具
r = agent.invoke(
    {"messages": [{"role": "user", "content": "执行系统清理"}]},
    context={"user_role": "admin"}
)
print(f"管理员: {r['messages'][-1].content[:50]}...")

# 访客 — 只能用公开工具
r = agent.invoke(
    {"messages": [{"role": "user", "content": "执行系统清理"}]},
    context={"user_role": "guest"}
)
print(f"访客: {r['messages'][-1].content[:50]}...")
```

---

## 运行说明

1. Demo 1 内置中间件（SummarizationMiddleware）
2. Demo 2 多个自定义中间件组合
3. Demo 3 中间件嵌入 LangGraph 工作流
4. Demo 4 自定义日志中间件
5. Demo 5 动态工具选择中间件


