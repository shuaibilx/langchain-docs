# Async Subagents - Demo

## Demo 1: 基础异步 Subagent 配置

```python
from deepagents import AsyncSubAgent, create_deep_agent

async_subagents = [
    AsyncSubAgent(
        name="researcher",
        description="Research agent for information gathering and synthesis",
        graph_id="researcher",
        # 无 url → ASGI 传输（共同部署）
    ),
    AsyncSubAgent(
        name="coder",
        description="Coding agent for code generation and review",
        graph_id="coder",
    ),
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    subagents=async_subagents,
)

# 主管调用 start_async_task(name="researcher", task="Research quantum computing")
# 立即返回 task_id，主管继续与用户交互
```

## Demo 2: HTTP 远程传输

```python
from deepagents import AsyncSubAgent, create_deep_agent

async_subagents = [
    AsyncSubAgent(
        name="researcher",
        description="Research agent",
        graph_id="researcher",
        url="https://my-research-deployment.langsmith.dev",
    ),
    AsyncSubAgent(
        name="coder",
        description="Coding agent",
        graph_id="coder",
        url="https://coder-deployment.langsmith.dev",
        headers={"Authorization": "Bearer my-token"},
    ),
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    subagents=async_subagents,
)
```

## Demo 3: 混合部署（ASGI + HTTP）

```python
from deepagents import AsyncSubAgent, create_deep_agent

async_subagents = [
    AsyncSubAgent(
        name="researcher",
        description="Research agent",
        graph_id="researcher",
        # 无 url → ASGI（共同部署）
    ),
    AsyncSubAgent(
        name="coder",
        description="Coding agent",
        graph_id="coder",
        url="https://coder-deployment.langsmith.dev",
        # 有 url → HTTP（远程）
    ),
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    subagents=async_subagents,
)
```

## Demo 4: langgraph.json 配置

```json
{
  "graphs": {
    "supervisor": "./src/supervisor.py:graph",
    "researcher": "./src/researcher.py:graph",
    "coder": "./src/coder.py:graph"
  }
}
```

## Demo 5: 主管系统提示（防止轮询）

```python
from deepagents import AsyncSubAgent, create_deep_agent

async_subagents = [
    AsyncSubAgent(
        name="researcher",
        description="Conducts in-depth research using web search",
        graph_id="researcher",
    ),
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="""You are a research coordinator.

    When the user asks a research question:
    1. Call start_async_task to launch the researcher
    2. Tell the user the task has been started with the task ID
    3. ALWAYS return control to the user immediately
    4. Never call check_async_task right after launch
    5. Only check status when the user asks about progress""",
    subagents=async_subagents,
)
```

## Demo 6: 生命周期交互流程

```python
# 模拟交互流程

# 1. 用户提问
# User: "Research the latest developments in quantum computing"

# 2. 主管启动任务
# Supervisor → start_async_task(name="researcher", task="Research quantum computing")
# Returns: task_id = "abc123"
# Supervisor → User: "I've started a research task (ID: abc123). I'll let you know when it's done."

# 3. 用户继续对话
# User: "What about AI safety?"

# 4. 主管启动另一个任务
# Supervisor → start_async_task(name="researcher", task="Research AI safety")
# Returns: task_id = "def456"

# 5. 用户询问进度
# User: "How's the quantum computing research going?"

# 6. 主管检查状态
# Supervisor → check_async_task(task_id="abc123")
# Returns: status="success", result="Key findings: ..."

# 7. 主管报告结果
# Supervisor → User: "Here are the quantum computing findings: ..."
```

## Demo 7: 运行中更新任务

```python
# 1. 启动任务
# start_async_task(name="researcher", task="Research quantum computing")
# → task_id = "abc123"

# 2. 用户想补充信息
# User: "Also look into topological qubits specifically"

# 3. 主管更新任务
# update_async_task(task_id="abc123", message="Also research topological qubits")
# → 确认，subagent 以完整历史 + 新指令重新启动

# 4. 任务 ID 保持不变，继续使用 abc123 检查
```

## Demo 8: 取消任务

```python
# 1. 启动任务
# start_async_task(name="researcher", task="Research quantum computing")
# → task_id = "abc123"

# 2. 用户改变主意
# User: "Actually, stop that research. I don't need it anymore."

# 3. 主管取消任务
# cancel_async_task(task_id="abc123")
# → 确认，任务标记为 "cancelled"

# 4. 列出所有任务确认
# list_async_tasks()
# → [{task_id: "abc123", status: "cancelled", ...}]
```

## Demo 9: 列出所有任务

```python
# 主管调用 list_async_tasks()
# 返回所有跟踪任务的摘要：
# [
#   {task_id: "abc123", agent: "researcher", status: "running", created_at: "..."},
#   {task_id: "def456", agent: "coder", status: "success", created_at: "..."},
#   {task_id: "ghi789", agent: "researcher", status: "cancelled", created_at: "..."},
# ]
```

## Demo 10: 完整异步 Subagent 应用

```python
from deepagents import AsyncSubAgent, create_deep_agent

async_subagents = [
    AsyncSubAgent(
        name="researcher",
        description="Conducts in-depth research using web search. Use for questions requiring multiple searches and synthesis.",
        graph_id="researcher",
    ),
    AsyncSubAgent(
        name="coder",
        description="Generates, reviews, and debugs code. Use for implementation tasks.",
        graph_id="coder",
    ),
]

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="""You are a technical lead coordinating research and development.

    Workflow:
    1. When the user asks a research question, launch the researcher
    2. When the user needs code, launch the coder
    3. After launching any task, return control to the user immediately
    4. Check status only when asked
    5. Use list_async_tasks to show all active work

    IMPORTANT: Never poll. Launch and return.""",
    subagents=async_subagents,
)

# 使用：
# 用户："Research quantum computing and write a demo script"
# 主管：
#   1. start_async_task(name="researcher", task="Research quantum computing")
#   2. start_async_task(name="coder", task="Write a quantum computing demo script")
#   3. "I've launched both tasks. I'll check on them when you're ready."
```
