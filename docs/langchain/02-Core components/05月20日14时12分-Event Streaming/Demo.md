# Event Streaming 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：基础流式输出（stream.messages + message.text）

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天，25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "北京天气怎么样？"}]},
    version="v3"
)

print("=== 逐字输出 ===")
for message in stream.messages:
    for delta in message.text:
        print(delta, end="", flush=True)
print()
```

---

## Demo 2：获取完整消息和 token 使用量

```python
from langchain.agents import create_agent

agent = create_agent("openai:gpt-4o-mini", tools=[])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "用一句话介绍 Python"}]},
    version="v3"
)

for message in stream.messages:
    # 实时打印文本
    for delta in message.text:
        print(delta, end="", flush=True)

    # 获取完整消息
    full_msg = message.output
    if full_msg and full_msg.usage_metadata:
        usage = full_msg.usage_metadata
        print(f"\n--- Token 统计 ---")
        print(f"输入: {usage.get('input_tokens')}")
        print(f"输出: {usage.get('output_tokens')}")
        print(f"总计: {usage.get('total_tokens')}")
```

---

## Demo 3：流式工具调用（message.tool_calls）

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """搜索信息。"""
    return f"搜索结果: 关于 {query} 的信息"

@tool
def calculate(expression: str) -> str:
    """计算数学表达式。"""
    return str(eval(expression))

agent = create_agent("openai:gpt-4o-mini", tools=[search, calculate])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "搜索 LangChain 并计算 15*23"}]},
    version="v3"
)

for message in stream.messages:
    # 流式文本
    for delta in message.text:
        print(delta, end="", flush=True)

    # 流式工具调用参数
    for chunk in message.tool_calls:
        print(f"\n[工具调用片段] {chunk}")

    # 最终确定的工具调用
    finalized = message.tool_calls.get()
    if finalized:
        print(f"\n[最终工具调用] {finalized}")
```

---

## Demo 4：工具执行生命周期（stream.tool_calls）

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "北京和上海天气如何？"}]},
    version="v3"
)

print("=== 工具执行生命周期 ===")
for call in stream.tool_calls:
    print(f"\n工具: {call.tool_name}")
    print(f"输入: {call.input}")

    # 输出增量
    for delta in call.output_deltas:
        print(f"输出增量: {delta}", end="", flush=True)

    # 最终输出和错误
    print(f"最终输出: {call.output}")
    if call.error:
        print(f"错误: {call.error}")
```

---

## Demo 5：推理内容（Reasoning）

```python
from langchain.agents import create_agent

# 需要支持推理的模型，如 o1、o3 等
agent = create_agent("openai:gpt-4o-mini", tools=[])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "为什么天空是蓝色的？"}]},
    version="v3"
)

for message in stream.messages:
    # 推理过程
    for delta in message.reasoning:
        print(f"[思考] {delta}", end="", flush=True)

    # 最终回答
    for delta in message.text:
        print(delta, end="", flush=True)
print()
```

---

## Demo 6：状态快照（stream.values）

```python
from langchain.agents import create_agent, AgentState
from langgraph.checkpoint.memory import InMemorySaver

class CustomState(AgentState):
    step_count: int

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    state_schema=CustomState,
    checkpointer=InMemorySaver()
)

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "你好"}]},
    version="v3",
    config={"configurable": {"thread_id": "state-demo"}}
)

print("=== 状态快照 ===")
for snapshot in stream.values:
    msg_count = len(snapshot.get("messages", []))
    print(f"消息数: {msg_count}")

# 最终状态
final = stream.output
print(f"\n最终状态消息数: {len(final.get('messages', []))}")
```

---

## Demo 7：interleave 交叉消费多个投影

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "北京天气如何？"}]},
    version="v3"
)

print("=== 交叉消费 ===")
for name, item in stream.interleave("messages", "tool_calls", "values"):
    if name == "messages":
        # 消息文本
        text = str(item.text)
        if text:
            print(f"[消息] {text[:50]}...")
    elif name == "tool_calls":
        print(f"[工具] {item.tool_name}({item.input})")
    elif name == "values":
        msg_count = len(item.get("messages", []))
        print(f"[状态] 消息数={msg_count}")
```

---

## Demo 8：最终状态（stream.output）

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def greet(name: str) -> str:
    """打招呼。"""
    return f"你好，{name}！"

