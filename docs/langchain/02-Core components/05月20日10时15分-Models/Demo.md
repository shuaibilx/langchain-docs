# Models 功能 Demo

## 环境准备

```bash
# 安装基础包和你使用的 provider（选一个即可）
pip install langchain langchain-openai          # OpenAI
pip install langchain langchain-anthropic       # Anthropic
pip install langchain langchain-google-genai    # Google Gemini
```

设置环境变量：
```bash
export OPENAI_API_KEY="your-api-key"
# 或
export ANTHROPIC_API_KEY="your-api-key"
# 或
export GOOGLE_API_KEY="your-api-key"
```

---

## Demo 1：模型初始化（两种方式）

```python
# 方式一：init_chat_model（推荐入门使用）
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")
response = model.invoke("你好，请用一句话介绍自己")
print(response.content)

# 方式二：使用模型类（精细控制）
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
    max_tokens=200,
    timeout=30
)
response = model.invoke("你好，请用一句话介绍自己")
print(response.content)
```

---

## Demo 2：消息格式（字典 vs 消息对象）

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage, AIMessage

model = init_chat_model("gpt-4o-mini")

# 方式一：字典格式
conversation = [
    {"role": "system", "content": "你是一个法语翻译助手。"},
    {"role": "user", "content": "翻译：我爱编程"},
    {"role": "assistant", "content": "J'adore la programmation."},
    {"role": "user", "content": "翻译：我爱人工智能"}
]
response = model.invoke(conversation)
print("字典格式:", response.content)

# 方式二：消息对象格式
conversation = [
    SystemMessage("你是一个法语翻译助手。"),
    HumanMessage("翻译：我爱编程"),
    AIMessage("J'adore la programmation."),
    HumanMessage("翻译：我爱人工智能")
]
response = model.invoke(conversation)
print("消息对象:", response.content)
```

---

## Demo 3：流式输出（Stream）

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")

print("=== 基本流式输出 ===")
for chunk in model.stream("用 5 句话介绍 Python 编程语言"):
    print(chunk.text, end="", flush=True)
print()

print("\n=== 累积完整消息 ===")
full = None
for chunk in model.stream("什么是机器学习？"):
    full = chunk if full is None else full + chunk

print(f"完整内容长度: {len(full.text)} 字符")
print(f"前 100 字符: {full.text[:100]}...")
```

---

## Demo 4：批量调用（Batch）

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")

questions = [
    "什么是 Python？",
    "什么是 JavaScript？",
    "什么是 Rust？",
]

print("=== batch() ===")
responses = model.batch(questions)
for q, r in zip(questions, responses):
    print(f"Q: {q}")
    print(f"A: {r.content[:80]}...\n")

print("=== batch_as_completed() ===")
for response in model.batch_as_completed(questions):
    print(f"完成: {response.content[:50]}...")
```

---

## Demo 5：参数配置

```python
from langchain.chat_models import init_chat_model

# 低温度 = 更确定的输出
precise_model = init_chat_model("gpt-4o-mini", temperature=0)
response = precise_model.invoke("1+1等于几？")
print(f"精确模式 (temp=0): {response.content}")

# 高温度 = 更有创意的输出
creative_model = init_chat_model("gpt-4o-mini", temperature=1.0)
response = creative_model.invoke("给一只猫起个有趣的名字")
print(f"创意模式 (temp=1): {response.content}")

# 设置超时和重试
robust_model = init_chat_model(
    "gpt-4o-mini",
    timeout=30,
    max_retries=10
)
response = robust_model.invoke("你好")
print(f"带超时和重试: {response.content}")
```

---

## Demo 6：工具调用（Tool Calling）— 基础

```python
from langchain.chat_models import init_chat_model
from langchain.tools import tool

@tool
def get_weather(location: str) -> str:
    """获取指定城市的天气信息。"""
    weather = {
        "北京": "晴天，25°C",
        "上海": "多云，22°C",
        "纽约": "下雨，18°C",
    }
    return weather.get(location, f"{location}：未知天气")

model = init_chat_model("gpt-4o-mini")

# 绑定工具
model_with_tools = model.bind_tools([get_weather])

# 调用 - 模型会返回工具调用请求（不是直接执行）
response = model_with_tools.invoke("北京和上海的天气怎么样？")

print("模型请求的工具调用:")
for tc in response.tool_calls:
    print(f"  工具: {tc['name']}")
    print(f"  参数: {tc['args']}")
    print(f"  ID: {tc['id']}")
```

---

## Demo 7：工具调用 — 手动执行循环

```python
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langchain.messages import HumanMessage

