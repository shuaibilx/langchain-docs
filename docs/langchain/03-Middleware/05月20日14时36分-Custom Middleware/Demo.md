# Custom Middleware 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：装饰器 — before_model 日志

```python
from langchain.agents import create_agent
from langchain.agents.middleware import before_model, AgentState
from langgraph.runtime import Runtime
from typing import Any

@before_model
def log_before_model(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    msg_count = len(state["messages"])
    print(f"[before_model] 消息数: {msg_count}")
    return None  # 不修改状态

agent = create_agent("openai:gpt-4o-mini", tools=[], middleware=[log_before_model])

result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"回复: {result['messages'][-1].content[:50]}")
```

---

## Demo 2：装饰器 — after_model 监控

```python
from langchain.agents import create_agent
from langchain.agents.middleware import after_model, AgentState
from langgraph.runtime import Runtime
from typing import Any

@after_model
def log_after_model(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    last = state["messages"][-1]
    has_tools = hasattr(last, 'tool_calls') and last.tool_calls
    print(f"[after_model] 内容: {last.content[:30]}... | 工具调用: {has_tools}")
    return None

agent = create_agent("openai:gpt-4o-mini", tools=[], middleware=[log_after_model])

result = agent.invoke({"messages": [{"role": "user", "content": "1+1=?"}]})
```

---

## Demo 3：装饰器 — wrap_model_call 重试

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from typing import Callable

@wrap_model_call
def retry_model(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse],
) -> ModelResponse:
    for attempt in range(3):
        try:
            return handler(request)
        except Exception as e:
            print(f"[重试] 第 {attempt+1} 次失败: {e}")
            if attempt == 2:
                raise
    return handler(request)  # 不会到这里

agent = create_agent("openai:gpt-4o-mini", tools=[], middleware=[retry_model])

result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"回复: {result['messages'][-1].content[:50]}")
```

---

## Demo 4：装饰器 — wrap_tool_call 监控

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_tool_call
from langchain.messages import ToolMessage
from langchain.tools.tool_node import ToolCallRequest
from langchain.tools import tool
from typing import Callable
from langgraph.types import Command

@tool
def calculate(expr: str) -> str:
    """计算表达式。"""
    return str(eval(expr))

@wrap_tool_call
def monitor_tool(
    request: ToolCallRequest,
    handler: Callable[[ToolCallRequest], ToolMessage | Command],
) -> ToolMessage | Command:
    name = request.tool_call["name"]
    args = request.tool_call["args"]
    print(f"[工具监控] 调用: {name}({args})")
    try:
        result = handler(request)
        print(f"[工具监控] 成功: {str(result.content)[:50]}")
        return result
    except Exception as e:
        print(f"[工具监控] 失败: {e}")
        raise

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[calculate],
    middleware=[monitor_tool]
)

result = agent.invoke({"messages": [{"role": "user", "content": "计算 15*23+47"}]})
print(f"回复: {result['messages'][-1].content[:50]}")
```

---

## Demo 5：类 — 多钩子中间件

```python
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, AgentState, ModelRequest, ModelResponse
from langgraph.runtime import Runtime
from typing import Any, Callable

class LoggingMiddleware(AgentMiddleware):
    def __init__(self, prefix: str = "LOG"):
        super().__init__()
        self.prefix = prefix

    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        print(f"[{self.prefix}] 模型调用前 - 消息数: {len(state['messages'])}")
        return None

    def after_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        last = state["messages"][-1]
        print(f"[{self.prefix}] 模型调用后 - 内容: {last.content[:30]}...")
        return None

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[LoggingMiddleware(prefix="TEST")]
)

result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"回复: {result['messages'][-1].content[:50]}")
```

---

## Demo 6：类 — 动态提示中间件

```python
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain.messages import SystemMessage
from typing import Callable
from datetime import datetime

class DynamicContextMiddleware(AgentMiddleware):
    def __init__(self, user_name: str):
        super().__init__()
        self.user_name = user_name

    def wrap_model_call(
        self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]
    ) -> ModelResponse:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        context = f"当前时间: {now}。用户: {self.user_name}。请用中文回答。"

        new_content = list(request.system_message.content_blocks) + [
            {"type": "text", "text": context}
        ]
        new_msg = SystemMessage(content=new_content)
        return handler(request.override(system_message=new_msg))

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[DynamicContextMiddleware(user_name="小明")]
)

result = agent.invoke({"messages": [{"role": "user", "content": "你好，现在几点？"}]})
print(f"回复: {result['messages'][-1].content[:80]}")
```

---

## Demo 7：类 — 动态工具选择

```python
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain.tools import tool
from typing import Callable

@tool
def public_info(query: str) -> str:
    """公开信息查询。"""
    return f"公开信息: {query}"

@tool
def admin_action(action: str) -> str:
    """管理员操作。"""
    return f"管理员操作: {action}"

class RoleBasedToolSelector(AgentMiddleware):
    def wrap_model_call(
        self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]
    ) -> ModelResponse:
        role = request.runtime.context.get("role", "user")

        if role == "admin":
            tools = request.tools  # 全部工具
        else:
            tools = [t for t in request.tools if not t.name.startswith("admin_")]

        return handler(request.override(tools=tools))

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[public_info, admin_action],
    middleware=[RoleBasedToolSelector()],
    context_schema=dict
)

# 普通用户
r = agent.invoke(
    {"messages": [{"role": "user", "content": "执行清理操作"}]},
    context={"role": "user"}
)
print(f"用户: {r['messages'][-1].content[:50]}")

# 管理员
r = agent.invoke(
    {"messages": [{"role": "user", "content": "执行清理操作"}]},
    context={"role": "admin"}
)
print(f"管理员: {r['messages'][-1].content[:50]}")
```

