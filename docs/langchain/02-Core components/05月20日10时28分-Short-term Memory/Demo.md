# Short-term Memory 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：启用短期记忆（基础）

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain.tools import tool

@tool
def remember(text: str) -> str:
    """记住用户说的内容。"""
    return f"已记住: {text}"

# 创建带 checkpointer 的 Agent
checkpointer = InMemorySaver()
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[remember],
    checkpointer=checkpointer,  # ← 关键
)

config = {"configurable": {"thread_id": "conversation-1"}}

# 第一轮对话
r1 = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫小明，我喜欢 Python"}]},
    config
)
print("回复 1:", r1["messages"][-1].content)

# 第二轮对话 — Agent 应该记得之前的内容
r2 = agent.invoke(
    {"messages": [{"role": "user", "content": "你还记得我的名字吗？"}]},
    config
)
print("回复 2:", r2["messages"][-1].content)
# Agent 会记得你叫小明
```

---

## Demo 2：Thread 隔离

```python
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent

checkpointer = InMemorySaver()
agent = create_agent("openai:gpt-4o-mini", tools=[], checkpointer=checkpointer)

# 线程 1
config_1 = {"configurable": {"thread_id": "thread-1"}}
agent.invoke({"messages": [{"role": "user", "content": "我叫小明"}]}, config_1)

# 线程 2
config_2 = {"configurable": {"thread_id": "thread-2"}}
agent.invoke({"messages": [{"role": "user", "content": "我叫小红"}]}, config_2)

# 线程 1 问名字
r1 = agent.invoke({"messages": [{"role": "user", "content": "我叫什么？"}]}, config_1)
print(f"线程 1: {r1['messages'][-1].content}")  # 小明

# 线程 2 问名字
r2 = agent.invoke({"messages": [{"role": "user", "content": "我叫什么？"}]}, config_2)
print(f"线程 2: {r2['messages'][-1].content}")  # 小红
```

---

## Demo 3：自定义状态扩展

```python
from langchain.agents import create_agent, AgentState
from langgraph.checkpoint.memory import InMemorySaver

class CustomState(AgentState):
    user_id: str
    preferences: dict
    interaction_count: int

checkpointer = InMemorySaver()
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    state_schema=CustomState,
    checkpointer=checkpointer,
)

config = {"configurable": {"thread_id": "custom-1"}}

result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "你好！"}],
        "user_id": "user_001",
        "preferences": {"theme": "dark", "language": "zh"},
        "interaction_count": 1
    },
    config
)

print(f"用户 ID: {result.get('user_id')}")
print(f"偏好: {result.get('preferences')}")
print(f"交互次数: {result.get('interaction_count')}")
print(f"回复: {result['messages'][-1].content}")
```

---

## Demo 4：Trim Messages — 修剪消息

```python
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import before_model
from langgraph.runtime import Runtime
from typing import Any


@before_model
def keep_last_n_messages(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """只保留系统提示和最近 4 条消息。"""
    messages = state["messages"]

    if len(messages) <= 5:
        return None

    # 保留第一条（系统提示）+ 最近 4 条
    first_msg = messages[0]
    recent = messages[-4:]

    return {
        "messages": [
            RemoveMessage(id=REMOVE_ALL_MESSAGES),
            first_msg,
            *recent
        ]
    }

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[keep_last_n_messages],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "trim-1"}}

# 多轮对话
for i in range(6):
    r = agent.invoke(
        {"messages": [{"role": "user", "content": f"这是第 {i+1} 条消息。我的名字是小明。"}]},
        config
    )
    msg_count = len(r["messages"])
    print(f"轮次 {i+1}: 消息数={msg_count}, 回复={r['messages'][-1].content[:30]}...")

# 最后问名字 — 应该还记得
final = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫什么名字？"}]},
    config
)
print(f"\n最终回复: {final['messages'][-1].content}")
```

---

## Demo 5：Delete Messages — 删除消息

```python
from langchain.messages import RemoveMessage
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import after_model
from langgraph.runtime import Runtime