@tool
def calculate(expression: str) -> str:
    """计算数学表达式。"""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"错误: {e}"

@tool
def get_weather(location: str) -> str:
    """获取天气。"""
    return f"{location}：晴天，25°C"

model = init_chat_model("gpt-4o-mini")
model_with_tools = model.bind_tools([get_weather, calculate])

# 手动执行工具循环
messages = [{"role": "user", "content": "北京天气怎么样？另外计算 15 * 23 + 47"}]

# 第 1 步：模型生成工具调用
ai_msg = model_with_tools.invoke(messages)
messages.append(ai_msg)

print("工具调用请求:")
for tc in ai_msg.tool_calls:
    print(f"  {tc['name']}({tc['args']})")

# 第 2 步：执行工具并收集结果
for tool_call in ai_msg.tool_calls:
    if tool_call["name"] == "get_weather":
        result = get_weather.invoke(tool_call)
    elif tool_call["name"] == "calculate":
        result = calculate.invoke(tool_call)
    messages.append(result)
    print(f"工具结果: {result.content}")

# 第 3 步：传回模型获取最终响应
final = model_with_tools.invoke(messages)
print(f"\n最终回答: {final.content}")
```

---

## Demo 8：工具调用 — 强制和并行

```python
from langchain.chat_models import init_chat_model
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """搜索信息。"""
    return f"搜索结果: {query}"

@tool
def analyze(data: str) -> str:
    """分析数据。"""
    return f"分析结果: {data}"

model = init_chat_model("gpt-4o-mini")

# 强制使用任意工具
model_force = model.bind_tools([search, analyze], tool_choice="any")
response = model_force.invoke("告诉我一些关于 AI 的事情")
print("强制工具调用:", response.tool_calls)

# 强制使用特定工具
model_search_only = model.bind_tools([search, analyze], tool_choice="search")
response = model_search_only.invoke("告诉我一些关于 AI 的事情")
print("强制 search:", response.tool_calls)

# 并行工具调用
model_parallel = model.bind_tools([search])
response = model_parallel.invoke("搜索 Python 和 JavaScript 的区别")
print("可能的并行调用:", response.tool_calls)
```

---

## Demo 9：流式工具调用

```python
from langchain.chat_models import init_chat_model
from langchain.tools import tool

@tool
def get_weather(location: str) -> str:
    """获取天气。"""
    return f"{location}：晴天"

model = init_chat_model("gpt-4o-mini")
model_with_tools = model.bind_tools([get_weather])

print("=== 流式工具调用 ===")
for chunk in model_with_tools.stream("北京和东京的天气如何？"):
    for tc_chunk in chunk.tool_call_chunks:
        if name := tc_chunk.get("name"):
            print(f"\n工具: {name}")
        if args := tc_chunk.get("args"):
            print(f"参数片段: {args}", end="")

# 累积完整工具调用
print("\n\n=== 累积工具调用 ===")
gathered = None
for chunk in model_with_tools.stream("北京天气如何？"):
    gathered = chunk if gathered is None else gathered + chunk

print(f"完整工具调用: {gathered.tool_calls}")
```

---

## Demo 10：结构化输出 — Pydantic

```python
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

class Movie(BaseModel):
    """电影信息。"""
    title: str = Field(description="电影名称")
    year: int = Field(description="上映年份")
    director: str = Field(description="导演")
    rating: float = Field(description="评分（满分 10）")
    genres: list[str] = Field(description="类型列表")

model = init_chat_model("gpt-4o-mini")
model_with_structure = model.with_structured_output(Movie)

response = model_with_structure.invoke("提供电影《盗梦空间》的详细信息")
print(f"电影: {response.title}")
print(f"年份: {response.year}")
print(f"导演: {response.director}")
print(f"评分: {response.rating}")
print(f"类型: {response.genres}")
```

---

## Demo 11：结构化输出 — TypedDict

```python
from langchain.chat_models import init_chat_model
from typing_extensions import TypedDict, Annotated

class ProductInfo(TypedDict):
    """产品信息。"""
    name: Annotated[str, ..., "产品名称"]
    price: Annotated[float, ..., "价格"]
    in_stock: Annotated[bool, ..., "是否有货"]
    description: Annotated[str, ..., "简短描述"]

model = init_chat_model("gpt-4o-mini")
model_with_structure = model.with_structured_output(ProductInfo)

response = model_with_structure.invoke("给我推荐一款无线耳机的信息")
print(response)
# {'name': '...', 'price': ..., 'in_stock': ..., 'description': '...'}
```

---

## Demo 12：结构化输出 — 嵌套结构 + include_raw

```python
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

