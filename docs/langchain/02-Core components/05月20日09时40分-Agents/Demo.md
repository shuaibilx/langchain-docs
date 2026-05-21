# Agents 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

设置环境变量：

```bash
export OPENAI_API_KEY="your-api-key"
```

---

##  Demo 1：最简单的 Agent（静态模型 + 静态工具）

```python
from langchain.agents import create_agent
from langchain.tools import tool

# 定义工具
@tool
def search(query: str) -> str:
    """搜索信息。"""
    return f"搜索结果：关于 '{query}' 的一些信息"

@tool
def get_weather(location: str) -> str:
    """获取指定城市的天气。"""
    weather_data = {
        "北京": "晴天，25°C",
        "上海": "多云，22°C",
        "深圳": "小雨，28°C",
    }
    return weather_data.get(location, f"{location}：未知天气")

# 创建 Agent
agent = create_agent("openai:gpt-4o-mini", tools=[search, get_weather])

# 调用 Agent
result = agent.invoke({
    "messages": [{"role": "user", "content": "北京今天天气怎么样？"}]
})

# 打印最终回复
print(result["messages"][-1].content)
```

---

## Demo 2：带系统提示的 Agent

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def translate(text: str, target_lang: str) -> str:
    """将文本翻译为目标语言。"""
    return f"将 '{text}' 翻译为 {target_lang} 的结果"

# 使用字符串系统提示
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[translate],
    system_prompt="你是一个专业的翻译助手，擅长中英互译。请简洁准确地回答。"
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "把 '你好世界' 翻译成英文"}
]
})
print(result["messages"][-1].content)
```

---

## Demo 3：使用模型实例（精细配置）

```python
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def calculate(expression: str) -> str:
    """计算数学表达式。"""
    try:
        result = eval(expression)
        return f"计算结果：{result}"
    except Exception as e:
        return f"计算错误：{e}"

# 使用模型实例，配置参数
model = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0,       # 低温度，输出更确定
    max_tokens=500,      # 限制输出长度
    timeout=30           # 超时时间
)

agent = create_agent(model, tools=[calculate])

result = agent.invoke({
    "messages": [{"role": "user", "content": "计算 (15 * 23) + 47 - 12"}]
})
print(result["messages"][-1].content)
```

---

## Demo 4：工具错误处理（中间件）

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_tool_call
from langchain.tools import tool
from langchain.messages import ToolMessage

@tool
def divide(a: float, b: float) -> str:
    """执行除法运算。"""
    return str(a / b)

@wrap_tool_call
def handle_tool_errors(request, handler):
    """捕获工具错误，返回友好提示。"""
    try:
        return handler(request)
    except Exception as e:
        return ToolMessage(
            content=f"工具执行出错：{str(e)}，请检查参数后重试。",
            tool_call_id=request.tool_call["id"]
        )

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[divide],
    middleware=[handle_tool_errors]
)

# 触发除零错误
result = agent.invoke({
    "messages": [{"role": "user", "content": "计算 10 除以 0"}]
})
print(result["messages"][-1].content)
```

---

## Demo 5：动态模型选择（中间件）

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """搜索信息。"""
    return f"搜索结果：{query}"

basic_model = ChatOpenAI(model="gpt-4o-mini")   # 便宜模型
advanced_model = ChatOpenAI(model="gpt-4o")      # 高级模型

@wrap_model_call
def dynamic_model(request: ModelRequest, handler) -> ModelResponse:
    """根据消息数量选择模型——对话越复杂用越强的模型。"""
    message_count = len(request.state["messages"])

    if message_count > 6:
        print(f"[路由] 消息数={message_count}，使用高级模型")
        model = advanced_model
    else:
        print(f"[路由] 消息数={message_count}，使用基础模型")
        model = basic_model

    return handler(request.override(model=model))

agent = create_agent(
    model=basic_model,
    tools=[search],
    middleware=[dynamic_model]
)

# 简单对话 → 使用基础模型
result = agent.invoke({
    "messages": [{"role": "user", "content": "你好"}]
})
print(result["messages"][-1].content)
```

---

## Demo 6：动态系统提示（根据用户角色）

```python
from typing import TypedDict
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langchain.tools import tool

@tool
def explain_concept(concept: str) -> str:
    """解释一个技术概念。"""
    return f"关于 {concept} 的解释"

class Context(TypedDict):
    user_role: str

@dynamic_prompt
def role_based_prompt(request: ModelRequest) -> str:
    """根据用户角色生成不同风格的系统提示。"""
    role = request.runtime.context.get("user_role", "user")

    if role == "expert":
        return "你是一个技术专家。使用专业术语，给出深入的解释。"
    elif role == "beginner":
        return "你是一个友好的老师。用简单的语言和比喻来解释概念。"
    return "你是一个有帮助的助手。"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[explain_concept],
    middleware=[role_based_prompt],
    context_schema=Context
)

