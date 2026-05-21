# Human-in-the-Loop - Demo

## Demo 1: 基础 HITL 配置

```python
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver


@tool
def remove_file(path: str) -> str:
    """Delete a file from the filesystem."""
    return f"Deleted {path}"


@tool
def fetch_file(path: str) -> str:
    """Read a file from the filesystem."""
    return f"Contents of {path}"


@tool
def notify_email(to: str, subject: str, body: str) -> str:
    """Send an email."""
    return f"Sent email to {to}"


checkpointer = MemorySaver()

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    tools=[remove_file, fetch_file, notify_email],
    interrupt_on={
        "remove_file": True,
        "fetch_file": False,
        "notify_email": {"allowed_decisions": ["approve", "reject"]},
    },
    checkpointer=checkpointer,
)
```

## Demo 2: 处理中断（审批）

```python
from langchain_core.utils.uuid import uuid7
from langgraph.types import Command

config = {"configurable": {"thread_id": str(uuid7())}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "Delete the file temp.txt"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_requests = interrupt_value["action_requests"]
    review_configs = interrupt_value["review_configs"]

    config_map = {cfg["action_name"]: cfg for cfg in review_configs}

    for action in action_requests:
        review_config = config_map[action["name"]]
        print(f"Tool: {action['name']}")
        print(f"Arguments: {action['args']}")
        print(f"Allowed decisions: {review_config['allowed_decisions']}")

    decisions = [{"type": "approve"}]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )

print(result.value["messages"][-1].content)
```

## Demo 3: 多工具调用批量审批

```python
config = {"configurable": {"thread_id": str(uuid7())}}

result = agent.invoke(
    {"messages": [{
        "role": "user",
        "content": "Delete temp.txt and send an email to admin@example.com"
    }]},
    config=config,
    version="v2",
)

if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_requests = interrupt_value["action_requests"]

    assert len(action_requests) == 2

    decisions = [
        {"type": "approve"},  # 第一个工具：delete_file
        {"type": "reject"}    # 第二个工具：send_email
    ]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )
```

## Demo 4: 编辑工具参数

```python
config = {"configurable": {"thread_id": str(uuid7())}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "Send email to everyone@company.com"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_request = interrupt_value["action_requests"][0]

    print(f"Original args: {action_request['args']}")

    decisions = [{
        "type": "edit",
        "edited_action": {
            "name": action_request["name"],
            "args": {
                "to": "team@company.com",
                "subject": "Important update",
                "body": "Please review the changes.",
            }
        }
    }]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )
```

## Demo 5: 拒绝执行

```python
config = {"configurable": {"thread_id": str(uuid7())}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "Delete all files in the temp directory"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    decisions = [{"type": "reject"}]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )

# 工具未执行，代理收到拒绝消息
```

## Demo 6: respond 决策（询问用户）

```python
interrupt_on = {
    "ask_user": {"allowed_decisions": ["respond"]},
}

# 当代理调用 ask_user 工具时：
# 1. 暂停执行
# 2. 显示问题给用户
# 3. 用户输入回答
# 4. 回答作为工具结果返回给代理

decisions = [{
    "type": "respond",
    "message": "I want to deploy to staging first, not production."
}]
```

## Demo 7: 按风险分级配置

```python
interrupt_on = {
    # 高风险：完全控制
    "delete_file": {"allowed_decisions": ["approve", "edit", "reject"]},
    "send_email": {"allowed_decisions": ["approve", "edit", "reject"]},

    # 中等风险：不允许编辑
    "write_file": {"allowed_decisions": ["approve", "reject"]},

    # 低风险：无中断
    "read_file": False,
    "list_files": False,
}
```

## Demo 8: Subagent 中断配置

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    tools=[delete_file, read_file],
    interrupt_on={
        "delete_file": True,
        "read_file": False,
    },
    subagents=[{
        "name": "file-manager",
        "description": "Manages file operations",
        "system_prompt": "You are a file management assistant.",
        "tools": [delete_file, read_file],
        "interrupt_on": {
            "delete_file": True,
            "read_file": True,  # 覆盖：subagent 中读取也需要审批
        }
    }],
    checkpointer=MemorySaver(),
)
```

## Demo 9: interrupt() 原语（工具内中断）

```python
from langchain.tools import tool
from langgraph.types import interrupt


