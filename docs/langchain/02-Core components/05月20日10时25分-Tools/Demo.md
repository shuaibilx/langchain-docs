# Tools 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：最简单的工具定义

```python
from langchain.tools import tool

@tool
def greet(name: str) -> str:
    """向指定的人打招呼。"""
    return f"你好，{name}！"

# 工具的基本属性
print(f"名称: {greet.name}")
print(f"描述: {greet.description}")
print(f"Schema: {greet.args_schema.schema()}")

# 直接调用工具
result = greet.invoke({"name": "小明"})
print(f"结果: {result}")
```

---

## Demo 2：自定义工具名称和描述

```python
from langchain.tools import tool

# 自定义名称
@tool("web_search")
def search(query: str) -> str:
    """Search the web for information."""
    return f"搜索结果: {query}"

print(f"名称: {search.name}")  # web_search（不是 search）

# 自定义名称 + 描述
@tool("calculator", description="执行数学计算。遇到任何数学问题都用这个工具。")
def calc(expression: str) -> str:
    """Evaluate mathematical expressions."""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"

print(f"名称: {calc.name}")
print(f"描述: {calc.description}")

# 测试
result = calc.invoke({"expression": "15 * 23 + 47"})
print(f"计算结果: {result}")
```

---

## Demo 3：Pydantic Schema（复杂输入）

```python
from langchain.tools import tool
from pydantic import BaseModel, Field
from typing import Literal

class SearchInput(BaseModel):
    """搜索参数。"""
    query: str = Field(description="搜索关键词")
    max_results: int = Field(default=5, description="最大结果数", ge=1, le=20)
    language: Literal["zh", "en"] = Field(default="zh", description="结果语言")
    include_snippets: bool = Field(default=True, description="是否包含摘要")

@tool(args_schema=SearchInput)
def advanced_search(query: str, max_results: int = 5, language: str = "zh", include_snippets: bool = True) -> str:
    """高级搜索工具，支持多种参数。"""
    result = f"搜索 '{query}'，语言={language}，最多 {max_results} 条结果"
    if include_snippets:
        result += "，包含摘要"
    return result

# 查看生成的 schema
print("Schema:", advanced_search.args_schema.schema())

# 调用
result = advanced_search.invoke({
    "query": "LangChain 教程",
    "max_results": 10,
    "language": "zh"
})
print(result)
```

---

## Demo 4：与 Agent 配合使用

```python
from langchain.tools import tool
from langchain.agents import create_agent

@tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息。"""
    weather = {"北京": "晴 25°C", "上海": "多云 22°C", "深圳": "小雨 28°C"}
    return weather.get(city, f"{city}：未知天气")

@tool
def calculate(expression: str) -> str:
    """计算数学表达式。"""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"错误: {e}"

# 创建 Agent
agent = create_agent("openai:gpt-4o-mini", tools=[get_weather, calculate])

# Agent 会自动决定调用哪个工具
result = agent.invoke({
    "messages": [{"role": "user", "content": "北京天气怎么样？另外帮我算一下 15*23+47"}]
})
print(result["messages"][-1].content)
```

---

## Demo 5：ToolRuntime — 访问对话状态

```python
from langchain.tools import tool, ToolRuntime
from langchain.messages import HumanMessage

@tool
def get_last_user_message(runtime: ToolRuntime) -> str:
    """获取用户最近一条消息。"""
    messages = runtime.state["messages"]
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.content
    return "没有找到用户消息"

@tool
def get_message_count(runtime: ToolRuntime) -> str:
    """获取对话中的消息数量。"""
    messages = runtime.state["messages"]
    return f"对话中共有 {len(messages)} 条消息"

# 与 Agent 配合
from langchain.agents import create_agent

agent = create_agent("openai:gpt-4o-mini", tools=[get_last_user_message, get_message_count])

result = agent.invoke({
    "messages": [
        {"role": "user", "content": "我最喜欢的编程语言是 Python"},
        {"role": "assistant", "content": "了解！Python 是很好的选择。"},
        {"role": "user", "content": "帮我看看我的上一条消息是什么？还有我们聊了几条消息？"}
    ]
})
print(result["messages"][-1].content)
```

---

## Demo 6：ToolRuntime — 访问 Context（不可变配置）

