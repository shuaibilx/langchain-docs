# Built-in Middleware 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：SummarizationMiddleware — 自动总结

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
            trigger=("tokens", 1500),   # token 达到 1500 时触发
            keep=("messages", 4),       # 保留最近 4 条
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "summary-1"}}

# 多轮对话积累上下文
topics = ["我叫小明", "我是Python开发者", "我在学LangChain", "我喜欢AI", "我在北京工作"]
for topic in topics:
    r = agent.invoke({"messages": [{"role": "user", "content": topic}]}, config)
    print(f"回复: {r['messages'][-1].content[:40]}...")

# 总结后仍然记得关键信息
r = agent.invoke({"messages": [{"role": "user", "content": "我叫什么？在哪工作？"}]}, config)
print(f"记忆测试: {r['messages'][-1].content}")
```

---

## Demo 2：HumanInTheLoopMiddleware — 人类审批

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

@tool
def read_data(query: str) -> str:
    """读取数据。"""
    return f"数据: {query}"

@tool
def delete_data(target: str) -> str:
    """删除数据（需要审批）。"""
    return f"已删除: {target}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[read_data, delete_data],
    checkpointer=InMemorySaver(),
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "delete_data": True,    # 需要审批
                "read_data": False,     # 不需要审批
            }
        ),
    ],
)

config = {"configurable": {"thread_id": "hitl-1"}}

# 第一次调用 — 会中断等待审批
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除 user_123 的数据"}]},
    config
)

# 检查是否有中断
if "__interrupt__" in result:
    print("需要人类审批！")
    print(f"中断信息: {result['__interrupt__']}")
```

---

## Demo 3：ModelCallLimitMiddleware — 模型调用限制

```python
from langchain.agents import create_agent
from langchain.agents.middleware import ModelCallLimitMiddleware
from langgraph.checkpoint.memory import InMemorySaver

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    checkpointer=InMemorySaver(),
    middleware=[
        ModelCallLimitMiddleware(
            run_limit=3,        # 单次最多 3 次模型调用
            exit_behavior="end",
        ),
    ],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "写一篇关于AI的短文"}]},
    {"configurable": {"thread_id": "limit-1"}}
)
print(f"回复: {result['messages'][-1].content[:100]}...")
```

---

## Demo 4：ToolCallLimitMiddleware — 工具调用限制

```python
from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """搜索。"""
    return f"结果: {query}"

@tool
def calculate(expr: str) -> str:
    """计算。"""
    return str(eval(expr))

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search, calculate],
    middleware=[
        # 全局限制
        ToolCallLimitMiddleware(run_limit=5),
        # 特定工具限制
        ToolCallLimitMiddleware(
            tool_name="search",
            run_limit=2,
            exit_behavior="continue",
        ),
    ],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "搜索Python、JavaScript和Rust"}]}
)
print(f"回复: {result['messages'][-1].content[:100]}...")
```

---

## Demo 5：ModelFallbackMiddleware — 模型回退

```python
from langchain.agents import create_agent
from langchain.agents.middleware import ModelFallbackMiddleware

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    middleware=[
        ModelFallbackMiddleware(
            "openai:gpt-4o",           # 第一回退
            "openai:gpt-4o-mini",      # 第二回退
        ),
    ],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "你好"}]}
)
print(f"回复: {result['messages'][-1].content[:50]}...")
```

---

## Demo 6：PIIMiddleware — PII 检测

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

# 输入中的邮箱会被脱敏
result = agent.invoke(
    {"messages": [{"role": "user", "content": "联系我：user@example.com"}]}
)
print(f"回复: {result['messages'][-1].content[:100]}...")

# 检查消息中是否还有邮箱
for msg in result["messages"]:
    if "example.com" in str(msg.content):
        print(f"警告: 发现未脱敏的邮箱")
    if "[REDACTED_EMAIL]" in str(msg.content):
        print(f"已脱敏: 发现 [REDACTED_EMAIL]")
```

---

## Demo 7：ToolRetryMiddleware — 工具重试

```python
from langchain.agents import create_agent
from langchain.agents.middleware import ToolRetryMiddleware
from langchain.tools import tool

call_count = 0

@tool
def unreliable_api(query: str) -> str:
    """一个不稳定的 API。"""
    global call_count
    call_count += 1
    if call_count < 3:
        raise ConnectionError("API 超时")
    return f"成功: {query}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[unreliable_api],
    middleware=[
        ToolRetryMiddleware(
            max_retries=3,
            backoff_factor=0.1,  # 快速重试（Demo 用）
            initial_delay=0.1,
        ),
    ],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "查询数据 test_123"}]}
)
print(f"回复: {result['messages'][-1].content[:80]}...")
print(f"总共调用次数: {call_count}")
```

---

## Demo 8：多个中间件组合

```python
from langchain.agents import create_agent
from langchain.agents.middleware import (
    SummarizationMiddleware,
    ToolRetryMiddleware,
    ModelCallLimitMiddleware,
    ToolCallLimitMiddleware,
)
from langgraph.checkpoint.memory import InMemorySaver

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    checkpointer=InMemorySaver(),
    middleware=[
        # 1. 自动总结
        SummarizationMiddleware(
            model="openai:gpt-4o-mini",
            trigger=("tokens", 2000),
            keep=("messages", 10),
        ),
        # 2. 模型调用限制
        ModelCallLimitMiddleware(run_limit=5),
        # 3. 工具重试
        ToolRetryMiddleware(max_retries=2),
    ],
)

config = {"configurable": {"thread_id": "combo-1"}}

# 多轮对话
for i in range(4):
    r = agent.invoke(
        {"messages": [{"role": "user", "content": f"消息 {i+1}: 记住我叫小明"}]},
        config
    )
    print(f"轮次 {i+1}: {r['messages'][-1].content[:40]}...")
```

---

## Demo 9：LLMToolSelectorMiddleware — 智能工具选择

```python
from langchain.agents import create_agent
from langchain.agents.middleware import LLMToolSelectorMiddleware
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网页。"""
    return f"网页结果: {query}"

@tool
def search_db(query: str) -> str:
    """搜索数据库。"""
    return f"数据库结果: {query}"

@tool
def send_email(to: str, content: str) -> str:
    """发送邮件。"""
    return f"邮件已发送给 {to}"

@tool
def calculate(expr: str) -> str:
    """计算表达式。"""
    return str(eval(expr))

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_web, search_db, send_email, calculate],
    middleware=[
        LLMToolSelectorMiddleware(
            model="openai:gpt-4o-mini",
            max_tools=2,               # 最多选 2 个工具
            always_include=["search_web"],  # 总是包含搜索
        ),
    ],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "计算 15*23+47"}]}
)
print(f"回复: {result['messages'][-1].content[:80]}...")
```

---

## Demo 10：TodoListMiddleware — 任务规划

```python
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware
from langchain.tools import tool

@tool
def write_code(filename: str, content: str) -> str:
    """写代码文件。"""
    return f"已创建 {filename}"

@tool
def run_tests(test_file: str) -> str:
    """运行测试。"""
    return f"测试通过: {test_file}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[write_code, run_tests],
    middleware=[TodoListMiddleware()],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "帮我创建一个Python计算器模块，包含加减乘除功能"}]}
)
print(f"回复: {result['messages'][-1].content[:100]}...")
```

---

## 运行说明

1. Demo 1-2 核心中间件（总结、HITL）
2. Demo 3-4 限制类中间件
3. Demo 5-6 安全类中间件
4. Demo 7 重试中间件
5. Demo 8 多中间件组合
6. Demo 9-10 智能增强中间件
