# MCP 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph langchain-mcp-adapters fastmcp
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：自定义 MCP 服务器 — 数学服务

先创建 `math_server.py`：

```python
# math_server.py
from fastmcp import FastMCP

mcp = FastMCP("Math")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers"""
    return a * b

@mcp.tool()
def divide(a: float, b: float) -> float:
    """Divide two numbers"""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

---

## Demo 2：自定义 MCP 服务器 — 天气服务

创建 `weather_server.py`：

```python
# weather_server.py
from fastmcp import FastMCP

mcp = FastMCP("Weather")

@mcp.tool()
async def get_weather(location: str) -> str:
    """Get weather for a location."""
    weather_data = {
        "北京": "晴天，25°C",
        "上海": "多云，22°C",
        "广州": "小雨，28°C",
    }
    return weather_data.get(location, f"{location}：未知天气")

@mcp.tool()
async def get_forecast(location: str, days: int = 3) -> str:
    """Get weather forecast for multiple days."""
    return f"{location} 未来 {days} 天预报：晴转多云"

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

---

## Demo 3：Agent 连接 MCP 服务器（stdio）

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    # 连接 math 服务器（stdio 传输）
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],  # 确保路径正确
            }
        }
    )

    tools = await client.get_tools()
    print(f"加载了 {len(tools)} 个工具: {[t.name for t in tools]}")

    agent = create_agent("openai:gpt-4o-mini", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 (3 + 5) * 12"}]}
    )
    print(f"回复: {result['messages'][-1].content[:100]}")

asyncio.run(main())
```

---

## Demo 4：Agent 连接多个 MCP 服务器

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            },
            "weather": {
                "transport": "http",
                "url": "http://localhost:8000/mcp",
            }
        }
    )

    tools = await client.get_tools()
    print(f"加载了 {len(tools)} 个工具: {[t.name for t in tools]}")

    agent = create_agent("openai:gpt-4o-mini", tools)

    # 数学问题
    r = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "15 * 23 + 47 等于多少？"}]}
    )
    print(f"数学: {r['messages'][-1].content[:60]}")

    # 天气问题
    r = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "北京天气怎么样？"}]}
    )
    print(f"天气: {r['messages'][-1].content[:60]}")

asyncio.run(main())
```

---

## Demo 5：带认证的 HTTP 连接

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient(
        {
            "weather": {
                "transport": "http",
                "url": "http://localhost:8000/mcp",
                "headers": {
                    "Authorization": "Bearer YOUR_API_TOKEN",
                    "X-Client-ID": "langchain-agent",
                },
            }
        }
    )

    tools = await client.get_tools()
    agent = create_agent("openai:gpt-4o-mini", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "上海天气如何？"}]}
    )
    print(f"回复: {result['messages'][-1].content[:60]}")

asyncio.run(main())
```

---

## Demo 6：工具拦截器 — 日志记录

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langchain.agents import create_agent

async def logging_interceptor(
    request: MCPToolCallRequest,
    handler,
):
    """记录工具调用前后。"""
    print(f"[拦截器] 调用前: {request.name}({request.args})")
    result = await handler(request)
    print(f"[拦截器] 调用后: {request.name} -> {str(result)[:50]}")
    return result

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        tool_interceptors=[logging_interceptor],
    )

    tools = await client.get_tools()
    agent = create_agent("openai:gpt-4o-mini", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 7 + 8"}]}
    )
    print(f"\n回复: {result['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 7：工具拦截器 — 注入用户上下文

```python
import asyncio
from dataclasses import dataclass
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langchain.agents import create_agent

@dataclass
class Context:
    user_id: str
    user_role: str

