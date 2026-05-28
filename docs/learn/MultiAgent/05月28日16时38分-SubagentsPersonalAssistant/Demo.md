# Subagents Personal Assistant — 实操 Demo

## 项目结构

```
personal-assistant/
├── assistant.py          # 主脚本 — 完整 Supervisor 系统
├── tools.py              # 底层 API 工具（Stub）
├── agents.py             # 子代理定义
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

## Step 2: 底层 API 工具

### tools.py

```python
"""底层 API 工具 — 实际应用中替换为真实 API"""

from langchain.tools import tool
from datetime import datetime, timedelta


@tool
def create_calendar_event(
    title: str,
    start_time: str,
    end_time: str,
    attendees: list[str],
    location: str = "",
) -> str:
    """Create a calendar event. Requires exact ISO datetime format.

    Args:
        title: Event title
        start_time: ISO format datetime (e.g., "2024-01-15T14:00:00")
        end_time: ISO format datetime
        attendees: List of email addresses
        location: Optional location
    """
    # Stub: 替换为 Google Calendar API / Outlook API
    print(f"  [API] Creating event: {title}")
    print(f"  [API] Time: {start_time} → {end_time}")
    print(f"  [API] Attendees: {attendees}")
    return f"Event created: {title} from {start_time} to {end_time} with {len(attendees)} attendees at {location or 'TBD'}"


@tool
def send_email(
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] = [],
) -> str:
    """Send an email via email API.

    Args:
        to: List of recipient email addresses
        subject: Email subject line
        body: Email body text
        cc: Optional CC recipients
    """
    # Stub: 替换为 SendGrid / Gmail API
    print(f"  [API] Sending email to: {to}")
    print(f"  [API] Subject: {subject}")
    return f"Email sent to {', '.join(to)} - Subject: {subject}"


@tool
def get_available_time_slots(
    attendees: list[str],
    date: str,
    duration_minutes: int,
) -> list[str]:
    """Check calendar availability for given attendees on a specific date.

    Args:
        attendees: List of email addresses
        date: ISO format date (e.g., "2024-01-15")
        duration_minutes: Meeting duration in minutes
    """
    # Stub: 替换为真实日历查询
    print(f"  [API] Checking availability for {attendees} on {date}")
    return ["09:00", "10:30", "14:00", "15:30"]
```

---

## Step 3: 子代理定义

### agents.py

```python
"""子代理定义 — Calendar Agent + Email Agent"""

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from tools import create_calendar_event, send_email, get_available_time_slots


CALENDAR_AGENT_PROMPT = (
    "You are a calendar scheduling assistant. "
    "Parse natural language scheduling requests (e.g., 'next Tuesday at 2pm') "
    "into proper ISO datetime formats. "
    "Use get_available_time_slots to check availability when needed. "
    "If there is no suitable time slot, stop and confirm unavailability. "
    "Use create_calendar_event to schedule events. "
    "Always confirm what was scheduled in your final response."
)

EMAIL_AGENT_PROMPT = (
    "You are an email assistant. "
    "Compose professional emails based on natural language requests. "
    "Extract recipient information and craft appropriate subject lines and body text. "
    "Use send_email to send the message. "
    "Always confirm what was sent in your final response."
)


def create_calendar_agent(model, with_hitl: bool = True):
    """创建日历代理。"""
    middleware = []
    if with_hitl:
        middleware.append(
            HumanInTheLoopMiddleware(
                interrupt_on={"create_calendar_event": True},
                description_prefix="Calendar event pending approval",
            )
        )

    return create_agent(
        model,
        tools=[create_calendar_event, get_available_time_slots],
        system_prompt=CALENDAR_AGENT_PROMPT,
        middleware=middleware,
    )


def create_email_agent(model, with_hitl: bool = True):
    """创建邮件代理。"""
    middleware = []
    if with_hitl:
        middleware.append(
            HumanInTheLoopMiddleware(
                interrupt_on={"send_email": True},
                description_prefix="Outbound email pending approval",
            )
        )

    return create_agent(
        model,
        tools=[send_email],
        system_prompt=EMAIL_AGENT_PROMPT,
        middleware=middleware,
    )
```

---

## Step 4: 主脚本

### assistant.py

```python
"""Personal Assistant — Supervisor 模式多代理系统"""

import sys
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agents import create_calendar_agent, create_email_agent


def create_assistant(model_name: str = "gpt-4o-mini", with_hitl: bool = True):
    """创建完整的个人助理系统。"""
    model = init_chat_model(model_name)

    # 1. 创建子代理
    calendar_agent = create_calendar_agent(model, with_hitl)
    email_agent = create_email_agent(model, with_hitl)

    # 2. 将子代理包装为高层工具
    @tool
    def schedule_event(request: str) -> str:
        """Schedule calendar events using natural language.

        Use this when the user wants to create, modify, or check calendar appointments.
        Handles date/time parsing, availability checking, and event creation.

        Input: Natural language scheduling request (e.g., 'meeting with design team
        next Tuesday at 2pm')
        """
        result = calendar_agent.invoke({"messages": [{"role": "user", "content": request}]})
        return result["messages"][-1].text

    @tool
    def manage_email(request: str) -> str:
        """Send emails using natural language.

        Use this when the user wants to send notifications, reminders, or any email
        communication. Handles recipient extraction, subject generation, and email
        composition.

        Input: Natural language email request (e.g., 'send them a reminder about
        the meeting')
        """
        result = email_agent.invoke({"messages": [{"role": "user", "content": request}]})
        return result["messages"][-1].text

    # 3. 创建 Supervisor
    supervisor_prompt = (
        "You are a helpful personal assistant. "
        "You can schedule calendar events and send emails. "
        "Break down user requests into appropriate tool calls and coordinate the results. "
        "When a request involves multiple actions, use multiple tools in sequence."
    )

    supervisor = create_agent(
        model,
        tools=[schedule_event, manage_email],
        system_prompt=supervisor_prompt,
        checkpointer=InMemorySaver() if with_hitl else None,
    )

    return supervisor