# 专家模式
result = agent.invoke(
    {"messages": [{"role": "user", "content": "什么是微服务架构？"}]},
    context={"user_role": "expert"}
)
print("[专家回复]", result["messages"][-1].content)

# 初学者模式
result = agent.invoke(
    {"messages": [{"role": "user", "content": "什么是微服务架构？"}]},
    context={"user_role": "beginner"}
)
print("[初学者回复]", result["messages"][-1].content)
```

---

## Demo 7：结构化输出

```python
from pydantic import BaseModel, Field
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

# 定义输出 schema
class MovieReview(BaseModel):
    title: str = Field(description="电影名称")
    rating: float = Field(description="评分，1-10")
    summary: str = Field(description="一句话评价")
    recommend: bool = Field(description="是否推荐")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],  # 无工具，纯结构化输出
    response_format=ToolStrategy(MovieReview)
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "评价电影《盗梦空间》"}]
})

# 获取结构化结果
review = result["structured_response"]
print(f"电影：{review.title}")
print(f"评分：{review.rating}/10")
print(f"评价：{review.summary}")
print(f"推荐：{'是' if review.recommend else '否'}")
```

---

## Demo 8：流式输出

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langchain.messages import AIMessage, HumanMessage

@tool
def search_news(topic: str) -> str:
    """搜索新闻。"""
    return f"关于 {topic} 的最新新闻：AI 技术取得重大突破..."

agent = create_agent("openai:gpt-4o-mini", tools=[search_news])

print("=== 流式输出 ===")
for chunk in agent.stream({
    "messages": [{"role": "user", "content": "搜索AI新闻并总结"}]
}, stream_mode="values"):
    latest = chunk["messages"][-1]
    if latest.content:
        if isinstance(latest, HumanMessage):
            print(f"用户: {latest.content}")
        elif isinstance(latest, AIMessage):
            print(f"Agent: {latest.content}")
    elif hasattr(latest, 'tool_calls') and latest.tool_calls:
        print(f"调用工具: {[tc['name'] for tc in latest.tool_calls]}")
```

---

## Demo 9：自定义状态（记忆）

```python
from langchain.agents import create_agent, AgentState
from langchain.tools import tool

# 定义自定义状态
class CustomState(AgentState):
    conversation_topic: str
    user_mood: str

@tool
def set_topic(topic: str) -> str:
    """设置当前对话主题。"""
    return f"主题已设置为：{topic}"

@tool
def get_summary() -> str:
    """获取对话摘要。"""
    return "这是对话的摘要信息"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[set_topic, get_summary],
    state_schema=CustomState
)

# 带自定义状态调用
result = agent.invoke({
    "messages": [{"role": "user", "content": "我们来聊聊Python编程"}],
    "conversation_topic": "programming",
    "user_mood": "curious"
})
print(result["messages"][-1].content)
```

---

## Demo 10：基于权限的动态工具过滤

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain.tools import tool
from typing import Callable

@tool
def read_data(query: str) -> str:
    """读取数据（只读）。"""
    return f"数据查询结果：{query}"

@tool
def write_data(data: str) -> str:
    """写入数据。"""
    return f"已写入：{data}"

@tool
def delete_data(target: str) -> str:
    """删除数据。"""
    return f"已删除：{target}"

@dataclass
class Context:
    user_role: str

@wrap_model_call
def permission_filter(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """根据用户角色过滤可用工具。"""
    role = request.runtime.context.user_role

    if role == "admin":
        pass  # 管理员：全部工具
    elif role == "editor":
        tools = [t for t in request.tools if t.name != "delete_data"]
        request = request.override(tools=tools)
    else:
        tools = [t for t in request.tools if t.name.startswith("read_")]
        request = request.override(tools=tools)

    return handler(request)

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[read_data, write_data, delete_data],
    middleware=[permission_filter],
    context_schema=Context
)

# 管理员：可以使用所有工具
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除用户数据 user_123"}]},
    context={"user_role": "admin"}
)
print("[管理员]", result["messages"][-1].content)

# 访客：只能读取
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除用户数据 user_123"}]},
    context={"user_role": "viewer"}
)
print("[访客]", result["messages"][-1].content)
```

---

## 运行说明

1. 确保安装了所需依赖
2. 设置 `OPENAI_API_KEY` 环境变量
3. 每个 Demo 可独立运行
4. 建议从 Demo 1 开始，逐步尝试更高级的功能