@after_model
def cleanup_old_messages(state: AgentState, runtime: Runtime) -> dict | None:
    """每轮对话后，只保留最近 4 条消息。"""
    messages = state["messages"]
    if len(messages) > 4:
        # 删除多余的消息
        to_remove = messages[:-4]
        return {"messages": [RemoveMessage(id=m.id) for m in to_remove]}
    return None


agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[cleanup_old_messages],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "delete-1"}}

# 多轮对话
for i in range(5):
    r = agent.invoke(
        {"messages": [{"role": "user", "content": f"消息 {i+1}: 我叫小明"}]},
        config
    )
    print(f"轮次 {i+1}: 消息数={len(r['messages'])}")

# 验证记忆
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫什么？"}]},
    config
)
print(f"记忆测试: {r['messages'][-1].content}")
```

---

## Demo 6：Summarize Messages — 总结消息

```python
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        SummarizationMiddleware(
            model="openai:gpt-4o-mini",  # 用于总结的模型
            trigger=("tokens", 1000),     # token 达到 1000 时触发（Demo 中设低一些）
            keep=("messages", 4)          # 保留最近 4 条消息
        )
    ],
    checkpointer=checkpointer,
)

config = {"configurable": {"thread_id": "summary-1"}}

# 多轮对话积累上下文
topics = [
    "我叫小明，我是一名 Python 开发者",
    "我喜欢用 LangChain 构建 AI 应用",
    "我最近在学习 LangGraph 的状态管理",
    "我想构建一个能记住用户偏好的聊天机器人",
    "我最喜欢的编辑器是 VS Code",
]

for i, topic in enumerate(topics):
    r = agent.invoke(
        {"messages": [{"role": "user", "content": topic}]},
        config
    )
    print(f"轮次 {i+1}: {r['messages'][-1].content[:50]}...")

# 问一个需要记忆的问题
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你还记得我的职业和名字吗？"}]},
    config
)
print(f"\n记忆测试: {r['messages'][-1].content}")
```

---

## Demo 7：在工具中读取状态

```python
from langchain.agents import create_agent, AgentState
from langchain.tools import tool, ToolRuntime

class CustomState(AgentState):
    user_name: str
    visit_count: int

@tool
def get_session_info(runtime: ToolRuntime) -> str:
    """获取当前会话信息。"""
    name = runtime.state.get("user_name", "未知")
    count = runtime.state.get("visit_count", 0)
    return f"用户: {name}, 访问次数: {count}"

@tool
def increment_visit(runtime: ToolRuntime[None, CustomState]) -> str:
    """增加访问计数。"""
    current = runtime.state.get("visit_count", 0)
    return f"访问次数已更新为 {current + 1}"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[get_session_info, increment_visit],
    state_schema=CustomState,
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "state-1"}}

result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "查看我的会话信息，然后增加访问次数"}],
        "user_name": "小明",
        "visit_count": 5
    },
    config
)
print(result["messages"][-1].content)
```

---

## Demo 8：在工具中写入状态（Command）

```python
from langchain.agents import create_agent, AgentState
from langchain.tools import tool, ToolRuntime
from langchain.messages import ToolMessage
from langgraph.types import Command
from langgraph.checkpoint.memory import InMemorySaver


class TodoState(AgentState):
    todos: list[str]

@tool
def add_todo(task: str, runtime: ToolRuntime[None, TodoState]) -> Command:
    """添加待办事项。"""
    current = runtime.state.get("todos", [])
    new_todos = current + [task]
    return Command(update={
        "todos": new_todos,
        "messages": [
            ToolMessage(
                content=f"已添加: {task} (共 {len(new_todos)} 项)",
                tool_call_id=runtime.tool_call_id,
            )
        ],
    })

