# Philosophy - Demo

## Demo 1: LangChain 的核心价值——标准化模型接口

```python
# 不同提供商，相同接口
from langchain.chat_models import init_chat_model

# OpenAI
model_openai = init_chat_model("openai:gpt-5.4", temperature=0.5)

# Anthropic
model_anthropic = init_chat_model("claude-sonnet-4-6", temperature=0.5)

# Google Gemini
model_gemini = init_chat_model(
    "gemini-3.1-pro-preview",
    model_provider="google-genai",
    temperature=0.5,
)

# 三个模型，相同接口，切换只需改一个参数
```

## Demo 2: 从 Chains 到 LangGraph 的演变

```python
# 旧方式（LangChain v0.0.x）— Chains
# from langchain.chains import RetrievalQA
# chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)

# 新方式（LangGraph）— 图编排
from langgraph.graph import StateGraph, START, END

def retrieve(state):
    docs = retriever.invoke(state["question"])
    return {"docs": docs}

def generate(state):
    answer = llm.invoke(f"Context: {state['docs']}\nQuestion: {state['question']}")
    return {"answer": answer}

graph = StateGraph(dict)
graph.add_node("retrieve", retrieve)
graph.add_node("generate", generate)
graph.add_edge(START, "retrieve")
graph.add_edge("retrieve", "generate")
graph.add_edge("generate", END)

app = graph.compile()
```

## Demo 3: LangChain Agent vs Deep Agent

```python
from langchain.agents import create_agent
from deepagents import create_deep_agent

# LangChain Agent — 你需要自己实现更多功能
agent = create_agent(
    model="openai:gpt-5.4",
    tools=[my_tool],
    system_prompt="You are a helpful assistant",
)

# Deep Agent — 内置规划、文件系统、子 agent
deep_agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[my_tool],
    system_prompt="You are a helpful assistant",
)
# Deep agent 自动拥有：write_todos、grep、read_file、子 agent 等
```

## Demo 4: 工具标准化（从 JSON 解析到 Function Calling）

```python
# 旧方式（2022-12）— 解析 JSON
# model 返回：{"tool": "search", "query": "weather"}
# 需要手动解析 JSON 并调用对应函数

# 新方式（2023-03+）— Function Calling
# model 直接返回结构化的工具调用

from langchain.tools import tool

@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

# LangChain 自动处理 Function Calling 协议
agent = create_agent(model="openai:gpt-5.4", tools=[search])
```

## Demo 5: 消息格式标准化（v1.0）

```python
# v1.0 之前 — 简单文本
# {"role": "assistant", "content": "Hello"}

# v1.0 之后 — 结构化内容块
# {"role": "assistant", "content_blocks": [
#     {"type": "text", "text": "Hello"},
#     {"type": "reasoning", "text": "Thinking..."},
#     {"type": "tool_use", "name": "search", "input": {...}}
# ]}

from langchain.agents import create_agent

agent = create_agent(model="openai:gpt-5.4", tools=[search])
result = agent.invoke({"messages": [{"role": "user", "content": "Hi"}]})

# v1.0 统一访问方式
for block in result["messages"][-1].content_blocks:
    if block["type"] == "text":
        print(block["text"])
    elif block["type"] == "tool_use":
        print(f"Tool: {block['name']}")
```

## Demo 6: Deep Agents 的内置能力

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[],
    system_prompt="You are a research assistant",
)

# Deep agent 自动拥有：
# 1. write_todos — 规划任务
# 2. read_file / write_file — 文件系统
# 3. grep — 搜索
# 4. 子 agent — 委派任务

result = agent.invoke(
    {"messages": [{"role": "user", "content": "Research the history of AI"}]},
    config={"configurable": {"thread_id": "research"}},
)
```

## Demo 7: LangSmith 追踪（可观测性）

```bash
# 设置 LangSmith
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."

# 运行 agent
python my_agent.py

# 在 https://smith.langchain.com 查看：
# - 每次 LLM 调用的输入/输出
# - 工具调用的详细信息
# - 执行时间
# - token 使用量
```

```python
# 代码中无需额外配置，LangSmith 自动追踪
from langchain.agents import create_agent

agent = create_agent(model="openai:gpt-5.4", tools=[search])
result = agent.invoke({"messages": [{"role": "user", "content": "Hello"}]})
# 自动出现在 LangSmith 控制台
```

## Demo 8: 完整演变对比

```python
"""
LangChain 演变示例：
2022: Chains + JSON 解析
2023: Function Calling + LangSmith
2024: LangGraph 独立
2025: v1.0 统一 agent 抽象
2026: Deep Agents
"""

# === 2025+ 方式：统一的 agent 抽象 ===
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

@tool
def search(query: str) -> str:
    """Search the web."""
    return f"Results for: {query}"

model = init_chat_model("openai:gpt-5.4", temperature=0.5)

agent = create_agent(
    model=model,
    tools=[search],
    system_prompt="You are a helpful research assistant",
    checkpointer=InMemorySaver(),
)

# 多轮对话（通过 thread_id 维持状态）
r1 = agent.invoke(
    {"messages": [{"role": "user", "content": "What is LangChain?"}]},
    config={"configurable": {"thread_id": "chat-1"}},
)
print(r1["messages"][-1].content_blocks)

r2 = agent.invoke(
    {"messages": [{"role": "user", "content": "How does it compare to LangGraph?"}]},
    config={"configurable": {"thread_id": "chat-1"}},  # 同一个 thread
)
print(r2["messages"][-1].content_blocks)
```
