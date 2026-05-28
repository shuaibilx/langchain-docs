# Handoffs Customer Support — 实操 Demo

## 项目结构

```
customer-support/
├── support_agent.py      # 主脚本 — 状态机客户支持代理
├── requirements.txt
└── .env
```

---

## Step 1: 环境准备

### requirements.txt

```txt
langchain
langchain-openai
langchain-core
langgraph
```

### 环境变量

```bash
export OPENAI_API_KEY="sk-..."
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."
```

---

## Step 2: 完整实现

### support_agent.py

```python
"""Customer Support State Machine — 状态机模式客户支持代理

核心思想：单个代理，通过工具返回 Command 动态切换配置。
每个步骤 = 不同的 system_prompt + tools。
"""

from typing import Callable, Literal
from typing_extensions import NotRequired

from langchain.agents import AgentState, create_agent
from langchain.agents.middleware import (
    wrap_model_call,
    ModelRequest,
    ModelResponse,
    SummarizationMiddleware,
)
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage, ToolMessage
from langchain.tools import tool, ToolRuntime
from langchain_core.utils.uuid import uuid7
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command


# ============================================================
# 1. 自定义状态
# ============================================================

SupportStep = Literal["warranty_collector", "issue_classifier", "resolution_specialist"]


class SupportState(AgentState):
    current_step: NotRequired[SupportStep]
    warranty_status: NotRequired[Literal["in_warranty", "out_of_warranty"]]
    issue_type: NotRequired[Literal["hardware", "software"]]


# ============================================================
# 2. 工具 — 返回 Command 更新状态
# ============================================================

@tool
def record_warranty_status(
    status: Literal["in_warranty", "out_of_warranty"],
    runtime: ToolRuntime[None, SupportState],
) -> Command:
    """Record the customer's warranty status and transition to issue classification.

    Args:
        status: Either 'in_warranty' or 'out_of_warranty'
    """
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=f"Warranty status recorded as: {status}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
            "warranty_status": status,
            "current_step": "issue_classifier",
        }
    )


@tool
def record_issue_type(
    issue_type: Literal["hardware", "software"],
    runtime: ToolRuntime[None, SupportState],
) -> Command:
    """Record the type of issue and transition to resolution specialist.

    Args:
        issue_type: Either 'hardware' or 'software'
    """
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=f"Issue type recorded as: {issue_type}",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
            "issue_type": issue_type,
            "current_step": "resolution_specialist",
        }
    )


@tool
def escalate_to_human(reason: str) -> str:
    """Escalate the case to a human support specialist.

    Args:
        reason: Reason for escalation
    """
    return f"Case escalated to human support. Reason: {reason}. A specialist will contact you shortly."


@tool
def provide_solution(solution: str) -> str:
    """Provide a solution to the customer's issue.

    Args:
        solution: The solution or next steps
    """
    return f"Solution: {solution}"


@tool
def go_back_to_warranty() -> Command:
    """Go back to warranty verification step to correct information."""
    return Command(update={"current_step": "warranty_collector"})


@tool
def go_back_to_classification() -> Command:
    """Go back to issue classification step to correct information."""
    return Command(update={"current_step": "issue_classifier"})


# ============================================================
# 3. 步骤配置 — 提示词 + 工具 + 依赖
# ============================================================

WARRANTY_COLLECTOR_PROMPT = """You are a customer support agent helping with device issues.

CURRENT STEP: Warranty verification

At this step, you need to:
1. Greet the customer warmly
2. Ask if their device is under warranty
3. Use record_warranty_status to record their response and move to the next step

Be conversational and friendly. Don't ask multiple questions at once.
Respond in the same language as the customer."""

ISSUE_CLASSIFIER_PROMPT = """You are a customer support agent helping with device issues.

CURRENT STEP: Issue classification
CUSTOMER INFO: Warranty status is {warranty_status}

At this step, you need to:
1. Ask the customer to describe their issue
2. Determine if it's a hardware issue (physical damage, broken parts) or software issue (app crashes, performance)
3. Use record_issue_type to record the classification and move to the next step

If unclear, ask clarifying questions before classifying.
Respond in the same language as the customer."""

RESOLUTION_SPECIALIST_PROMPT = """You are a customer support agent helping with device issues.

CURRENT STEP: Resolution
CUSTOMER INFO: Warranty status is {warranty_status}, issue type is {issue_type}

At this step, you need to:
1. For SOFTWARE issues: provide troubleshooting steps using provide_solution
2. For HARDWARE issues:
   - If IN WARRANTY: explain warranty repair process using provide_solution
   - If OUT OF WARRANTY: escalate_to_human for paid repair options

If the customer indicates any information was wrong, use:
- go_back_to_warranty to correct warranty status
- go_back_to_classification to correct issue type

Be specific and helpful in your solutions.
Respond in the same language as the customer."""


STEP_CONFIG = {
    "warranty_collector": {
        "prompt": WARRANTY_COLLECTOR_PROMPT,
        "tools": [record_warranty_status],
        "requires": [],
    },
    "issue_classifier": {
        "prompt": ISSUE_CLASSIFIER_PROMPT,
        "tools": [record_issue_type],
        "requires": ["warranty_status"],
    },
    "resolution_specialist": {
        "prompt": RESOLUTION_SPECIALIST_PROMPT,
        "tools": [provide_solution, escalate_to_human, go_back_to_warranty, go_back_to_classification],
        "requires": ["warranty_status", "issue_type"],
    },
}


# ============================================================
# 4. 中间件 — 根据 current_step 动态切换配置
# ============================================================

@wrap_model_call
def apply_step_config(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse],
) -> ModelResponse:
    """根据 current_step 动态注入提示词和工具。"""
    current_step = request.state.get("current_step", "warranty_collector")
    step_config = STEP_CONFIG[current_step]

    # 验证依赖
    for key in step_config["requires"]:
        if request.state.get(key) is None:
            raise ValueError(f"{key} must be set before reaching {current_step}")

    # 格式化提示词
    system_prompt = step_config["prompt"].format(**request.state)

    # 注入配置
    request = request.override(
        system_prompt=system_prompt,
        tools=step_config["tools"],
    )

    return handler(request)


# ============================================================
# 5. 创建代理
# ============================================================

def create_support_agent(model_name: str = "gpt-4o-mini"):
    """创建客户支持状态机代理。"""
    model = init_chat_model(model_name)

    all_tools = [
        record_warranty_status,
        record_issue_type,
        provide_solution,
        escalate_to_human,
        go_back_to_warranty,
        go_back_to_classification,
    ]

    agent = create_agent(
        model,
        tools=all_tools,
        state_schema=SupportState,
        middleware=[
            apply_step_config,
            SummarizationMiddleware(
                model=model_name,
                trigger=("tokens", 4000),
                keep=("messages", 10),
            ),
        ],
        checkpointer=InMemorySaver(),
    )

    return agent


# ============================================================
# 6. 交互式运行
# ============================================================

def run_interactive():
    """交互式运行客户支持代理。"""
    agent = create_support_agent()
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    print("Customer Support Agent")
    print("Type 'quit' to exit, 'restart' to start over")
    print("=" * 50)

    while True:
        user_input = input("\nYou: ").strip()
        if not user_input:
            continue
        if user_input.lower() == "quit":
            break
        if user_input.lower() == "restart":
            thread_id = str(uuid7())
            config = {"configurable": {"thread_id": thread_id}}
            print("Conversation restarted.")
            continue

        result = agent.invoke(
            {"messages": [HumanMessage(content=user_input)]},
            config,
        )

        # 打印代理回复
        for msg in result["messages"]:
            if hasattr(msg, "type") and msg.type == "ai" and msg.content:
                print(f"\nAgent: {msg.content}")

        # 打印当前状态
        current_step = result.get("current_step", "warranty_collector")
        warranty = result.get("warranty_status", "unknown")
        issue = result.get("issue_type", "unknown")
        print(f"\n[State: step={current_step}, warranty={warranty}, issue={issue}]")


# ============================================================
# 7. 自动演示
# ============================================================

def run_demo():
    """自动演示完整工作流。"""
    agent = create_support_agent()
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    conversations = [
        ("Turn 1", "Hi, my phone screen is cracked"),
        ("Turn 2", "Yes, it's still under warranty"),
        ("Turn 3", "The screen is physically cracked from dropping it"),
        ("Turn 4", "What should I do?"),
    ]

    for label, msg in conversations:
        print(f"\n{'='*50}")
        print(f"{label}: {msg}")
        print(f"{'='*50}")

        result = agent.invoke(
            {"messages": [HumanMessage(content=msg)]},
            config,
        )

        for m in result["messages"]:
            if hasattr(m, "type") and m.type == "ai" and m.content:
                print(f"\nAgent: {m.content[:300]}")

        current_step = result.get("current_step", "warranty_collector")
        print(f"\n[Step: {current_step}]")


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    import sys

    if "--interactive" in sys.argv or "-i" in sys.argv:
        run_interactive()
    else:
        run_demo()
```

