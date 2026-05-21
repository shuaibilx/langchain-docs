# Streaming - Demo

## Demo 1: 基础 Subgraph 流式传输

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="You are a helpful research assistant",
    subagents=[
        {
            "name": "researcher",
            "description": "Researches a topic in depth",
            "system_prompt": "You are a thorough researcher.",
        },
    ],
)

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research quantum computing advances"}]},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "updates":
        if chunk["ns"]:
            print(f"[subagent: {chunk['ns']}]")
        else:
            print("[main agent]")
        print(chunk["data"])
```

## Demo 2: Namespace 路由

```python
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Plan my vacation"}]},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "updates":
        is_subagent = any(
            segment.startswith("tools:") for segment in chunk["ns"]
        )

        if is_subagent:
            tool_call_id = next(
                s.split(":")[1] for s in chunk["ns"] if s.startswith("tools:")
            )
            print(f"Subagent {tool_call_id}: {chunk['data']}")
        else:
            print(f"Main agent: {chunk['data']}")
```

## Demo 3: Subagent 进度跟踪

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt=(
        "You are a project coordinator. Always delegate research tasks "
        "to your researcher subagent using the task tool. Keep your final response to one sentence."
    ),
    subagents=[
        {
            "name": "researcher",
            "description": "Researches topics thoroughly",
            "system_prompt": (
                "You are a thorough researcher. Research the given topic "
                "and provide a concise summary in 2-3 sentences."
            ),
        },
    ],
)

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Write a short summary about AI safety"}]},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "updates":
        if not chunk["ns"]:
            for node_name, data in chunk["data"].items():
                if node_name == "tools":
                    for msg in data.get("messages", []):
                        if msg.type == "tool":
                            print(f"\nSubagent complete: {msg.name}")
                            print(f"  Result: {str(msg.content)[:200]}...")
                else:
                    print(f"[main agent] step: {node_name}")
        else:
            for node_name, data in chunk["data"].items():
                print(f"  [{chunk['ns'][0]}] step: {node_name}")
```

## Demo 4: LLM Token 流式传输

```python
current_source = ""

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research quantum computing advances"}]},
    stream_mode="messages",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        is_subagent = any(s.startswith("tools:") for s in chunk["ns"])

        if is_subagent:
            subagent_ns = next(s for s in chunk["ns"] if s.startswith("tools:"))
            if subagent_ns != current_source:
                print(f"\n\n--- [subagent: {subagent_ns}] ---")
                current_source = subagent_ns
            if token.content:
                print(token.content, end="", flush=True)
        else:
            if "main" != current_source:
                print("\n\n--- [main agent] ---")
                current_source = "main"
            if token.content:
                print(token.content, end="", flush=True)

print()
```

## Demo 5: 工具调用流式传输

```python
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research recent quantum computing advances"}]},
    stream_mode="messages",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        is_subagent = any(s.startswith("tools:") for s in chunk["ns"])
        source = next((s for s in chunk["ns"] if s.startswith("tools:")), "main") if is_subagent else "main"

        if token.tool_call_chunks:
            for tc in token.tool_call_chunks:
                if tc.get("name"):
                    print(f"\n[{source}] Tool call: {tc['name']}")
                if tc.get("args"):
                    print(tc["args"], end="", flush=True)

        if token.type == "tool":
            print(f"\n[{source}] Tool result [{token.name}]: {str(token.content)[:150]}")

        if token.type == "ai" and token.content and not token.tool_call_chunks:
            print(token.content, end="", flush=True)

print()
```

## Demo 6: 自定义更新（get_stream_writer）

```python
import time
from langchain.tools import tool
from langgraph.config import get_stream_writer
from deepagents import create_deep_agent


@tool
def analyze_data(topic: str) -> str:
    """Run a data analysis on a given topic.

    This tool performs the actual analysis and emits progress updates.
    You MUST call this tool for any analysis request.
    """
    writer = get_stream_writer()

    writer({"status": "starting", "topic": topic, "progress": 0})
    time.sleep(0.5)

    writer({"status": "analyzing", "progress": 50})
    time.sleep(0.5)

    writer({"status": "complete", "progress": 100})
    return (
        f'Analysis of "{topic}": Customer sentiment is 85% positive, '
        "driven by product quality and support response times."
    )


agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt=(
        "You are a coordinator. For any analysis request, you MUST delegate "
        "to the analyst subagent using the task tool. Never try to answer directly. "
        "After receiving the result, summarize it in one sentence."
    ),
    subagents=[
        {
            "name": "analyst",
            "description": "Performs data analysis with real-time progress tracking",
            "system_prompt": (
                "You are a data analyst. You MUST call the analyze_data tool "
                "for every analysis request. Do not use any other tools. "
                "After the analysis completes, report the result."
            ),
            "tools": [analyze_data],
        },
    ],
)

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Analyze customer satisfaction trends"}]},
    stream_mode="custom",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "custom":
        is_subagent = any(s.startswith("tools:") for s in chunk["ns"])
        if is_subagent:
            subagent_ns = next(s for s in chunk["ns"] if s.startswith("tools:"))
            print(f"[{subagent_ns}]", chunk["data"])
        else:
            print("[main]", chunk["data"])
```

## Demo 7: 多模式组合流式传输

