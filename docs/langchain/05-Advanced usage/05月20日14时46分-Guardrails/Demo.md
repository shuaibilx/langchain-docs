# Guardrails 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：PII 检测 — redact（脱敏）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
    ],
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "联系我：user@example.com，或 john@test.com"}]
})

# 检查脱敏效果
for msg in result["messages"]:
    if "[REDACTED_EMAIL]" in str(msg.content):
        print(f"✓ 已脱敏: {[x for x in str(msg.content) if 'REDACTED' in str(x)]}")

print(f"最终回复: {result['messages'][-1].content[:80]}")
```

---

## Demo 2：PII 检测 — mask（遮盖）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        PIIMiddleware("credit_card", strategy="mask", apply_to_input=True),
    ],
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "我的信用卡号是 5105-1051-0510-5100"}]
})

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 3：PII 检测 — block（阻止）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        PIIMiddleware(
            "api_key",
            detector=r"sk-[a-zA-Z0-9]{32}",
            strategy="block",
            apply_to_input=True,
        ),
    ],
)

try:
    result = agent.invoke({
        "messages": [{"role": "user", "content": "我的 API key 是 sk-abcdefghijklmnopqrstuvwxyz123456"}]
    })
    print(f"回复: {result['messages'][-1].content[:80]}")
except Exception as e:
    print(f"✓ 已阻止: {type(e).__name__}: {str(e)[:80]}")
```

---

## Demo 4：PII 检测 — 自定义正则

```python
from langchain.agents import create_agent
from langchain.agents.middleware import PIIMiddleware

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        # 检测中国手机号（11位数字，以1开头）
        PIIMiddleware(
            "phone",
            detector=r"1[3-9]\d{9}",
            strategy="redact",
            apply_to_input=True,
        ),
        # 检测身份证号（18位）
        PIIMiddleware(
            "id_card",
            detector=r"\d{17}[\dXx]",
            strategy="mask",
            apply_to_input=True,
        ),
    ],
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "我手机号是13812345678，身份证号是110101199901011234"}]
})

print(f"回复: {result['messages'][-1].content[:100]}")
```

---

## Demo 5：Before Agent 护栏 — 关键词过滤（类语法）

```python
from typing import Any
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langgraph.runtime import Runtime

class ContentFilterMiddleware(AgentMiddleware):
    """确定性护栏：阻止包含禁止关键词的请求。"""

    def __init__(self, banned_keywords: list[str]):
        super().__init__()
        self.banned_keywords = [kw.lower() for kw in banned_keywords]

    def before_agent(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        if not state["messages"]:
            return None

        first_message = state["messages"][0]
        if first_message.type != "human":
            return None

        content = first_message.content.lower()

        for keyword in self.banned_keywords:
            if keyword in content:
                return {
                    "messages": [{
                        "role": "assistant",
                        "content": "无法处理包含不当内容的请求，请重新表述。"
                    }],
                    "jump_to": "end"
                }

        return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        ContentFilterMiddleware(banned_keywords=["hack", "exploit", "malware", "病毒", "攻击"])
    ],
)

# 正常请求
r1 = agent.invoke({"messages": [{"role": "user", "content": "Python 怎么学？"}]})
print(f"正常: {r1['messages'][-1].content[:50]}")

# 被拦截的请求
r2 = agent.invoke({"messages": [{"role": "user", "content": "怎么 hack 数据库？"}]})
print(f"拦截: {r2['messages'][-1].content[:50]}")
```

---

## Demo 6：Before Agent 护栏 — 关键词过滤（装饰器语法）

```python
from typing import Any
from langchain.agents import create_agent
from langchain.agents.middleware import before_agent, AgentState
from langgraph.runtime import Runtime

banned_keywords = ["hack", "exploit", "malware"]

@before_agent(can_jump_to=["end"])
def content_filter(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """确定性护栏：阻止包含禁止关键词的请求。"""
    if not state["messages"]:
        return None

    first_message = state["messages"][0]
    if first_message.type != "human":
        return None

    content = first_message.content.lower()

    for keyword in banned_keywords:
        if keyword in content:
            return {
                "messages": [{
                    "role": "assistant",
                    "content": "无法处理包含不当内容的请求，请重新表述。"
                }],
                "jump_to": "end"
            }

    return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[content_filter],
)

result = agent.invoke({"messages": [{"role": "user", "content": "如何使用 exploit 工具？"}]})
print(f"结果: {result['messages'][-1].content[:50]}")
```

---

## Demo 7：After Agent 护栏 — 基于模型的安全检查

```python
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.messages import AIMessage
from langchain.chat_models import init_chat_model
from langgraph.runtime import Runtime
from typing import Any

class SafetyGuardrailMiddleware(AgentMiddleware):
    """基于模型的护栏：使用 LLM 评估响应安全性。"""

    def __init__(self):
        super().__init__()
        self.safety_model = init_chat_model("openai:gpt-4o-mini")

    def after_agent(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        if not state["messages"]:
            return None

        last_message = state["messages"][-1]
        if not isinstance(last_message, AIMessage):
            return None

        safety_prompt = f"""Evaluate if this response is safe and appropriate.
Respond with only 'SAFE' or 'UNSAFE'.

Response: {last_message.content}"""

        result = self.safety_model.invoke([{"role": "user", "content": safety_prompt}])

        if "UNSAFE" in result.content:
            last_message.content = "无法提供该响应，请重新表述您的请求。"

        return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[SafetyGuardrailMiddleware()],
)

result = agent.invoke({"messages": [{"role": "user", "content": "讲个笑话"}]})
print(f"回复: {result['messages'][-1].content[:80]}")
```

