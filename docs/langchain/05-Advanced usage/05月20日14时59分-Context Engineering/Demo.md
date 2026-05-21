# Context Engineering 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：模型上下文 — 从 State 获取的动态提示

```python
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest

@dynamic_prompt
def state_aware_prompt(request: ModelRequest) -> str:
    """根据对话长度动态调整提示。"""
    message_count = len(request.messages)

    base = "你是一个有帮助的助手。"

    if message_count > 10:
        base += "\n这是一个长对话——请特别简洁。"
    elif message_count > 5:
        base += "\n对话已经进行一段时间了——请保持中等长度的回答。"

    return base

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[state_aware_prompt],
)

# 短对话
r = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"短对话: {r['messages'][-1].content[:50]}")
```

---

## Demo 2：模型上下文 — 从 Store 获取的个性化提示

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langgraph.store.memory import InMemoryStore

@dataclass
class Context:
    user_id: str

@dynamic_prompt
def store_aware_prompt(request: ModelRequest) -> str:
    """从 Store 读取用户偏好，动态调整提示。"""
    user_id = request.runtime.context.user_id
    store = request.runtime.store
    user_prefs = store.get(("preferences",), user_id) if store else None

    base = "你是一个有帮助的助手。"

    if user_prefs:
        style = user_prefs.value.get("communication_style", "balanced")
        base += f"\n用户偏好{style}风格的回答。"

    return base

store = InMemoryStore()
# 预设用户偏好
store.put(("preferences",), "user_001", {"communication_style": "简洁专业"})

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[store_aware_prompt],
    context_schema=Context,
    store=store,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "解释什么是 Python"}]},
    context=Context(user_id="user_001")
)
print(f"回复: {result['messages'][-1].content[:80]}")
```

---

## Demo 3：模型上下文 — 从 Runtime 获取的角色感知提示

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest

@dataclass
class Context:
    user_role: str
    deployment_env: str

@dynamic_prompt
def context_aware_prompt(request: ModelRequest) -> str:
    """根据用户角色和环境动态调整提示。"""
    user_role = request.runtime.context.user_role
    env = request.runtime.context.deployment_env

    base = "你是一个有帮助的助手。"

    if user_role == "admin":
        base += "\n你有管理员权限，可以执行所有操作。"
    elif user_role == "viewer":
        base += "\n你只有只读权限，请引导用户进行只读操作。"

    if env == "production":
        base += "\n当前是生产环境，请格外小心处理任何数据修改。"

    return base

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[context_aware_prompt],
    context_schema=Context,
)

# 管理员
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你能做什么？"}]},
    context=Context(user_role="admin", deployment_env="production")
)
print(f"admin: {r['messages'][-1].content[:80]}")

# 普通用户
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你能做什么？"}]},
    context=Context(user_role="viewer", deployment_env="staging")
)
print(f"viewer: {r['messages'][-1].content[:80]}")
```

---

## Demo 4：消息上下文 — 从 State 注入文件上下文

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from typing import Callable

@wrap_model_call
def inject_file_context(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """注入用户上传文件的上下文。"""
    uploaded_files = request.state.get("uploaded_files", [])

    if uploaded_files:
        file_descriptions = []
        for file in uploaded_files:
            file_descriptions.append(f"- {file['name']} ({file['type']}): {file['summary']}")

        file_context = f"""本次对话中你可以访问的文件：
{chr(10).join(file_descriptions)}

回答问题时请参考这些文件。"""

        messages = [
            *request.messages,
            {"role": "user", "content": file_context},
        ]
        request = request.override(messages=messages)

    return handler(request)

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[inject_file_context],
)

# 模拟带文件的调用
result = agent.invoke({
    "messages": [{"role": "user", "content": "总结一下这个文件的内容"}],
    "uploaded_files": [
        {"name": "report.pdf", "type": "PDF", "summary": "2024年Q1销售报告，营收100万"},
        {"name": "data.csv", "type": "CSV", "summary": "用户行为数据，10000条记录"},
    ]
})
print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 5：工具上下文 — 读取 State

```python
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent

@tool
def check_auth_status(runtime: ToolRuntime) -> str:
    """检查当前用户的认证状态。"""
    state = runtime.state
    is_authenticated = state.get("authenticated", False)
    auth_level = state.get("auth_level", "none")

    if is_authenticated:
        return f"用户已认证，权限级别: {auth_level}"
    else:
        return "用户未认证"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[check_auth_status],
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "检查我的认证状态"}],
    "authenticated": True,
    "auth_level": "admin",
})
print(f"回复: {result['messages'][-1].content[:80]}")
```

---

## Demo 6：工具上下文 — 读写 Store