```python
INTERESTING_NODES = {"model_request", "tools"}

last_source = ""
mid_line = True

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Analyze the impact of remote work on team productivity"}]},
    stream_mode=["updates", "messages", "custom"],
    subgraphs=True,
    version="v2",
):
    is_subagent = any(s.startswith("tools:") for s in chunk["ns"])
    source = "subagent" if is_subagent else "main"

    if chunk["type"] == "updates":
        for node_name in chunk["data"]:
            if node_name not in INTERESTING_NODES:
                continue
            if mid_line:
                print()
                mid_line = False
            print(f"[{source}] step: {node_name}")

    elif chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if token.content:
            if source != last_source:
                if mid_line:
                    print()
                    mid_line = False
                print(f"\n[{source}] ", end="")
                last_source = source
            print(token.content, end="", flush=True)
            mid_line = True

    elif chunk["type"] == "custom":
        if mid_line:
            print()
            mid_line = False
        print(f"[{source}] custom event:", chunk["data"])

print()
```

## Demo 8: Subagent 生命周期跟踪

```python
active_subagents = {}

for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research the latest AI safety developments"}]},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    if chunk["type"] == "updates":
        for node_name, data in chunk["data"].items():
            # 阶段 1: 检测启动
            if not chunk["ns"] and node_name == "model_request":
                for msg in data.get("messages", []):
                    for tc in getattr(msg, "tool_calls", []):
                        if tc["name"] == "task":
                            active_subagents[tc["id"]] = {
                                "type": tc["args"].get("subagent_type"),
                                "description": tc["args"].get("description", "")[:80],
                                "status": "pending",
                            }
                            print(
                                f'[lifecycle] PENDING  → subagent "{tc["args"].get("subagent_type")}" '
                                f'({tc["id"]})'
                            )

            # 阶段 2: 检测运行
            if chunk["ns"] and chunk["ns"][0].startswith("tools:"):
                pregel_id = chunk["ns"][0].split(":")[1]
                for sub_id, sub in active_subagents.items():
                    if sub["status"] == "pending":
                        sub["status"] = "running"
                        print(
                            f'[lifecycle] RUNNING  → subagent "{sub["type"]}" '
                            f"(pregel: {pregel_id})"
                        )
                        break

            # 阶段 3: 检测完成
            if not chunk["ns"] and node_name == "tools":
                for msg in data.get("messages", []):
                    if msg.type == "tool":
                        sub = active_subagents.get(msg.tool_call_id)
                        if sub:
                            sub["status"] = "complete"
                            print(
                                f'[lifecycle] COMPLETE → subagent "{sub["type"]}" '
                                f"({msg.tool_call_id})"
                            )
                            print(f"  Result preview: {str(msg.content)[:120]}...")

print("\n--- Final subagent states ---")
for sub_id, sub in active_subagents.items():
    print(f"  {sub['type']}: {sub['status']}")
```

## Demo 9: v1 格式（旧版）

```python
# v1 格式 - 需要 (namespace, (mode, data)) 解包
for namespace, chunk in agent.stream(
    {"messages": [{"role": "user", "content": "Research quantum computing"}]},
    stream_mode=["updates", "messages", "custom"],
    subgraphs=True,
):
    mode, data = chunk[0], chunk[1]
    is_subagent = any(s.startswith("tools:") for s in namespace)

    if mode == "updates":
        if is_subagent:
            print(f"[subagent {namespace}] update: {data}")
        else:
            print(f"[main] update: {data}")

    elif mode == "messages":
        token, metadata = data
        if token.content:
            source = "subagent" if is_subagent else "main"
            print(f"[{source}] {token.content}", end="", flush=True)

    elif mode == "custom":
        source = "subagent" if is_subagent else "main"
        print(f"[{source}] custom: {data}")
```

## Demo 10: 完整流式传输应用

```python
from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph.config import get_stream_writer
import time


@tool
def web_search(query: str) -> str:
    """Search the web for information."""
    writer = get_stream_writer()
    writer({"status": "searching", "query": query})
    time.sleep(0.3)
    return f"Search results for '{query}': Found 10 relevant articles."


@tool
def write_report(topic: str, findings: str) -> str:
    """Write a report based on findings."""
    writer = get_stream_writer()
    writer({"status": "writing", "topic": topic})
    time.sleep(0.3)
    return f"Report on '{topic}': {findings[:200]}..."


agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="You are a project coordinator. Delegate tasks to subagents.",
    subagents=[
        {
            "name": "researcher",
            "description": "Researches topics using web search",
            "system_prompt": "You are a researcher. Use web_search to find information.",
            "tools": [web_search],
        },
        {
            "name": "writer",
            "description": "Writes reports based on research",
            "system_prompt": "You are a writer. Use write_report to create reports.",
            "tools": [write_report],
        },
    ],
)

input_data = {
    "messages": [{"role": "user", "content": "Research quantum computing and write a summary report"}]
}

# 启用所有流式传输模式
for chunk in agent.stream(
    input_data,
    stream_mode=["updates", "messages", "custom"],
    subgraphs=True,
    version="v2",
):
    is_subagent = any(s.startswith("tools:") for s in chunk["ns"])
    source = "subagent" if is_subagent else "main"

    if chunk["type"] == "updates":
        for node_name in chunk["data"]:
            if node_name in {"model_request", "tools"}:
                print(f"[{source}] step: {node_name}")

    elif chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if token.content:
            print(f"[{source}] {token.content}", end="", flush=True)

    elif chunk["type"] == "custom":
        print(f"[{source}] progress:", chunk["data"])

print()
```