def run_query(supervisor, query: str, thread_id: str = "1"):
    """运行查询。"""
    config = {"configurable": {"thread_id": thread_id}}

    print(f"\n{'='*60}")
    print(f"User: {query}")
    print(f"{'='*60}\n")

    interrupts = []
    for step in supervisor.stream(
        {"messages": [{"role": "user", "content": query}]},
        config,
        stream_mode="updates",
    ):
        for node_name, update in step.items():
            if isinstance(update, dict):
                messages = update.get("messages", [])
                for msg in messages:
                    if hasattr(msg, "content") and msg.content:
                        print(f"[{node_name}] {msg.content[:300]}")
                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                        for tc in msg.tool_calls:
                            print(f"[{node_name}] → {tc['name']}({tc['args']})")
            else:
                # Interrupt
                if isinstance(update, (list, tuple)):
                    for interrupt in update:
                        if hasattr(interrupt, "value"):
                            interrupts.append(interrupt)
                            print(f"\n⏸️  INTERRUPTED:")
                            for req in interrupt.value.get("action_requests", []):
                                print(f"  {req.get('description', '')}")
                                print(f"  Tool: {req.get('tool', '')}")
                                print(f"  Args: {req.get('args', {})}")

    return config, interrupts


def resume_with_approval(supervisor, config, interrupts):
    """批准所有中断并继续执行。"""
    if not interrupts:
        return

    print(f"\n▶️  Resuming with approval...\n")

    resume = {}
    for interrupt in interrupts:
        resume[interrupt.id] = {"decisions": [{"type": "approve"}]}

    for step in supervisor.stream(
        Command(resume=resume),
        config,
        stream_mode="updates",
    ):
        for node_name, update in step.items():
            if isinstance(update, dict):
                messages = update.get("messages", [])
                for msg in messages:
                    if hasattr(msg, "content") and msg.content:
                        print(f"[{node_name}] {msg.content[:300]}")


def main():
    """主入口。"""
    # 解析参数
    with_hitl = "--hitl" in sys.argv
    query_args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if query_args:
        query = " ".join(query_args)
    else:
        query = (
            "Schedule a meeting with the design team next Tuesday at 2pm for 1 hour, "
            "and send them an email reminder about reviewing the new mockups."
        )

    # 创建助理
    supervisor = create_assistant(with_hitl=with_hitl)

    # 运行查询
    config, interrupts = run_query(supervisor, query)

    # 如果有中断，自动批准并继续
    if with_hitl and interrupts:
        resume_with_approval(supervisor, config, interrupts)


if __name__ == "__main__":
    main()
```

---

## Step 5: 运行

```bash
# 无人工审查模式
python assistant.py

# 带人工审查模式
python assistant.py --hitl

# 自定义查询
python assistant.py "Send Bob a reminder about the deadline tomorrow"
python assistant.py --hitl "Schedule a call with Alice and email her the agenda"
```

---

## 进阶：添加更多子代理

```python
# 添加 CRM 代理
@tool
def lookup_contact(request: str) -> str:
    """Look up contact information from CRM."""
    result = crm_agent.invoke({"messages": [{"role": "user", "content": request}]})
    return result["messages"][-1].text

# 添加数据库查询代理
@tool
def query_database(request: str) -> str:
    """Query the company database using natural language."""
    result = db_agent.invoke({"messages": [{"role": "user", "content": request}]})
    return result["messages"][-1].text

# Supervisor 使用所有高层工具
supervisor = create_agent(
    model,
    tools=[schedule_event, manage_email, lookup_contact, query_database],
    system_prompt=SUPERVISOR_PROMPT,
)
```

---

## 进阶：传递完整上下文

```python
from langchain.tools import tool, ToolRuntime

@tool
def schedule_event(request: str, runtime: ToolRuntime) -> str:
    """Schedule calendar events using natural language."""
    # 取 supervisor state 中的原始用户消息
    original = next(
        m for m in runtime.state["messages"]
        if hasattr(m, "type") and m.type == "human"
    )
    prompt = (
        f"User's full request: {original.text}\n\n"
        f"Your specific task: {request}"
    )
    result = calendar_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return result["messages"][-1].text
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Supervisor 不调用工具 | 提示词不够明确 | 在 system_prompt 中列出可用工具 |
| 子代理返回空结果 | 子代理提示词缺少 "confirm in final response" | 加强提示词 |
| 日期解析错误 | 子代理没有正确转换格式 | 在提示词中给出 ISO 格式示例 |
| Human-in-the-loop 不生效 | 缺少 checkpointer | 确保 supervisor 有 checkpointer |
| 中断后无法恢复 | thread_id 不一致 | 确保 config 中 thread_id 正确 |
| 子代理不知道上下文 | 默认只传 request 字符串 | 用 ToolRuntime 传递完整上下文 |
| 并行调用失败 | 子代理有副作用 | 确保子代理是无状态的 |