async def inject_user_context(
    request: MCPToolCallRequest,
    handler,
):
    """将用户上下文注入工具参数。"""
    runtime = request.runtime
    user_id = runtime.context.user_id
    user_role = runtime.context.user_role

    print(f"[拦截器] 用户: {user_id}, 角色: {user_role}")

    # 将用户信息注入工具参数
    modified_request = request.override(
        args={**request.args, "user_id": user_id}
    )
    return await handler(modified_request)

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        tool_interceptors=[inject_user_context],
    )

    tools = await client.get_tools()
    agent = create_agent(
        "openai:gpt-4o-mini",
        tools,
        context_schema=Context,
    )

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 10 + 20"}]},
        context=Context(user_id="user_001", user_role="admin")
    )
    print(f"回复: {result['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 8：工具拦截器 — 认证检查

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langchain.messages import ToolMessage
from langgraph.types import Command

async def require_auth(
    request: MCPToolCallRequest,
    handler,
):
    """敏感工具需要认证。"""
    runtime = request.runtime
    state = runtime.state
    is_authenticated = state.get("authenticated", False)

    sensitive_tools = ["delete_data", "send_email"]

    if request.name in sensitive_tools and not is_authenticated:
        print(f"[拦截器] 阻止未认证的调用: {request.name}")
        return ToolMessage(
            content="需要认证。请先登录。",
            tool_call_id=runtime.tool_call_id,
        )

    print(f"[拦截器] 允许调用: {request.name}")
    return await handler(request)

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        tool_interceptors=[require_auth],
    )

    tools = await client.get_tools()
    agent = create_agent("openai:gpt-4o-mini", tools)

    # 未认证状态
    result = await agent.ainvoke({
        "messages": [{"role": "user", "content": "计算 5 + 3"}],
        "authenticated": False,
    })
    print(f"回复: {result['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 9：工具拦截器 — 重试逻辑

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langchain.agents import create_agent

async def retry_interceptor(
    request: MCPToolCallRequest,
    handler,
):
    """失败时重试（最多 3 次）。"""
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            result = await handler(request)
            print(f"[重试拦截器] 成功 (尝试 {attempt + 1})")
            return result
        except Exception as e:
            last_error = e
            print(f"[重试拦截器] 失败 (尝试 {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(0.5)

    raise last_error

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        tool_interceptors=[retry_interceptor],
    )

    tools = await client.get_tools()
    agent = create_agent("openai:gpt-4o-mini", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 100 / 5"}]}
    )
    print(f"回复: {result['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 10：有状态会话

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        }
    )

    # 使用有状态会话
    async with client.session("math") as session:
        tools = await load_mcp_tools(session)
        agent = create_agent("openai:gpt-4o-mini", tools)

        # 第一次调用
        r1 = await agent.ainvoke(
            {"messages": [{"role": "user", "content": "计算 10 + 20"}]}
        )
        print(f"回复 1: {r1['messages'][-1].content[:50]}")

        # 第二次调用（同一会话）
        r2 = await agent.ainvoke(
            {"messages": [{"role": "user", "content": "再乘以 3"}]}
        )
        print(f"回复 2: {r2['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 11：进度回调

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.callbacks import Callbacks, CallbackContext
from langchain.agents import create_agent

async def on_progress(
    progress: float,
    total: float | None,
    message: str | None,
    context: CallbackContext,
):
    """处理进度更新。"""
    percent = (progress / total * 100) if total else progress
    tool_info = f" ({context.tool_name})" if context.tool_name else ""
    print(f"[{context.server_name}{tool_info}] 进度: {percent:.1f}% - {message}")

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        callbacks=Callbacks(on_progress=on_progress),
    )

    tools = await client.get_tools()
    agent = create_agent("openai:gpt-4o-mini", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 999 * 888"}]}
    )
    print(f"回复: {result['messages'][-1].content[:50]}")

asyncio.run(main())
```

---

## Demo 12：完整实战 — 综合 MCP 应用

```python
import asyncio
from dataclasses import dataclass
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langchain.agents import create_agent
from langchain.messages import ToolMessage
from typing import Any

@dataclass
class Context:
    user_id: str
    user_role: str

# 1. 日志拦截器
async def logging_interceptor(request: MCPToolCallRequest, handler):
    print(f"[日志] {request.name}({request.args})")
    result = await handler(request)
    return result

# 2. 用户上下文注入
async def inject_context(request: MCPToolCallRequest, handler):
    runtime = request.runtime
    user_id = runtime.context.user_id
    modified = request.override(args={**request.args, "user_id": user_id})
    return await handler(modified)

# 3. 认证检查
async def auth_check(request: MCPToolCallRequest, handler):
    runtime = request.runtime
    role = runtime.context.user_role
    if role != "admin" and request.name in ["delete_data"]:
        return ToolMessage(
            content="权限不足",
            tool_call_id=runtime.tool_call_id,
        )
    return await handler(request)

async def main():
    client = MultiServerMCPClient(
        {
            "math": {
                "transport": "stdio",
                "command": "python",
                "args": ["math_server.py"],
            }
        },
        tool_interceptors=[logging_interceptor, inject_context, auth_check],
    )

    tools = await client.get_tools()
    agent = create_agent(
        "openai:gpt-4o-mini",
        tools,
        context_schema=Context,
    )

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "计算 (15 + 25) * 2"}]},
        context=Context(user_id="user_001", user_role="admin")
    )
    print(f"回复: {result['messages'][-1].content[:80]}")

asyncio.run(main())
```

---

## 运行说明

1. Demo 1-2 创建 MCP 服务器文件（前置）
2. Demo 3-4 基础连接（stdio/多服务器）
3. Demo 5 带认证的 HTTP 连接
4. Demo 6-9 工具拦截器（日志/上下文/认证/重试）
5. Demo 10 有状态会话
6. Demo 11 进度回调
7. Demo 12 完整实战

注意：运行前需先启动 MCP 服务器。