```python
from dataclasses import dataclass
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent

USER_DB = {
    "u001": {"name": "小明", "role": "admin", "balance": 5000},
    "u002": {"name": "小红", "role": "user", "balance": 1200},
}

@dataclass
class UserContext:
    user_id: str

@tool
def get_my_info(runtime: ToolRuntime[UserContext]) -> str:
    """获取当前用户的个人信息。"""
    user_id = runtime.context.user_id
    user = USER_DB.get(user_id)
    if user:
        return f"姓名: {user['name']}, 角色: {user['role']}, 余额: ¥{user['balance']}"
    return "用户不存在"

@tool
def get_my_balance(runtime: ToolRuntime[UserContext]) -> str:
    """获取当前用户的余额。"""
    user_id = runtime.context.user_id
    user = USER_DB.get(user_id)
    return f"¥{user['balance']}" if user else "用户不存在"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[get_my_info, get_my_balance],
    context_schema=UserContext
)

# 以不同用户身份调用
result = agent.invoke(
    {"messages": [{"role": "user", "content": "我的账户信息是什么？"}]},
    context=UserContext(user_id="u001")
)
print(f"小明: {result['messages'][-1].content}")

result = agent.invoke(
    {"messages": [{"role": "user", "content": "我的余额是多少？"}]},
    context=UserContext(user_id="u002")
)
print(f"小红: {result['messages'][-1].content}")
```

---

## Demo 7：ToolRuntime — 长期记忆（Store）

```python
from typing import Any
from langgraph.store.memory import InMemoryStore
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent

@tool
def remember_preference(key: str, value: str, runtime: ToolRuntime) -> str:
    """保存用户偏好到长期记忆。"""
    store = runtime.store
    store.put(("preferences",), key, {"value": value})
    return f"已记住: {key} = {value}"

@tool
def recall_preference(key: str, runtime: ToolRuntime) -> str:
    """从长期记忆中读取用户偏好。"""
    store = runtime.store
    result = store.get(("preferences",), key)
    if result:
        return f"{key} = {result.value['value']}"
    return f"没有找到 '{key}' 的记录"

store = InMemoryStore()
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[remember_preference, recall_preference],
    store=store
)

# 会话 1：保存偏好
agent.invoke({"messages": [{"role": "user", "content": "记住我喜欢深色主题，语言是中文"}]})
print("偏好已保存")

# 会话 2：读取偏好（模拟新对话）
result = agent.invoke({"messages": [{"role": "user", "content": "我的主题偏好是什么？"}]})
print(f"回忆结果: {result['messages'][-1].content}")
```

---

## Demo 8：返回 Command 更新状态

```python
from langchain.agents import AgentState
from langchain.messages import ToolMessage
from langchain.tools import tool, ToolRuntime
from langgraph.types import Command
from langchain.agents import create_agent

class CustomState(AgentState):
    user_name: str
    language: str

@tool
def set_user_name(name: str, runtime: ToolRuntime[None, CustomState]) -> Command:
    """设置当前用户的名字。"""
    return Command(
        update={
            "user_name": name,
            "messages": [
                ToolMessage(
                    content=f"用户名已设置为: {name}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )

@tool
def set_language(lang: str, runtime: ToolRuntime[None, CustomState]) -> Command:
    """设置首选语言。"""
    return Command(
        update={
            "language": lang,
            "messages": [
                ToolMessage(
                    content=f"语言已设置为: {lang}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )

@tool
def get_session_info(runtime: ToolRuntime[None, CustomState]) -> str:
    """获取当前会话信息。"""
    state = runtime.state
    name = state.get("user_name", "未设置")
    lang = state.get("language", "未设置")
    return f"用户: {name}, 语言: {lang}"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[set_user_name, set_language, get_session_info],
    state_schema=CustomState
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "我叫小明，设置语言为中文，然后告诉我当前会话信息"}]
})
print(result["messages"][-1].content)
```

---

## Demo 9：三种返回类型对比

