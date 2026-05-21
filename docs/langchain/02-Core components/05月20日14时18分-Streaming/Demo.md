# Streaming 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：stream_mode="updates" — Agent 进度

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

print("=== Agent 进度流 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "北京天气如何？"}]},
    stream_mode="updates",
    version="v2",
):
    if chunk["type"] == "updates":
        for step, data in chunk["data"].items():
            print(f"\n步骤: {step}")
            last_msg = data["messages"][-1]
            if last_msg.content_blocks:
                for block in last_msg.content_blocks:
                    print(f"  类型: {block['type']}, 内容: {str(block)[:80]}")
```

---

## Demo 2：stream_mode="messages" — LLM Token 流

```python
from langchain.agents import create_agent

agent = create_agent("openai:gpt-4o-mini", tools=[])

print("=== Token 流 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "用一句话介绍 Python"}]},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        node = metadata.get("langgraph_node", "unknown")
        # 打印文本增量
        if hasattr(token, 'text') and token.text:
            print(f"[{node}] {token.text}", end="", flush=True)
print()
```

---

## Demo 3：stream_mode="custom" — 自定义更新

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.config import get_stream_writer

@tool
def fetch_data(dataset: str) -> str:
    """获取数据集。"""
    writer = get_stream_writer()
    writer(f"正在连接数据源: {dataset}...")
    writer(f"正在下载数据...")
    writer(f"数据下载完成，共 1000 条记录")
    return f"数据集 '{dataset}' 包含 1000 条记录"

agent = create_agent("openai:gpt-4o-mini", tools=[fetch_data])

print("=== 自定义更新流 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "获取 sales_data 数据集"}]},
    stream_mode="custom",
    version="v2",
):
    if chunk["type"] == "custom":
        print(f"[进度] {chunk['data']}")
```

---

## Demo 4：多模式组合

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.config import get_stream_writer

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    writer = get_stream_writer()
    writer(f"查询 {city} 天气中...")
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

print("=== 多模式流 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "北京天气如何？"}]},
    stream_mode=["updates", "messages", "custom"],
    version="v2",
):
    mode = chunk["type"]

    if mode == "messages":
        token, metadata = chunk["data"]
        if hasattr(token, 'text') and token.text:
            print(f"[token] {token.text}", end="", flush=True)

    elif mode == "updates":
        for step, data in chunk["data"].items():
            last = data["messages"][-1]
            content = last.content[:60] if last.content else "(无)"
            print(f"\n[update] {step}: {content}")

    elif mode == "custom":
        print(f"[custom] {chunk['data']}")
print()
```

---

## Demo 5：聚合消息块获取完整工具调用

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langchain.messages import AIMessageChunk

@tool
def search(query: str) -> str:
    """搜索信息。"""
    return f"搜索结果: {query}"

@tool
def calculate(expression: str) -> str:
    """计算表达式。"""
    return str(eval(expression))

agent = create_agent("openai:gpt-4o-mini", tools=[search, calculate])

full_message = None
print("=== 聚合工具调用 ===")

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "搜索 LangChain 并计算 15*23"}]},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]

        if isinstance(token, AIMessageChunk):
            # 打印文本增量
            if token.text:
                print(token.text, end="", flush=True)

            # 聚合工具调用
            full_message = token if full_message is None else full_message + token

            # 检查是否是最后一个块
            if hasattr(token, 'chunk_position') and token.chunk_position == "last":
                if full_message and full_message.tool_calls:
                    print(f"\n[完整工具调用] {full_message.tool_calls}")
                full_message = None
print()
```

---

## Demo 6：updates + messages 组合（同时获取增量和完成消息）

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[get_weather])