---

## Step 3: 运行

```bash
# 自动演示
python support_agent.py

# 交互式模式
python support_agent.py --interactive
```

---

## 进阶：添加更多步骤

```python
# 添加退款步骤
@tool
def process_refund(amount: float, runtime: ToolRuntime[None, SupportState]) -> Command:
    """Process a refund for the customer."""
    return Command(
        update={
            "messages": [ToolMessage(content=f"Refund of ${amount} processed", tool_call_id=runtime.tool_call_id)],
            "current_step": "completed",
        }
    )

# 添加到 STEP_CONFIG
STEP_CONFIG["resolution_specialist"]["tools"].append(process_refund)
```

---

## 进阶：外部状态触发转换

```python
# 模拟外部 API 返回结果触发状态转换
@tool
def check_repair_status(order_id: str, runtime: ToolRuntime[None, SupportState]) -> Command:
    """Check repair status from external system."""
    # 实际中调用外部 API
    status = api_client.get_repair_status(order_id)

    if status == "completed":
        return Command(update={"current_step": "completed"})
    elif status == "needs_info":
        return Command(update={"current_step": "issue_classifier"})
    else:
        return f"Repair status: {status}"
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| current_step 不更新 | 工具没有返回 Command | 确保工具返回 `Command(update={...})` |
| 提示词变量报错 | 缺少 requires 中的状态 | 检查 STEP_CONFIG 的 requires |
| 中间件不生效 | 未使用 @wrap_model_call | 确保装饰器正确 |
| 状态丢失 | 缺少 checkpointer | 确保有 InMemorySaver |
| 回退后信息丢失 | 状态被覆盖 | 回退时保留已有数据 |
| 代理不调用转换工具 | 提示词不够明确 | 在提示词中明确要求使用工具 |