```python
from dataclasses import dataclass
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent
from langgraph.store.memory import InMemoryStore

@dataclass
class Context:
    user_id: str

@tool
def save_preference(key: str, value: str, runtime: ToolRuntime[Context]) -> str:
    """保存用户偏好到长期记忆。"""
    user_id = runtime.context.user_id
    store = runtime.store

    if store:
        existing = store.get(("preferences",), user_id)
        prefs = existing.value if existing else {}
        prefs[key] = value
        store.put(("preferences",), user_id, prefs)
        return f"已保存: {key} = {value}"
    return "Store 不可用"

@tool
def get_all_preferences(runtime: ToolRuntime[Context]) -> str:
    """获取所有用户偏好。"""
    user_id = runtime.context.user_id
    store = runtime.store

    if store:
        existing = store.get(("preferences",), user_id)
        if existing:
            prefs = existing.value
            return "偏好列表:\n" + "\n".join(f"  {k}: {v}" for k, v in prefs.items())
    return "暂无保存的偏好"

store = InMemoryStore()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_preference, get_all_preferences],
    context_schema=Context,
    store=store,
)

config = {"configurable": {"thread_id": "store-demo"}}

# 保存偏好
r = agent.invoke(
    {"messages": [{"role": "user", "content": "把我的语言偏好设置为中文，主题设置为暗黑模式"}]},
    {**config, "context": Context(user_id="user_001")}
)
print(f"保存: {r['messages'][-1].content[:60]}")

# 读取偏好
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我保存了什么偏好？"}]},
    {**config, "context": Context(user_id="user_001")}
)
print(f"读取: {r['messages'][-1].content[:80]}")
```

---

## Demo 7：工具上下文 — 写入 State（Command）

```python
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent
from langgraph.types import Command

@tool
def login(username: str, password: str, runtime: ToolRuntime) -> Command:
    """用户登录，更新认证状态。"""
    if username == "admin" and password == "123456":
        return Command(update={"authenticated": True, "auth_level": "admin"})
    elif username == "user" and password == "123456":
        return Command(update={"authenticated": True, "auth_level": "user"})
    else:
        return Command(update={"authenticated": False, "auth_level": "none"})

@tool
def check_permission(action: str, runtime: ToolRuntime) -> str:
    """检查当前用户是否有权限执行某操作。"""
    state = runtime.state
    auth_level = state.get("auth_level", "none")

    permissions = {
        "admin": ["read", "write", "delete", "manage"],
        "user": ["read", "write"],
        "none": ["read"],
    }

    allowed = permissions.get(auth_level, [])
    if action in allowed:
        return f"✓ 你有权限执行 '{action}' 操作"
    else:
        return f"✗ 你没有权限执行 '{action}' 操作（需要 {auth_level} 权限）"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[login, check_permission],
)

# 登录
r = agent.invoke({"messages": [{"role": "user", "content": "用 admin/123456 登录"}]})
print(f"登录: {r['messages'][-1].content[:50]}")

# 检查权限
r = agent.invoke({"messages": [{"role": "user", "content": "我能执行删除操作吗？"}]})
print(f"权限: {r['messages'][-1].content[:50]}")
```

---

## Demo 8：工具选择 — 基于角色的动态工具过滤

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
def edit_settings() -> str:
    """编辑系统设置。"""
    return "设置已更新"

@tool
def delete_data() -> str:
    """删除数据。"""
    return "数据已删除"

@wrap_model_call
def role_based_tools(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """根据角色过滤工具。"""
    role = request.runtime.context.user_role

    if role == "admin":
        pass  # 全部工具
    elif role == "editor":
        tools = [t for t in request.tools if t.name != "delete_data"]
        request = request.override(tools=tools)
    else:
        tools = [t for t in request.tools if t.name == "view_reports"]
        request = request.override(tools=tools)

    return handler(request)

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[view_reports, edit_settings, delete_data],
    middleware=[role_based_tools],
    context_schema=Context,
)

# admin
r = agent.invoke(
    {"messages": [{"role": "user", "content": "列出你能做的操作"}]},
    context=Context(user_role="admin")
)
print(f"admin: {r['messages'][-1].content[:80]}")

# viewer
r = agent.invoke(
    {"messages": [{"role": "user", "content": "列出你能做的操作"}]},
    context=Context(user_role="viewer")
)
print(f"viewer: {r['messages'][-1].content[:80]}")
```

---

## Demo 9：模型选择 — 基于对话长度的动态模型

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from typing import Callable

# 模拟不同模型（实际使用时替换为真实模型）
@wrap_model_call
def state_based_model(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """根据对话长度选择模型。"""
    message_count = len(request.messages)

    if message_count > 15:
        model_hint = "（使用大模型）"
    elif message_count > 8:
        model_hint = "（使用标准模型）"
    else:
        model_hint = "（使用轻量模型）"

    print(f"[模型选择] 消息数: {message_count}, {model_hint}")
    return handler(request)

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[state_based_model],
)

# 短对话
r = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"回复: {r['messages'][-1].content[:30]}")
```

---

## Demo 10：响应格式 — 根据对话阶段选择输出格式

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from pydantic import BaseModel, Field
from typing import Callable