print("=== 增量 + 完成消息 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "北京天气如何？"}]},
    stream_mode=["messages", "updates"],
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if isinstance(token, AIMessageChunk) and token.text:
            print(token.text, end="", flush=True)

    elif chunk["type"] == "updates":
        for source, update in chunk["data"].items():
            if source in ("model", "tools"):
                last = update["messages"][-1]
                if isinstance(last, AIMessage) and last.tool_calls:
                    print(f"\n[完成] 工具调用: {last.tool_calls}")
                elif isinstance(last, ToolMessage):
                    print(f"\n[完成] 工具结果: {last.content[:60]}")
print()
```

---

## Demo 7：推理 token 流式（需要支持推理的模型）

```python
from langchain.agents import create_agent
from langchain.messages import AIMessageChunk

# 注意：需要支持推理的模型，如 o1、o3、Claude with thinking
# 这里用 gpt-4o-mini 演示结构，实际推理需要对应模型
agent = create_agent("openai:gpt-4o-mini", tools=[])

print("=== 推理 token 流 ===")
for token, metadata in agent.stream(
    {"messages": [{"role": "user", "content": "为什么天空是蓝色的？"}]},
    stream_mode="messages",
):
    if not isinstance(token, AIMessageChunk):
        continue

    # 过滤推理内容
    reasoning = [b for b in token.content_blocks if b["type"] == "reasoning"]
    text = [b for b in token.content_blocks if b["type"] == "text"]

    if reasoning:
        print(f"[思考] {reasoning[0].get('reasoning', '')[:50]}", end="")
    if text:
        print(text[0]["text"], end="", flush=True)
print()
```

---

## Demo 8：禁用特定模型的流式

```python
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天"

# 创建一个禁用流式的模型
non_streaming_model = ChatOpenAI(model="gpt-4o-mini", streaming=False)

# 创建一个正常流式的模型
streaming_model = ChatOpenAI(model="gpt-4o-mini")

# Agent 使用流式模型
agent = create_agent(streaming_model, tools=[get_weather])

print("=== 流式输出 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "你好"}]},
    stream_mode="messages",
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if hasattr(token, 'text') and token.text:
            print(token.text, end="", flush=True)
print()

# 如果用 non_streaming_model，上面的循环不会输出 token 增量
```

---

## Demo 9：v2 格式的 GraphOutput

```python
from langchain.agents import create_agent, AgentState
from langgraph.checkpoint.memory import InMemorySaver

agent = create_agent(
    "openai:gpt-4o-mini",
    tools=[],
    checkpointer=InMemorySaver()
)

# v2 格式的 invoke
result = agent.invoke(
    {"messages": [{"role": "user", "content": "你好"}]},
    version="v2",
    config={"configurable": {"thread_id": "v2-demo"}}
)

# GraphOutput 对象
print(f"类型: {type(result).__name__}")
print(f"状态值: {type(result.value).__name__}")
print(f"中断: {result.interrupts}")
print(f"消息数: {len(result.value.get('messages', []))}")
```

---

## Demo 10：完整前端流式模式

```python
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.config import get_stream_writer
import json

@tool
def search_web(query: str) -> str:
    """搜索网页。"""
    writer = get_stream_writer()
    writer(f"正在搜索: {query}")
    return f"关于 '{query}' 的搜索结果"

@tool
def get_weather(city: str) -> str:
    """获取天气。"""
    return f"{city}：晴天 25°C"

agent = create_agent("openai:gpt-4o-mini", tools=[search_web, get_weather])

def simulate_frontend_sse(input_text: str):
    """模拟前端 SSE 消费。"""
    stream = agent.stream(
        {"messages": [{"role": "user", "content": input_text}]},
        stream_mode=["updates", "messages", "custom"],
        version="v2",
    )

    full_text = ""

    for chunk in stream:
        mode = chunk["type"]

        if mode == "messages":
            token, metadata = chunk["data"]
            if hasattr(token, 'text') and token.text:
                full_text += token.text
                # 模拟 SSE: data: {"type":"text","delta":"..."}
                print(f"data: {json.dumps({'type': 'text', 'delta': token.text})}")

            if hasattr(token, 'tool_call_chunks') and token.tool_call_chunks:
                for tc in token.tool_call_chunks:
                    if tc.get('name'):
                        print(f"data: {json.dumps({'type': 'tool_start', 'name': tc['name']})}")

        elif mode == "updates":
            for step, data in chunk["data"].items():
                if step == "tools":
                    last = data["messages"][-1]
                    print(f"data: {json.dumps({'type': 'tool_result', 'content': last.content[:60]})}")

        elif mode == "custom":
            print(f"data: {json.dumps({'type': 'progress', 'message': chunk['data']})}")

    print(f"data: {json.dumps({'type': 'done', 'full_text': full_text})}")

simulate_frontend_sse("搜索 LangChain 并告诉我北京天气")
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-3 三种基础 stream_mode
3. Demo 4 多模式组合
4. Demo 5-6 消息聚合和完成消息获取
5. Demo 7 推理 token（需要对应模型）
6. Demo 8 禁用流式
7. Demo 9 v2 格式的 GraphOutput
8. Demo 10 完整前端模式
