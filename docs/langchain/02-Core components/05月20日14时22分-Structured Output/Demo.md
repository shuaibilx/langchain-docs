# Structured Output 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：Pydantic Schema（最常用）

```python
from pydantic import BaseModel, Field
from langchain.agents import create_agent

class MovieReview(BaseModel):
    """电影评论分析。"""
    title: str = Field(description="电影名称")
    rating: float = Field(description="评分 1-10", ge=1, le=10)
    sentiment: str = Field(description="情感：positive/negative/neutral")
    summary: str = Field(description="一句话总结")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=MovieReview
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "分析这部电影评论：'盗梦空间太震撼了！诺兰的杰作，9分！'"}]
})

review = result["structured_response"]
print(f"电影: {review.title}")
print(f"评分: {review.rating}")
print(f"情感: {review.sentiment}")
print(f"总结: {review.summary}")
```

---

## Demo 2：Dataclass Schema

```python
from dataclasses import dataclass
from langchain.agents import create_agent

@dataclass
class TaskInfo:
    """任务信息。"""
    task_name: str     # 任务名称
    priority: str      # 优先级
    estimated_hours: float  # 预计工时

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=TaskInfo
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "提取任务信息：需要完成用户登录功能，高优先级，预计8小时"}]
})

data = result["structured_response"]  # 返回 dict
print(f"任务: {data['task_name']}")
print(f"优先级: {data['priority']}")
print(f"工时: {data['estimated_hours']}h")
```

---

## Demo 3：TypedDict Schema

```python
from typing_extensions import TypedDict
from langchain.agents import create_agent

class ProductInfo(TypedDict):
    """产品信息。"""
    name: str          # 产品名称
    price: float       # 价格
    in_stock: bool     # 是否有货

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ProductInfo
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "提取产品信息：iPhone 16，售价 7999 元，有货"}]
})

data = result["structured_response"]  # 返回 dict
print(f"产品: {data['name']}")
print(f"价格: ¥{data['price']}")
print(f"有货: {data['in_stock']}")
```

---

## Demo 4：JSON Schema

```python
from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy

weather_schema = {
    "type": "object",
    "description": "天气信息",
    "properties": {
        "city": {"type": "string", "description": "城市名"},
        "temperature": {"type": "number", "description": "温度"},
        "condition": {"type": "string", "description": "天气状况"},
        "humidity": {"type": "integer", "description": "湿度百分比"}
    },
    "required": ["city", "temperature", "condition"]
}

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ProviderStrategy(weather_schema)
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "北京今天 25 度，晴天，湿度 40%"}]
})

data = result["structured_response"]
print(data)
# {'city': '北京', 'temperature': 25, 'condition': '晴天', 'humidity': 40}
```

---

## Demo 5：ToolStrategy 显式使用

```python
from pydantic import BaseModel, Field
from typing import Literal
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class SentimentAnalysis(BaseModel):
    """情感分析结果。"""
    sentiment: Literal["positive", "negative", "neutral"] = Field(description="情感倾向")
    confidence: float = Field(description="置信度 0-1", ge=0, le=1)
    keywords: list[str] = Field(description="关键词列表")

# 显式使用 ToolStrategy（适用于任何模型）
agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(SentimentAnalysis)
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "分析情感：'这个产品太棒了，强烈推荐！'"}]
})

data = result["structured_response"]
print(f"情感: {data.sentiment}")
print(f"置信度: {data.confidence}")
print(f"关键词: {data.keywords}")
```

---

## Demo 6：Union 类型（模型自动选择）

```python
from pydantic import BaseModel, Field
from typing import Literal, Union
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class PositiveReview(BaseModel):
    """正面评论。"""
    rating: int = Field(description="评分 1-5", ge=4, le=5)
    highlights: list[str] = Field(description="亮点")

class NegativeComplaint(BaseModel):
    """负面投诉。"""
    issue: str = Field(description="问题描述")
    severity: Literal["low", "medium", "high"] = Field(description="严重程度")
    suggested_action: str = Field(description="建议处理方式")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(Union[PositiveReview, NegativeComplaint])
)

# 正面评论
result = agent.invoke({
    "messages": [{"role": "user", "content": "分析：'太好用了，五星好评！速度快，界面美'"}]
})
print(f"类型: {type(result['structured_response']).__name__}")
print(result["structured_response"])

# 负面投诉
result = agent.invoke({
    "messages": [{"role": "user", "content": "分析：'产品有严重bug，经常崩溃，非常失望'"}]
})
print(f"\n类型: {type(result['structured_response']).__name__}")
print(result["structured_response"])
```

---

## Demo 7：结构化输出 + 工具共存