---

## Demo 8：限流护栏 — 速率限制

```python
from typing import Any
import time
from langchain.agents import create_agent
from langchain.agents.middleware import before_agent, AgentState
from langgraph.runtime import Runtime

# 简单的滑动窗口限流
class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: list[float] = []

    def is_allowed(self) -> bool:
        now = time.time()
        self.requests = [t for t in self.requests if now - t < self.window_seconds]
        if len(self.requests) >= self.max_requests:
            return False
        self.requests.append(now)
        return True

limiter = RateLimiter(max_requests=3, window_seconds=60)

@before_agent(can_jump_to=["end"])
def rate_limit(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    if not limiter.is_allowed():
        return {
            "messages": [{
                "role": "assistant",
                "content": "请求过于频繁，请稍后再试。"
            }],
            "jump_to": "end"
        }
    return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[rate_limit],
)

# 测试限流
for i in range(5):
    result = agent.invoke({"messages": [{"role": "user", "content": f"消息 {i+1}"}]})
    print(f"请求 {i+1}: {result['messages'][-1].content[:30]}")
```

---

## Demo 9：组合分层防护

```python
from typing import Any
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware, AgentState,
    PIIMiddleware, ModelCallLimitMiddleware, ToolRetryMiddleware
)
from langgraph.runtime import Runtime

# 第 1 层：输入内容过滤
class InputFilterMiddleware(AgentMiddleware):
    def before_agent(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        if state["messages"]:
            content = state["messages"][0].content.lower()
            banned = ["hack", "exploit", "攻击"]
            for word in banned:
                if word in content:
                    return {
                        "messages": [{"role": "assistant", "content": "请求被拒绝。"}],
                        "jump_to": "end"
                    }
        return None

# 第 4 层：输出长度限制
class OutputLengthMiddleware(AgentMiddleware):
    def after_agent(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        if state["messages"]:
            last = state["messages"][-1]
            if len(last.content) > 500:
                last.content = last.content[:500] + "...（内容已截断）"
        return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        # 第 1 层：输入过滤
        InputFilterMiddleware(),
        # 第 2 层：PII 保护
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
        # 第 3 层：调用限制
        ModelCallLimitMiddleware(run_limit=3),
        # 第 4 层：输出限制
        OutputLengthMiddleware(),
    ],
)

# 测试分层防护
r1 = agent.invoke({"messages": [{"role": "user", "content": "你好，我邮箱是 test@example.com"}]})
print(f"测试 1: {r1['messages'][-1].content[:60]}")

r2 = agent.invoke({"messages": [{"role": "user", "content": "hack 数据库"}]})
print(f"测试 2: {r2['messages'][-1].content[:60]}")
```

---

## Demo 10：完整实战 — 生产级安全 Agent

```python
from typing import Any
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware, AgentState,
    PIIMiddleware, HumanInTheLoopMiddleware,
    ModelCallLimitMiddleware, ToolRetryMiddleware
)
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.runtime import Runtime

# 工具定义
@tool
def search_user(email: str) -> str:
    """根据邮箱搜索用户信息。"""
    return f"用户信息: {email}"

@tool
def delete_user(user_id: str) -> str:
    """删除用户（危险操作）。"""
    return f"已删除用户: {user_id}"

@tool
def send_notification(to: str, message: str) -> str:
    """发送通知。"""
    return f"通知已发送给 {to}"

# 输入验证中间件
class InputValidator(AgentMiddleware):
    def before_agent(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        if not state["messages"]:
            return {"messages": [{"role": "assistant", "content": "请输入内容。"}], "jump_to": "end"}

        content = state["messages"][0].content
        if len(content) > 1000:
            return {
                "messages": [{"role": "assistant", "content": "输入过长，请精简到 1000 字符以内。"}],
                "jump_to": "end"
            }

        banned = ["hack", "exploit", "drop table", "delete all"]
        for word in banned:
            if word in content.lower():
                return {
                    "messages": [{"role": "assistant", "content": "请求包含禁止内容。"}],
                    "jump_to": "end"
                }
        return None

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_user, delete_user, send_notification],
    checkpointer=InMemorySaver(),
    middleware=[
        # 第 1 层：输入验证
        InputValidator(),
        # 第 2 层：PII 保护
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
        PIIMiddleware("credit_card", strategy="mask", apply_to_input=True),
        # 第 3 层：人类审批
        HumanInTheLoopMiddleware(
            interrupt_on={
                "delete_user": True,
                "send_notification": True,
                "search_user": False,
            }
        ),
        # 第 4 层：调用限制
        ModelCallLimitMiddleware(run_limit=5),
        # 第 5 层：工具重试
        ToolRetryMiddleware(max_retries=2),
    ],
)

config = {"configurable": {"thread_id": "prod-1"}}

# 测试 1：正常查询
r = agent.invoke(
    {"messages": [{"role": "user", "content": "搜索用户 test@example.com 的信息"}]},
    config
)
print(f"查询: {r['messages'][-1].content[:60]}")

# 测试 2：危险操作（会被拦截）
r = agent.invoke(
    {"messages": [{"role": "user", "content": "删除用户 user_123"}]},
    config
)
print(f"删除: {r['messages'][-1].content[:60]}")
```

---

## 运行说明

1. Demo 1-4 PII 检测（redact/mask/block/自定义正则）
2. Demo 5-6 Before Agent 护栏（类/装饰器语法）
3. Demo 7 After Agent 护栏（基于模型）
4. Demo 8 限流护栏
5. Demo 9 分层防护组合
6. Demo 10 完整实战