agent = create_agent("openai:gpt-4o-mini", tools=[greet])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "我叫小明，请跟我打招呼"}]},
    version="v3"
)

# 消费消息流
for message in stream.messages:
    for delta in message.text:
        print(delta, end="", flush=True)

# 获取最终状态
final = stream.output
print(f"\n\n=== 最终状态 ===")
print(f"消息总数: {len(final['messages'])}")
for msg in final["messages"]:
    role = type(msg).__name__
    content = msg.content[:80] if msg.content else "(无内容)"
    print(f"  {role}: {content}")
```

---

## Demo 9：多 Agent 子图流式

```python
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool

# 子 Agent：天气专家
@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

weather_agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[get_weather],
    name="weather_agent",
)

# 主 Agent：使用子 Agent
def call_weather(query: str) -> str:
    """查询天气 Agent。"""
    result = weather_agent.invoke({"messages": [{"role": "user", "content": query}]})
    return result["messages"][-1].content

supervisor = create_agent(
    model="openai:gpt-4o-mini",
    tools=[call_weather],
    name="supervisor",
)

stream = supervisor.stream_events(
    {"messages": [{"role": "user", "content": "北京天气怎么样？"}]},
    version="v3",
)

print("=== 主 Agent 消息 ===")
for message in stream.messages:
    for delta in message.text:
        print(delta, end="", flush=True)
print()

print("\n=== 子 Agent 流 ===")
for subagent in stream.subgraphs:
    print(f"子 Agent: {subagent.graph_name}")
    for message in subagent.messages:
        for token in message.text:
            print(token, end="", flush=True)
    print()
```

---

## Demo 10：原始协议事件

```python
from langchain.agents import create_agent

agent = create_agent("openai:gpt-4o-mini", tools=[])

stream = agent.stream_events(
    {"messages": [{"role": "user", "content": "你好"}]},
    version="v3"
)

print("=== 原始事件 ===")
for i, event in enumerate(stream):
    method = event.get("method", "unknown")
    namespace = event.get("params", {}).get("namespace", [])
    data = event.get("params", {}).get("data", {})
    data_type = type(data).__name__
    print(f"事件 {i}: method={method}, namespace={namespace}, data_type={data_type}")

    if i > 10:  # 只显示前 10 个
        print("... (截断)")
        break
```

---

## Demo 11：完整前端流式模式

```python
from langchain.agents import create_agent
from langchain.tools import tool
import json

@tool
def search_web(query: str) -> str:
    """搜索网页。"""
    return f"关于 '{query}' 的搜索结果：LangChain 是一个强大的 AI 框架。"

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[search_web, get_weather])

def simulate_frontend(input_text: str):
    """模拟前端消费事件流。"""
    stream = agent.stream_events(
        {"messages": [{"role": "user", "content": input_text}]},
        version="v3"
    )

    # 用于前端显示的状态
    state = {
        "text": "",           # 累积的文本
        "tool_calls": [],     # 工具调用列表
        "is_loading": True,   # 加载状态
    }

    # 1. 流式消息
    for message in stream.messages:
        for delta in message.text:
            state["text"] += delta
            # 模拟发送给前端: SSE / WebSocket
            print(f"[SSE] text_delta: {delta}", end="", flush=True)

        # 工具调用
        finalized = message.tool_calls.get()
        if finalized:
            state["tool_calls"].append(finalized)
            print(f"\n[SSE] tool_call: {json.dumps(finalized, default=str)}")

    # 2. 工具执行
    for call in stream.tool_calls:
        print(f"\n[SSE] tool_start: {call.tool_name}")
        for delta in call.output_deltas:
            print(f"[SSE] tool_delta: {delta}", end="", flush=True)
        print(f"\n[SSE] tool_end: {call.output}")

    # 3. 最终状态
    state["is_loading"] = False
    final = stream.output
    print(f"\n[SSE] done: {len(final['messages'])} messages")
    print(f"\n最终文本: {state['text']}")

simulate_frontend("搜索 LangChain 并告诉我北京天气")
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-2 基础消息流式，建议先跑
3. Demo 3-4 两种工具调用投影的区别
4. Demo 5 推理内容（需要支持推理的模型）
5. Demo 6 状态快照
6. Demo 7 interleave 交叉消费
7. Demo 8-9 最终状态和子 Agent
8. Demo 10-11 原始事件和前端模式