class SimpleResponse(BaseModel):
    """对话早期的简单响应。"""
    answer: str = Field(description="简短回答")

class DetailedResponse(BaseModel):
    """已建立对话的详细响应。"""
    answer: str = Field(description="详细回答")
    reasoning: str = Field(description="推理过程")
    confidence: float = Field(description="置信度 0-1")

@wrap_model_call
def state_based_output(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """根据对话阶段选择输出格式。"""
    message_count = len(request.messages)

    if message_count < 5:
        request = request.override(response_format=SimpleResponse)
        print(f"[输出格式] 简单格式（消息数: {message_count}）")
    else:
        request = request.override(response_format=DetailedResponse)
        print(f"[输出格式] 详细格式（消息数: {message_count}）")

    return handler(request)

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[state_based_output],
)

# 简单格式
r = agent.invoke({"messages": [{"role": "user", "content": "什么是 Python？"}]})
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## Demo 11：生命周期上下文 — 总结中间件

```python
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langgraph.checkpoint.memory import InMemorySaver

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        SummarizationMiddleware(
            model="openai:gpt-4o-mini",
            trigger={"tokens": 500},
            keep={"messages": 4},
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "summary-ce-1"}}

# 多轮对话
topics = ["我叫小明", "我是Python开发者", "我在学LangChain", "我喜欢AI", "我在北京工作"]
for topic in topics:
    r = agent.invoke({"messages": [{"role": "user", "content": topic}]}, config)
    print(f"回复: {r['messages'][-1].content[:40]}...")

# 总结后仍然记得
r = agent.invoke({"messages": [{"role": "user", "content": "我叫什么？在哪工作？"}]}, config)
print(f"记忆: {r['messages'][-1].content[:80]}")
```

---

## Demo 12：完整实战 — 综合上下文工程

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import (
    dynamic_prompt, wrap_model_call,
    ModelRequest, ModelResponse, SummarizationMiddleware
)
from langchain.tools import tool, ToolRuntime
from langgraph.store.memory import InMemoryStore
from langgraph.checkpoint.memory import InMemorySaver
from typing import Callable

# 1. 定义上下文
@dataclass
class Context:
    user_id: str
    user_role: str

# 2. 动态提示（从 Store + Runtime）
@dynamic_prompt
def smart_prompt(request: ModelRequest) -> str:
    name = request.runtime.context.user_id
    role = request.runtime.context.user_role
    store = request.runtime.store

    base = f"你是一个有帮助的助手。用户: {name}，角色: {role}。"

    if store:
        prefs = store.get(("preferences",), name)
        if prefs:
            base += f"\n用户偏好: {prefs.value}"

    return base

# 3. 工具（读写 Store）
@tool
def save_pref(key: str, value: str, runtime: ToolRuntime[Context]) -> str:
    """保存用户偏好。"""
    uid = runtime.context.user_id
    if runtime.store:
        existing = runtime.store.get(("preferences",), uid)
        prefs = existing.value if existing else {}
        prefs[key] = value
        runtime.store.put(("preferences",), uid, prefs)
        return f"已保存: {key} = {value}"
    return "Store 不可用"

@tool
def get_info(runtime: ToolRuntime[Context]) -> str:
    """获取当前用户信息。"""
    return f"用户: {runtime.context.user_id}, 角色: {runtime.context.user_role}"

# 4. 创建 Agent
store = InMemoryStore()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_pref, get_info],
    middleware=[
        smart_prompt,
        SummarizationMiddleware(
            model="openai:gpt-4o-mini",
            trigger={"tokens": 1000},
            keep={"messages": 6},
        ),
    ],
    context_schema=Context,
    store=store,
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "ce-final"}}

# 测试
r = agent.invoke(
    {"messages": [{"role": "user", "content": "你好，我是谁？"}]},
    {**config, "context": Context(user_id="小明", user_role="admin")}
)
print(f"回复 1: {r['messages'][-1].content[:60]}")

r = agent.invoke(
    {"messages": [{"role": "user", "content": "把语言偏好设置为中文"}]},
    {**config, "context": Context(user_id="小明", user_role="admin")}
)
print(f"回复 2: {r['messages'][-1].content[:60]}")

r = agent.invoke(
    {"messages": [{"role": "user", "content": "我保存了什么偏好？"}]},
    {**config, "context": Context(user_id="小明", user_role="admin")}
)
print(f"回复 3: {r['messages'][-1].content[:60]}")
```

---

## 运行说明

1. Demo 1-3 模型上下文：动态提示（State/Store/Runtime）
2. Demo 4 消息上下文：注入文件信息
3. Demo 5-7 工具上下文：读写 State/Store
4. Demo 8 动态工具选择
5. Demo 9 动态模型选择
6. Demo 10 动态响应格式
7. Demo 11 生命周期上下文：总结
8. Demo 12 完整实战