class Actor(BaseModel):
    name: str = Field(description="演员姓名")
    role: str = Field(description="饰演角色")

class CastInfo(BaseModel):
    movie_title: str = Field(description="电影名称")
    year: int = Field(description="上映年份")
    cast: list[Actor] = Field(description="演员列表")

model = init_chat_model("gpt-4o-mini")

# include_raw=True 同时获取原始消息
model_with_structure = model.with_structured_output(CastInfo, include_raw=True)

response = model_with_structure.invoke("提供《黑客帝国》的主要演员信息")

print("解析结果:", response["parsed"])
print("原始消息类型:", type(response["raw"]))
print("解析错误:", response["parsing_error"])
```

---

## Demo 13：Token 使用量跟踪

```python
from langchain.chat_models import init_chat_model
from langchain_core.callbacks import UsageMetadataCallbackHandler

model = init_chat_model("gpt-4o-mini")

# 方式一：回调处理器（跨多次调用累计）
callback = UsageMetadataCallbackHandler()

model.invoke("你好", config={"callbacks": [callback]})
model.invoke("今天天气怎么样？", config={"callbacks": [callback]})

print("累计 token 使用量:")
print(callback.usage_metadata)

# 方式二：上下文管理器
from langchain_core.callbacks import get_usage_metadata_callback

with get_usage_metadata_callback() as cb:
    model.invoke("你好")
    model.invoke("再见")
    print("\n上下文管理器统计:", cb.usage_metadata)
```

---

## Demo 14：调用配置（Config）

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")

# 带配置调用
response = model.invoke(
    "讲个笑话",
    config={
        "run_name": "joke_generation",
        "tags": ["humor", "demo"],
        "metadata": {"user_id": "user_123", "session": "test"},
    }
)
print(response.content)

# 用于 LangSmith 追踪时，这些配置会出现在 trace 中
```

---

## Demo 15：可配置模型（运行时切换模型）

```python
from langchain.chat_models import init_chat_model

# 创建可配置模型
configurable_model = init_chat_model(temperature=0)

# 用不同模型调用
response1 = configurable_model.invoke(
    "你是什么模型？",
    config={"configurable": {"model": "gpt-4o-mini"}}
)
print(f"GPT-4o-mini: {response1.content[:50]}...")

response2 = configurable_model.invoke(
    "你是什么模型？",
    config={"configurable": {"model": "gpt-4o"}}
)
print(f"GPT-4o: {response2.content[:50]}...")

# 带前缀的可配置模型
first_model = init_chat_model(
    model="gpt-4o-mini",
    temperature=0,
    configurable_fields=("model", "temperature"),
    config_prefix="first"
)

response = first_model.invoke(
    "你好",
    config={"configurable": {
        "first_model": "gpt-4o",
        "first_temperature": 0.8
    }}
)
print(response.content[:50])
```

---

## Demo 16：速率限制

```python
from langchain.chat_models import init_chat_model
from langchain_core.rate_limiters import InMemoryRateLimiter

# 每 2 秒最多 1 个请求
rate_limiter = InMemoryRateLimiter(
    requests_per_second=0.5,
    check_every_n_seconds=0.1,
    max_bucket_size=1
)

model = init_chat_model(
    "gpt-4o-mini",
    rate_limiter=rate_limiter
)

import time

# 连续调用会自动限速
for i in range(3):
    start = time.time()
    response = model.invoke(f"说一个数字: {i}")
    elapsed = time.time() - start
    print(f"请求 {i}: {response.content} (耗时 {elapsed:.1f}s)")
```

---

## Demo 17：多 provider 切换

```python
from langchain.chat_models import init_chat_model

question = "用一句话介绍 Python"

# OpenAI
openai_model = init_chat_model("gpt-4o-mini")
r1 = openai_model.invoke(question)
print(f"OpenAI: {r1.content}")

# Anthropic（需要 ANTHROPIC_API_KEY）
# anthropic_model = init_chat_model("claude-haiku-4-5-20251001")
# r2 = anthropic_model.invoke(question)
# print(f"Anthropic: {r2.content}")

# Google（需要 GOOGLE_API_KEY）
# google_model = init_chat_model("google_genai:gemini-2.5-flash-lite")
# r3 = google_model.invoke(question)
# print(f"Google: {r3.content}")
```

---

## 运行说明

1. 确保安装了所需依赖
2. 设置对应 provider 的 API Key 环境变量
3. 每个 Demo 可独立运行
4. 建议从 Demo 1 开始，逐步尝试
5. Demo 17 需要多个 provider 的 API Key，按需启用