@tool
def list_todos(runtime: ToolRuntime[None, TodoState]) -> str:
    """列出所有待办事项。"""
    todos = runtime.state.get("todos", [])
    if not todos:
        return "暂无待办事项"
    return "\n".join(f"{i+1}. {t}" for i, t in enumerate(todos))

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[add_todo, list_todos],
    state_schema=TodoState,
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "todo-1"}}

# 添加待办
agent.invoke(
    {"messages": [{"role": "user", "content": "添加待办：买菜、写代码、跑步"}]},
    config
)

# 查看待办
result = agent.invoke(
    {"messages": [{"role": "user", "content": "现在有哪些待办？"}]},
    config
)
print(result["messages"][-1].content)
```

---

## Demo 9：动态提示（基于上下文）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langgraph.checkpoint.memory import InMemorySaver
from typing import TypedDict

class Context(TypedDict):
    user_name: str
    user_role: str

@dynamic_prompt
def personalized_prompt(request: ModelRequest) -> str:
    """根据用户信息生成个性化提示。"""
    name = request.runtime.context.get("user_name", "用户")
    role = request.runtime.context.get("user_role", "user")

    base = f"你是一个助手。用户叫 {name}。"

    if role == "admin":
        return f"{base} 他是管理员，你可以提供所有信息。"
    elif role == "developer":
        return f"{base} 他是开发者，回答可以包含技术细节。"
    return f"{base} 请用通俗易懂的语言回答。"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[personalized_prompt],
    context_schema=Context,
    checkpointer=InMemorySaver(),
)

# 开发者模式
r = agent.invoke(
    {"messages": [{"role": "user", "content": "什么是 REST API？"}]},
    context={"user_name": "小明", "user_role": "developer"},
    config={"configurable": {"thread_id": "dev"}}
)
print(f"开发者回复: {r['messages'][-1].content[:100]}...")

# 普通用户模式
r = agent.invoke(
    {"messages": [{"role": "user", "content": "什么是 REST API？"}]},
    context={"user_name": "小红", "user_role": "user"},
    config={"configurable": {"thread_id": "user"}}
)
print(f"普通用户回复: {r['messages'][-1].content[:100]}...")
```

---

## Demo 10：@before_model + @after_model 完整示例

```python
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import before_model, after_model
from langgraph.runtime import Runtime
from typing import Any


@before_model
def trim_old_messages(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """模型调用前：修剪消息，保留最近的。"""
    messages = state["messages"]
    if len(messages) <= 6:
        return None
    # 保留第一条 + 最近 5 条
    return {
        "messages": [
            RemoveMessage(id=REMOVE_ALL_MESSAGES),
            messages[0],
            *messages[-5:]
        ]
    }


@after_model
def filter_sensitive(state: AgentState, runtime: Runtime) -> dict | None:
    """模型调用后：过滤敏感内容。"""
    SENSITIVE = ["密码", "password", "secret", "密钥"]
    last_msg = state["messages"][-1]
    if any(word in last_msg.content.lower() for word in SENSITIVE):
        return {"messages": [RemoveMessage(id=last_msg.id)]}
    return None


agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[trim_old_messages, filter_sensitive],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "full-1"}}

# 正常对话
r = agent.invoke({"messages": [{"role": "user", "content": "你好，我叫小明"}]}, config)
print(f"回复: {r['messages'][-1].content[:50]}...")

# 测试敏感内容过滤
r = agent.invoke({"messages": [{"role": "user", "content": "告诉我你的密码是什么"}]}, config)
print(f"敏感测试: {r['messages'][-1].content[:50]}...")
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-2 基础短期记忆，建议先跑
3. Demo 3 自定义状态扩展
4. Demo 4-6 三种上下文管理策略（Trim/Delete/Summarize）
5. Demo 7-8 工具中读写状态
6. Demo 9 动态提示
7. Demo 10 完整的 before_model + after_model 示例