---

## Demo 8：自定义状态 + 跳转

```python
from langchain.agents import create_agent
from langchain.agents.middleware import AgentState, before_model, after_model, hook_config
from langchain.messages import AIMessage
from langgraph.runtime import Runtime
from langgraph.checkpoint.memory import InMemorySaver
from typing_extensions import NotRequired
from typing import Any

class LimitState(AgentState):
    call_count: NotRequired[int]

@before_model(state_schema=LimitState, can_jump_to=["end"])
def check_limit(state: LimitState, runtime: Runtime) -> dict[str, Any] | None:
    count = state.get("call_count", 0)
    print(f"[检查] 模型调用次数: {count}")
    if count >= 3:
        return {
            "messages": [AIMessage("已达到调用限制。")],
            "jump_to": "end"
        }
    return None

@after_model(state_schema=LimitState)
def increment_count(state: LimitState, runtime: Runtime) -> dict[str, Any] | None:
    count = state.get("call_count", 0) + 1
    print(f"[计数] 更新为 {count}")
    return {"call_count": count}

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[check_limit, increment_count],
    checkpointer=InMemorySaver()
)

config = {"configurable": {"thread_id": "limit-1"}}

# 多轮调用
for i in range(5):
    result = agent.invoke(
        {"messages": [{"role": "user", "content": f"消息 {i+1}"}]},
        config
    )
    print(f"轮次 {i+1}: {result['messages'][-1].content[:30]}...\n")
```

---

## Demo 9：执行顺序验证

```python
from langchain.agents import create_agent
from langchain.agents.middleware import before_model, after_model, wrap_model_call, AgentState, ModelRequest, ModelResponse
from langgraph.runtime import Runtime
from typing import Any, Callable

@before_model
def mw_a_before(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    print("[A] before_model")
    return None

@before_model
def mw_b_before(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    print("[B] before_model")
    return None

@wrap_model_call
def mw_a_wrap(request: ModelRequest, handler: Callable) -> ModelResponse:
    print("[A] wrap_model_call 入口")
    result = handler(request)
    print("[A] wrap_model_call 出口")
    return result

@wrap_model_call
def mw_b_wrap(request: ModelRequest, handler: Callable) -> ModelResponse:
    print("[B] wrap_model_call 入口")
    result = handler(request)
    print("[B] wrap_model_call 出口")
    return result

@after_model
def mw_a_after(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    print("[A] after_model")
    return None

@after_model
def mw_b_after(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    print("[B] after_model")
    return None

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[mw_a_before, mw_b_before, mw_a_wrap, mw_b_wrap, mw_a_after, mw_b_after]
)

print("=== 执行顺序 ===")
result = agent.invoke({"messages": [{"role": "user", "content": "你好"}]})
print(f"\n回复: {result['messages'][-1].content[:30]}")
```

---

## Demo 10：完整实战 — 综合中间件

```python
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware, AgentState, ModelRequest, ModelResponse,
    before_model, after_model, wrap_model_call, wrap_tool_call
)
from langchain.messages import ToolMessage, SystemMessage
from langchain.tools.tool_node import ToolCallRequest
from langgraph.runtime import Runtime
from langgraph.types import Command
from typing import Any, Callable
from datetime import datetime
from typing_extensions import NotRequired

# 自定义状态
class AppState(AgentState):
    request_count: NotRequired[int]
    last_query_time: NotRequired[str]

# 1. 请求计数
@after_model(state_schema=AppState)
def track_requests(state: AppState, runtime: Runtime) -> dict[str, Any] | None:
    count = state.get("request_count", 0) + 1
    return {
        "request_count": count,
        "last_query_time": datetime.now().isoformat()
    }

# 2. 动态上下文注入
class ContextInjector(AgentMiddleware):
    def wrap_model_call(
        self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]
    ) -> ModelResponse:
        count = request.state.get("request_count", 0)
        context = f"这是第 {count + 1} 次请求。当前时间: {datetime.now().strftime('%H:%M')}"

        new_content = list(request.system_message.content_blocks) + [
            {"type": "text", "text": context}
        ]
        return handler(request.override(system_message=SystemMessage(content=new_content)))

# 3. 工具调用日志
@wrap_tool_call
def log_tools(
    request: ToolCallRequest,
    handler: Callable[[ToolCallRequest], ToolMessage | Command],
) -> ToolMessage | Command:
    name = request.tool_call["name"]
    print(f"[工具] {name} 被调用")
    return handler(request)

# 组合
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    middleware=[track_requests, ContextInjector(), log_tools]
)

# 多轮对话
for i in range(3):
    r = agent.invoke({"messages": [{"role": "user", "content": f"问题 {i+1}"}]})
    print(f"回复 {i+1}: {r['messages'][-1].content[:40]}...\n")
```

---

## 运行说明

1. Demo 1-2 节点风格钩子
2. Demo 3-4 包装风格钩子
3. Demo 5-7 类方式创建中间件
4. Demo 8 自定义状态 + 跳转
5. Demo 9 执行顺序验证
6. Demo 10 完整实战
