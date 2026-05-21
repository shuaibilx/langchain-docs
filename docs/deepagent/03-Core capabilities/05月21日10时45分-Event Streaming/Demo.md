# Event Streaming - Demo

## Demo 1: 基础 Subagent 流

```python
stream = agent.stream_events({
    "messages": [{"role": "user", "content": "Write me a haiku about the sea"}],
}, version="v3")

for subagent in stream.subagents:
    print(subagent.name, subagent.path, subagent.status)

    for message in subagent.messages:
        print(message.text)
```

## Demo 2: 追踪 Subagent 生命周期

```python
stream = agent.stream_events(input, version="v3")

running = 0
completed = 0
failed = 0

for subagent in stream.subagents:
    running += 1
    print(f"{subagent.name}: started")

    try:
        _ = subagent.output
        running -= 1
        completed += 1
        print(f"{subagent.name}: completed")
    except Exception:
        running -= 1
        failed += 1
        print(f"{subagent.name}: failed")

print(f"Summary: {completed} completed, {failed} failed, {running} still running")
```

## Demo 3: 流式传输协调器消息

```python
stream = agent.stream_events(input, version="v3")

for message in stream.messages:
    print("[coordinator]", message.text)
```

## Demo 4: 流式传输 Subagent 消息

```python
stream = agent.stream_events(input, version="v3")

for subagent in stream.subagents:
    for message in subagent.messages:
        print(f"[{subagent.name}]", message.text)
```

## Demo 5: 同时流式传输协调器和 Subagent 消息

```python
stream = agent.stream_events(input, version="v3")

for message in stream.messages:
    print("[coordinator]", message.text)

for subagent in stream.subagents:
    for message in subagent.messages:
        print(f"[{subagent.name}]", message.text)
```

## Demo 6: 流式传输工具调用

```python
stream = agent.stream_events(input, version="v3")

for call in stream.tool_calls:
    print("[coordinator tool]", call.tool_name, call.input)
    print(f"  completed: {call.completed}, error: {call.error}")

for subagent in stream.subagents:
    for call in subagent.tool_calls:
        print(f"[{subagent.name} tool]", call.tool_name, call.input)
        for delta in call.output_deltas:
            print(delta, end="", flush=True)

        if call.completed and call.error is None:
            print(call.output)
        elif call.error is not None:
            print(call.error)
```

## Demo 7: 递归嵌套 Subagent

```python
stream = agent.stream_events(input, version="v3")

for subagent in stream.subagents:
    print(f"subagent {subagent.name}: {subagent.status}")

    for tool_call in subagent.tool_calls:
        print(f"  {tool_call.tool_name}({tool_call.input})")
        for delta in tool_call.output_deltas:
            print(delta, end="", flush=True)

    for nested in subagent.subagents:
        print(f"  nested subagent {nested.name}: {nested.status}")

        for tool_call in nested.tool_calls:
            print(f"    {tool_call.tool_name}({tool_call.input})")
```

## Demo 8: 异步并发消费

```python
import asyncio

stream = await agent.astream_events(input, version="v3")

async def consume_coordinator():
    async for message in stream.messages:
        print("[coordinator]", await message.text)

async def consume_subagents():
    async for subagent in stream.subagents:
        async for message in subagent.messages:
            print(f"[{subagent.name}]", await message.text)

await asyncio.gather(consume_coordinator(), consume_subagents())
```

## Demo 9: 同步交错消费

```python
stream = agent.stream_events(input, version="v3")

for name, item in stream.interleave("messages", "subagents"):
    if name == "messages":
        print("[coordinator]", item.text)
    else:
        for message in item.messages:
            print(f"[{item.name}]", message.text)
```

## Demo 10: 原始协议事件（精确顺序）

```python
stream = agent.stream_events(input, version="v3")

for event in stream:
    if event.get("method") != "messages":
        continue

    payload = event["params"]["data"][0]
    if not isinstance(payload, dict):
        continue
    if payload.get("event") != "content-block-delta":
        continue

    block = payload.get("delta") or {}
    if block.get("type") == "text-delta":
        source = "subagent" if event["params"]["namespace"] else "coordinator"
        print(f"[{source}] {block['text']}")
```

## Demo 11: 完整流式传输应用

```python
import asyncio
from deepagents import create_deep_agent

subagents = [
    {
        "name": "researcher",
        "description": "Researches topics",
        "system_prompt": "You are a researcher. Return findings under 200 words.",
        "tools": [web_search],
    },
    {
        "name": "writer",
        "description": "Writes reports",
        "system_prompt": "You are a writer. Create clear, concise reports.",
    },
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    tools=[internet_search],
    subagents=subagents,
    name="coordinator",
)

input_data = {
    "messages": [{"role": "user", "content": "Research quantum computing and write a summary"}]
}

# 方式 1: 顺序消费
stream = agent.stream_events(input_data, version="v3")

print("=== Coordinator Messages ===")
for message in stream.messages:
    print(message.text)

print("\n=== Subagent Activity ===")
for subagent in stream.subagents:
    print(f"\n--- {subagent.name} ({subagent.status}) ---")

    for call in subagent.tool_calls:
        print(f"  Tool: {call.tool_name}")
        for delta in call.output_deltas:
            print(delta, end="", flush=True)

    for message in subagent.messages:
        print(f"  Message: {message.text}")

print("\n=== Final Output ===")
# stream.values 包含最终状态
```