@tool(description="Request human approval before proceeding with an action.")
def request_approval(action_description: str) -> str:
    """Request human approval using the interrupt() primitive."""
    approval = interrupt({
        "type": "approval_request",
        "action": action_description,
        "message": f"Please approve or reject: {action_description}",
    })

    if approval.get("approved"):
        return f"Action '{action_description}' was APPROVED. Proceeding..."
    else:
        return f"Action '{action_description}' was REJECTED. Reason: {approval.get('reason', 'No reason provided')}"


# 使用 interrupt() 原语的工具可以嵌入任何代理中
# 调用 interrupt() 时暂停执行
# Command(resume={"approved": True}) 恢复执行
```

## Demo 10: CompiledSubAgent + interrupt()

```python
from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command, interrupt
from deepagents import create_deep_agent, CompiledSubAgent


@tool(description="Request human approval before proceeding with an action.")
def request_approval(action_description: str) -> str:
    """Request human approval using the interrupt() primitive."""
    approval = interrupt({
        "type": "approval_request",
        "action": action_description,
    })
    if approval.get("approved"):
        return f"APPROVED: {action_description}"
    return f"REJECTED: {action_description}"


checkpointer = InMemorySaver()
model = ChatAnthropic(model_name="claude-sonnet-4-6", max_tokens=4096)

compiled_subagent = create_agent(
    model=model,
    tools=[request_approval],
    name="approval-agent",
)

parent_agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    checkpointer=checkpointer,
    subagents=[
        CompiledSubAgent(
            name="approval-agent",
            description="An agent that can request approvals",
            runnable=compiled_subagent,
        )
    ],
)

config = {"configurable": {"thread_id": "test-interrupt"}}

result = parent_agent.invoke(
    {"messages": [HumanMessage("Ask approval-agent to request approval for deploying to production")]},
    config=config,
    version="v2",
)

if result.interrupts:
    interrupt_value = result.interrupts[0].value
    print(f"Action: {interrupt_value.get('action')}")

    result2 = parent_agent.invoke(
        Command(resume={"approved": True}),
        config=config,
        version="v2",
    )
    tool_msgs = [m for m in result2.value.get("messages", []) if m.type == "tool"]
    if tool_msgs:
        print(f"Result: {tool_msgs[-1].content}")
```

## Demo 11: 完整 HITL 应用

```python
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.utils.uuid import uuid7
from langgraph.types import Command


@tool
def deploy_service(service: str, environment: str) -> str:
    """Deploy a service to the specified environment."""
    return f"Deployed {service} to {environment}"


@tool
def delete_database(db_name: str) -> str:
    """Delete a database permanently."""
    return f"Deleted database {db_name}"


@tool
def send_notification(to: str, message: str) -> str:
    """Send a notification to a user."""
    return f"Notified {to}: {message}"


@tool
def read_config(path: str) -> str:
    """Read a configuration file."""
    return f"Config at {path}"


checkpointer = MemorySaver()

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    tools=[deploy_service, delete_database, send_notification, read_config],
    interrupt_on={
        # 高风险：完全控制
        "delete_database": {"allowed_decisions": ["approve", "edit", "reject"]},
        "deploy_service": {"allowed_decisions": ["approve", "edit", "reject"]},

        # 中等风险：仅审批/拒绝
        "send_notification": {"allowed_decisions": ["approve", "reject"]},

        # 低风险：无中断
        "read_config": False,
    },
    checkpointer=checkpointer,
    system_prompt="You are a DevOps assistant. Always ask for confirmation before destructive operations.",
)

# 使用
config = {"configurable": {"thread_id": str(uuid7())}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "Deploy payment-service to production and delete the staging database"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_requests = interrupt_value["action_requests"]

    print(f"Pending actions: {len(action_requests)}")
    for action in action_requests:
        print(f"  - {action['name']}: {action['args']}")

    # 用户审批部署，拒绝删除
    decisions = [
        {"type": "approve"},  # deploy_service
        {"type": "reject"},   # delete_database
    ]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )

    print(result.value["messages"][-1].content)
```
