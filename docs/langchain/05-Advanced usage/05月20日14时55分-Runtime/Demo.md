# Runtime 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：基础 — 定义 Context 并传入

```python
from dataclasses import dataclass
from langchain.agents import create_agent

@dataclass
class Context:
    user_name: str
    user_role: str

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫什么？我的角色是什么？"}]},
    context=Context(user_name="小明", user_role="admin")
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 2：工具中访问 Context

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime

@dataclass
class Context:
    user_name: str
    user_id: str

@tool
def who_am_i(runtime: ToolRuntime[Context]) -> str:
    """获取当前用户信息。"""
    return f"你是 {runtime.context.user_name}，ID 为 {runtime.context.user_id}"

@tool
def greet_user(runtime: ToolRuntime[Context]) -> str:
    """向当前用户打招呼。"""
    name = runtime.context.user_name
    return f"你好，{name}！欢迎使用本系统。"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[who_am_i, greet_user],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "我是谁？跟我打个招呼"}]},
    context=Context(user_name="小明", user_id="user_123")
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 3：工具中访问 Store（长期记忆）

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime
from langgraph.store.memory import InMemoryStore

@dataclass
class Context:
    user_id: str

@tool
def save_preference(key: str, value: str, runtime: ToolRuntime[Context]) -> str:
    """保存用户偏好到长期记忆。"""
    if runtime.store:
        runtime.store.put(("users", runtime.context.user_id), key, {"value": value})
        return f"已保存偏好: {key} = {value}"
    return "Store 不可用"

@tool
def get_preference(key: str, runtime: ToolRuntime[Context]) -> str:
    """获取用户偏好。"""
    if runtime.store:
        item = runtime.store.get(("users", runtime.context.user_id), key)
        if item:
            return f"{key} = {item.value['value']}"
    return f"未找到偏好: {key}"

store = InMemoryStore()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_preference, get_preference],
    context_schema=Context,
    store=store,
)

config = {"configurable": {"thread_id": "store-1"}}

# 保存偏好
r = agent.invoke(
    {"messages": [{"role": "user", "content": "把我的语言偏好设置为中文"}]},
    {**config, "context": Context(user_id="user_123")}
)
print(f"保存: {r['messages'][-1].content[:60]}")

# 读取偏好（新对话）
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我的语言偏好是什么？"}]},
    {**config, "context": Context(user_id="user_123")}
)
print(f"读取: {r['messages'][-1].content[:60]}")
```

---

## Demo 4：工具中访问执行信息

```python
from langchain.agents import create_agent
from langchain.tools import tool, ToolRuntime

@tool
def log_execution(runtime: ToolRuntime) -> str:
    """记录当前执行信息。"""
    info = runtime.execution_info
    return f"线程: {info.thread_id}, 运行: {info.run_id}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[log_execution],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "显示当前执行信息"}]},
    {"configurable": {"thread_id": "exec-1"}}
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 5：中间件中访问 Context — 动态提示

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest

@dataclass
class Context:
    user_name: str
    language: str

@dynamic_prompt
def personalized_prompt(request: ModelRequest) -> str:
    name = request.runtime.context.user_name
    lang = request.runtime.context.language
    return f"你是一个有帮助的助手。用户叫{name}，请用{lang}回答。"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[personalized_prompt],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "你好，介绍一下你自己"}]},
    context=Context(user_name="小红", language="中文")
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 6：中间件中访问 Context — before_model 钩子

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import before_model, AgentState
from langgraph.runtime import Runtime
from typing import Any

@dataclass
class Context:
    user_name: str
    request_limit: int

@before_model
def check_user_quota(state: AgentState, runtime: Runtime[Context]) -> dict[str, Any] | None:
    name = runtime.context.user_name
    limit = runtime.context.request_limit
    msg_count = len(state["messages"])
    print(f"[before_model] 用户: {name}, 限制: {limit}, 当前消息数: {msg_count}")
    return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[check_user_quota],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "你好"}]},
    context=Context(user_name="小明", request_limit=10)
)

print(f"回复: {result['messages'][-1].content[:50]}")
```

---

## Demo 7：中间件中访问 Context — wrap_model_call 钩子

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.messages import SystemMessage
from typing import Callable

@dataclass
class Context:
    user_name: str
    department: str

@wrap_model_call
def inject_context(request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
    """包装风格钩子：通过 request.runtime 访问上下文。"""
    name = request.runtime.context.user_name
    dept = request.runtime.context.department

    context_info = f"\n\n用户信息: {name}，部门: {dept}。请根据用户身份调整回答风格。"
    new_content = list(request.system_message.content_blocks) + [
        {"type": "text", "text": context_info}
    ]
    return handler(request.override(system_message=SystemMessage(content=new_content)))

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[inject_context],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "帮我写一封请假邮件"}]},
    context=Context(user_name="张三", department="技术部")
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 8：基于 Context 的权限控制

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.tools import tool
from typing import Callable

@dataclass
class Context:
    user_role: str

@tool
def view_reports() -> str:
    """查看报表。"""
    return "报表数据: Q1 营收 100 万"