```python
from pydantic import BaseModel, Field
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网页。"""
    return f"搜索结果: {query} 的最新信息"

class SearchResult(BaseModel):
    """搜索结果总结。"""
    query: str = Field(description="搜索查询")
    summary: str = Field(description="结果摘要")
    relevance: float = Field(description="相关性 0-1")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[search_web],
    response_format=SearchResult
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "搜索 LangChain 是什么，并总结结果"}]
})

data = result["structured_response"]
print(f"查询: {data.query}")
print(f"摘要: {data.summary}")
print(f"相关性: {data.relevance}")
```

---

## Demo 8：自定义工具消息内容

```python
from pydantic import BaseModel, Field
from typing import Literal
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class ActionItem(BaseModel):
    """行动项。"""
    task: str = Field(description="具体任务")
    assignee: str = Field(description="负责人")
    deadline: str = Field(description="截止日期")
    priority: Literal["low", "medium", "high"] = Field(description="优先级")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(
        schema=ActionItem,
        tool_message_content="行动项已记录到系统中！"
    )
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "从会议记录中提取：小明需要在本周五前完成 API 文档，高优先级"}]
})

# 工具消息会显示自定义内容而非默认的 JSON
for msg in result["messages"]:
    if hasattr(msg, 'tool_call_id') and msg.content:
        print(f"工具消息: {msg.content}")
```

---

## Demo 9：错误处理 — 验证失败自动重试

```python
from pydantic import BaseModel, Field
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class Rating(BaseModel):
    """评分。"""
    score: int = Field(description="评分 1-5", ge=1, le=5)
    comment: str = Field(description="评论")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(Rating),  # 默认 handle_errors=True
    system_prompt="解析评分。"
)

# 模型可能给出 10 分（超出范围）→ 自动重试
result = agent.invoke({
    "messages": [{"role": "user", "content": "评分：10/10，完美产品！"}]
})

data = result["structured_response"]
print(f"评分: {data.score}")  # 会被修正为 5
print(f"评论: {data.comment}")
```

---

## Demo 10：错误处理 — 自定义错误消息

```python
from pydantic import BaseModel, Field
from typing import Literal
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class UserInfo(BaseModel):
    """用户信息。"""
    name: str = Field(description="姓名")
    age: int = Field(description="年龄", ge=0, le=150)
    role: Literal["admin", "user", "guest"] = Field(description="角色")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(
        schema=UserInfo,
        handle_errors="请确保年龄在 0-150 之间，角色是 admin/user/guest 之一。"
    )
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "用户信息：小明，200岁，超级管理员"}]
})

data = result["structured_response"]
print(f"姓名: {data.name}")
print(f"年龄: {data.age}")  # 会被修正
print(f"角色: {data.role}")  # 会被修正
```

---

## Demo 11：错误处理 — 自定义处理函数

```python
from pydantic import BaseModel, Field
from typing import Union
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy, StructuredOutputValidationError, MultipleStructuredOutputsError

class Contact(BaseModel):
    name: str
    email: str

class Event(BaseModel):
    event_name: str
    date: str

def custom_handler(error: Exception) -> str:
    if isinstance(error, StructuredOutputValidationError):
        return "格式验证失败，请检查字段值。"
    elif isinstance(error, MultipleStructuredOutputsError):
        return "只能返回一个结果，请选择最相关的一个。"
    return f"错误: {str(error)}"

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=ToolStrategy(
        schema=Union[Contact, Event],
        handle_errors=custom_handler
    )
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "提取：小明 (xm@test.com) 组织技术大会在 3月15日"}]
})

data = result["structured_response"]
print(f"类型: {type(data).__name__}")
print(data)
```

---

## Demo 12：完整实战 — 表单数据提取

```python
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from langchain.agents import create_agent

class RegistrationForm(BaseModel):
    """注册表单数据。"""
    full_name: str = Field(description="全名")
    email: str = Field(description="邮箱地址")
    phone: Optional[str] = Field(default=None, description="电话号码")
    age: int = Field(description="年龄", ge=1, le=150)
    interests: list[str] = Field(description="兴趣爱好")
    newsletter: bool = Field(default=False, description="是否订阅邮件")

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    response_format=RegistrationForm
)

# 从非结构化文本提取结构化数据
result = agent.invoke({
    "messages": [{"role": "user", "content": """
        请帮我整理注册信息：
        我叫张三，邮箱是 zhangsan@example.com
        手机号 13800138000，今年 25 岁
        我喜欢编程、音乐和旅行
        对了，帮我订阅你们的邮件通知
    """}]
})

form = result["structured_response"]
print(f"姓名: {form.full_name}")
print(f"邮箱: {form.email}")
print(f"电话: {form.phone}")
print(f"年龄: {form.age}")
print(f"兴趣: {form.interests}")
print(f"订阅: {form.newsletter}")
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-4 四种 Schema 类型
3. Demo 5-6 ToolStrategy 显式使用和 Union 类型
4. Demo 7 结构化输出 + 工具共存
5. Demo 8 自定义工具消息
6. Demo 9-11 错误处理的各种策略
7. Demo 12 完整实战