```python
from langchain.tools import tool
from langchain.messages import ToolMessage
from langchain.tools import ToolRuntime
from langgraph.types import Command

# 1. 返回字符串
@tool
def get_weather_str(city: str) -> str:
    """返回字符串格式天气。"""
    return f"{city}：晴天，25°C"

# 2. 返回对象（字典）
@tool
def get_weather_dict(city: str) -> dict:
    """返回结构化天气数据。"""
    return {
        "city": city,
        "temperature": 25,
        "condition": "sunny",
        "humidity": 60
    }

# 3. 返回 Command（更新状态）
@tool
def update_weather_cache(city: str, runtime: ToolRuntime) -> Command:
    """查询天气并缓存结果。"""
    weather = f"{city}：晴天，25°C"
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=weather,
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )

# 直接调用看效果
print("字符串:", get_weather_str.invoke({"city": "北京"}))
print("字典:", get_weather_dict.invoke({"city": "北京"}))
```

---

## Demo 10：Stream Writer（流式进度更新）

```python
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent

@tool
def analyze_data(dataset: str, runtime: ToolRuntime) -> str:
    """分析数据集。"""
    writer = runtime.stream_writer

    writer(f"正在加载数据集: {dataset}...")
    # 模拟耗时操作
    writer(f"数据加载完成，开始分析...")

    writer(f"正在计算统计指标...")
    writer(f"分析完成！")

    return f"数据集 '{dataset}' 分析结果: 平均值=42, 中位数=38, 标准差=12"

agent = create_agent("openai:gpt-4o-mini", tools=[analyze_data])

# 流式调用可以看到进度
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "分析 sales_2024 数据集"}]},
    stream_mode="values"
):
    latest = chunk["messages"][-1]
    if latest.content:
        print(f"[消息] {latest.content[:80]}")
```

---

## Demo 11：错误处理中间件

```python
from collections.abc import Callable
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_tool_call
from langchain.messages import ToolMessage
from langchain.tools.tool_node import ToolCallRequest

@tool
def divide(a: float, b: float) -> str:
    """执行除法运算。"""
    return str(a / b)

@tool
def parse_number(text: str) -> str:
    """从文本中提取数字。"""
    # 故意写一个可能出错的逻辑
    return str(int(text))

@wrap_tool_call
def handle_errors(
    request: ToolCallRequest,
    handler: Callable[[ToolCallRequest], ToolMessage],
) -> ToolMessage:
    """捕获工具错误，返回友好提示。"""
    try:
        return handler(request)
    except Exception as e:
        return ToolMessage(
            content=f"工具执行出错: {str(e)}，请检查输入后重试。",
            tool_call_id=request.tool_call["id"],
        )

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[divide, parse_number],
    middleware=[handle_errors]
)

# 触发除零错误
result = agent.invoke({
    "messages": [{"role": "user", "content": "计算 10 除以 0"}]
})
print(result["messages"][-1].content)

# 触发解析错误
result = agent.invoke({
    "messages": [{"role": "user", "content": "从 'hello' 中提取数字"}]
})
print(result["messages"][-1].content)
```

---

## Demo 12：完整闭环 — 工具 + Agent + Messages

```python
from langchain.tools import tool, ToolRuntime
from langchain.agents import create_agent, AgentState
from langchain.messages import ToolMessage
from langgraph.types import Command

class AppState(AgentState):
    todo_list: list[str]

@tool
def add_todo(task: str, runtime: ToolRuntime[None, AppState]) -> Command:
    """添加待办事项。"""
    current = runtime.state.get("todo_list", [])
    new_list = current + [task]
    return Command(
        update={
            "todo_list": new_list,
            "messages": [
                ToolMessage(
                    content=f"已添加待办: {task} (共 {len(new_list)} 项)",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )

@tool
def list_todos(runtime: ToolRuntime[None, AppState]) -> str:
    """列出所有待办事项。"""
    todos = runtime.state.get("todo_list", [])
    if not todos:
        return "暂无待办事项"
    return "\n".join(f"{i+1}. {t}" for i, t in enumerate(todos))

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[add_todo, list_todos],
    state_schema=AppState
)

# 多步交互
result = agent.invoke({
    "messages": [{"role": "user", "content": "帮我添加三个待办：买菜、写代码、跑步"}]
})
print("添加后:", result["messages"][-1].content)

result = agent.invoke({
    "messages": [{"role": "user", "content": "现在有哪些待办？"}]
})
print("列表:", result["messages"][-1].content)
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-3 纯工具定义，不需要 API Key
3. Demo 4-12 需要 API Key（调用模型）
4. 建议从 Demo 1 开始，逐步理解工具的各个特性
5. Demo 5-7 重点理解 ToolRuntime 的三种记忆
6. Demo 8 理解 Command 返回类型的特殊性