@tool
def manage_users() -> str:
    """管理用户。"""
    return "用户列表: admin, user1, user2"

@tool
def delete_data() -> str:
    """删除数据。"""
    return "数据已删除"

class RoleBasedToolSelector:
    """根据用户角色动态选择可用工具。"""
    def __call__(self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
        role = request.runtime.context.user_role
        all_tools = request.tools

        if role == "admin":
            allowed = all_tools  # 管理员：全部工具
        elif role == "manager":
            allowed = [t for t in all_tools if t.name != "delete_data"]  # 经理：除删除外
        else:
            allowed = [t for t in all_tools if t.name == "view_reports"]  # 普通用户：仅查看

        return handler(request.override(tools=allowed))

selector = RoleBasedToolSelector()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[view_reports, manage_users, delete_data],
    middleware=[selector],
    context_schema=Context,
)

# 管理员
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你能做什么？"}]},
    context=Context(user_role="admin")
)
print(f"admin: {r['messages'][-1].content[:80]}")

# 普通用户
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你能做什么？"}]},
    context=Context(user_role="user")
)
print(f"user: {r['messages'][-1].content[:80]}")
```

---

## Demo 9：动态上下文注入（时间 + 用户信息）

```python
from dataclasses import dataclass
from datetime import datetime
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.messages import SystemMessage
from typing import Callable

@dataclass
class Context:
    user_name: str
    timezone: str

@wrap_model_call
def inject_dynamic_context(request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
    name = request.runtime.context.user_name
    tz = request.runtime.context.timezone
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    context = f"\n\n当前时间: {now} ({tz})。用户: {name}。请在回答中考虑时间上下文。"
    new_content = list(request.system_message.content_blocks) + [
        {"type": "text", "text": context}
    ]
    return handler(request.override(system_message=SystemMessage(content=new_content)))

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[inject_dynamic_context],
    context_schema=Context,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "现在适合做什么？"}]},
    context=Context(user_name="小明", timezone="Asia/Shanghai")
)

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 10：完整实战 — 综合 Runtime 应用

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import (
    before_model, wrap_model_call, ModelRequest, ModelResponse, AgentState
)
from langchain.tools import tool, ToolRuntime
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime
from langgraph.store.memory import InMemoryStore
from typing import Any, Callable

# 定义上下文
@dataclass
class Context:
    user_name: str
    user_id: str
    user_role: str
    language: str

# 工具：保存用户偏好
@tool
def save_preference(key: str, value: str, runtime: ToolRuntime[Context]) -> str:
    """保存用户偏好。"""
    if runtime.store:
        runtime.store.put(("prefs", runtime.context.user_id), key, {"value": value})
        return f"已保存: {key} = {value}"
    return "Store 不可用"

# 工具：读取用户偏好
@tool
def get_preferences(runtime: ToolRuntime[Context]) -> str:
    """读取用户偏好。"""
    if runtime.store:
        items = runtime.store.search(("prefs", runtime.context.user_id))
        if items:
            return "偏好: " + ", ".join(f"{i.key}={i.value['value']}" for i in items)
    return "暂无保存的偏好"

# 中间件：日志
@before_model
def log_request(state: AgentState, runtime: Runtime[Context]) -> dict[str, Any] | None:
    print(f"[日志] 用户 {runtime.context.user_name} ({runtime.context.user_role}) 发起请求")
    return None

# 中间件：个性化提示注入
@wrap_model_call
def personalize(request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
    name = request.runtime.context.user_name
    role = request.runtime.context.user_role
    lang = request.runtime.context.language

    context = f"\n\n用户: {name} (角色: {role})。请用{lang}回答。"
    new_content = list(request.system_message.content_blocks) + [
        {"type": "text", "text": context}
    ]
    return handler(request.override(system_message=SystemMessage(content=new_content)))

# 创建 Agent
store = InMemoryStore()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_preference, get_preferences],
    middleware=[log_request, personalize],
    context_schema=Context,
    store=store,
)

# 测试
config = {"configurable": {"thread_id": "runtime-1"}}

# 保存偏好
r = agent.invoke(
    {"messages": [{"role": "user", "content": "把我的主题设置为暗黑模式"}]},
    {**config, "context": Context(user_name="小明", user_id="u001", user_role="admin", language="中文")}
)
print(f"保存: {r['messages'][-1].content[:60]}")

# 读取偏好
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我保存了什么偏好？"}]},
    {**config, "context": Context(user_name="小明", user_id="u001", user_role="admin", language="中文")}
)
print(f"读取: {r['messages'][-1].content[:60]}")
```

---

## 运行说明

1. Demo 1 基础 Context 定义和传入
2. Demo 2 工具中访问 Context
3. Demo 3 工具中访问 Store（长期记忆）
4. Demo 4 工具中访问执行信息
5. Demo 5 中间件中访问 Context — 动态提示
6. Demo 6 中间件中访问 Context — before_model
7. Demo 7 中间件中访问 Context — wrap_model_call
8. Demo 8 基于 Context 的权限控制
9. Demo 9 动态上下文注入
10. Demo 10 完整实战
