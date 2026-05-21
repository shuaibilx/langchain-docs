# Human-in-the-Loop 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：基础 — approve 批准执行

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """发送邮件。"""
    return f"邮件已发送给 {to}，主题: {subject}"

@tool
def search_data(query: str) -> str:
    """搜索数据。"""
    return f"搜索结果: {query}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[send_email, search_data],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "send_email": True,   # 需要审批
                "search_data": False, # 自动批准
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-1"}}

# 第一次调用 — 会中断等待审批
result = agent.invoke(
    {"messages": [{"role": "user", "content": "给 test@example.com 发一封邮件，主题是会议通知"}]},
    config=config,
    version="v2",
)

# 检查中断
if result.interrupts:
    print("中断！需要审批:")
    for interrupt in result.interrupts:
        print(f"  操作: {interrupt.value['action_requests'][0]['name']}")
        print(f"  参数: {interrupt.value['action_requests'][0]['arguments']}")

    # 批准执行
    result = agent.invoke(
        Command(resume={"decisions": [{"type": "approve"}]}),
        config=config,
        version="v2",
    )

print(f"最终回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 2：reject 拒绝并反馈

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def delete_record(record_id: str) -> str:
    """删除记录。"""
    return f"已删除记录: {record_id}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[delete_record],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={"delete_record": True}
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-2"}}

# 触发中断
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除记录 REC-001"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    print("中断！操作被拒绝:")

    # 拒绝并反馈
    result = agent.invoke(
        Command(resume={
            "decisions": [{
                "type": "reject",
                "message": "不能直接删除，请先归档再删除"
            }]
        }),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 3：edit 修改后执行

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def update_price(product_id: str, new_price: float) -> str:
    """更新产品价格。"""
    return f"产品 {product_id} 价格已更新为 {new_price}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[update_price],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "update_price": {"allowed_decisions": ["approve", "edit", "reject"]}
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-3"}}

# 触发中断
result = agent.invoke(
    {"messages": [{"role": "user", "content": "把产品 P001 的价格改为 99.9"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    action = result.interrupts[0].value['action_requests'][0]
    print(f"原始参数: {action['arguments']}")

    # 修改价格
    result = agent.invoke(
        Command(resume={
            "decisions": [{
                "type": "edit",
                "edited_action": {
                    "name": "update_price",
                    "args": {"product_id": "P001", "new_price": 88.8}
                }
            }]
        }),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 4：respond 直接回复

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def ask_user(question: str) -> str:
    """向用户提问。"""
    return f"问题: {question}"

@tool
def process_data(data: str) -> str:
    """处理数据。"""
    return f"已处理: {data}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[ask_user, process_data],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "ask_user": {"allowed_decisions": ["respond"]},
                "process_data": False,
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-4"}}

# 触发中断
result = agent.invoke(
    {"messages": [{"role": "user", "content": "请问我喜欢什么颜色，然后处理数据"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    print("Agent 在提问:")

    # 直接回复
    result = agent.invoke(
        Command(resume={
            "decisions": [{
                "type": "respond",
                "message": "我喜欢蓝色"
            }]
        }),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 5：多个中断 — 批量决策

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def send_email(to: str, content: str) -> str:
    """发送邮件。"""
    return f"邮件已发送给 {to}"

@tool
def write_file(filename: str, content: str) -> str:
    """写入文件。"""
    return f"文件 {filename} 已写入"

@tool
def read_data(query: str) -> str:
    """读取数据。"""
    return f"数据: {query}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[send_email, write_file, read_data],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "send_email": True,
                "write_file": True,
                "read_data": False,
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-5"}}

# 触发中断
result = agent.invoke(
    {"messages": [{"role": "user", "content": "给 admin@test.com 发邮件通知，同时把结果写入 report.txt"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    actions = result.interrupts[0].value['action_requests']
    print(f"需要审批 {len(actions)} 个操作:")
    for i, action in enumerate(actions):
        print(f"  {i+1}. {action['name']}({action['arguments']})")

    # 批量决策：第一个批准，第二个拒绝
    result = agent.invoke(
        Command(resume={
            "decisions": [
                {"type": "approve"},
                {"type": "reject", "message": "不要写入文件，直接返回结果即可"}
            ]
        }),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 6：限制决策类型

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def execute_sql(query: str) -> str:
    """执行 SQL 查询。"""
    return f"SQL 执行结果: {query}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[execute_sql],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "execute_sql": {
                    "allowed_decisions": ["approve", "reject"],  # 不允许编辑
                    "description": "SQL 查询需要审批"
                }
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-6"}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "执行 SQL: SELECT * FROM users LIMIT 10"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    print(f"中断: {result.interrupts[0].value['action_requests'][0]['description']}")

    result = agent.invoke(
        Command(resume={"decisions": [{"type": "approve"}]}),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 7：流式处理中断

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def dangerous_action(action: str) -> str:
    """执行危险操作。"""
    return f"已执行: {action}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[dangerous_action],
    middleware=[
        HumanInTheLoopMiddleware(interrupt_on={"dangerous_action": True})
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-7"}}

# 流式处理直到中断
print("=== 流式执行 ===")
for chunk in agent.stream(
    {"messages": [{"role": "user", "content": "执行危险操作：清理缓存"}]},
    config=config,
    stream_mode=["updates", "messages"],
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if token.content:
            print(token.content, end="", flush=True)
    elif chunk["type"] == "updates":
        if "__interrupt__" in chunk["data"]:
            print(f"\n\n中断触发！")

# 流式恢复
print("\n=== 流式恢复 ===")
for chunk in agent.stream(
    Command(resume={"decisions": [{"type": "approve"}]}),
    config=config,
    stream_mode=["updates", "messages"],
    version="v2",
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        if token.content:
            print(token.content, end="", flush=True)
```

---

## Demo 8：自定义中断描述

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def transfer_money(to_account: str, amount: float) -> str:
    """转账。"""
    return f"已转账 {amount} 元到 {to_account}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[transfer_money],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "transfer_money": {
                    "allowed_decisions": ["approve", "reject"],
                    "description": lambda name, args: f"⚠️ 转账审批: 向 {args.get('to_account')} 转 {args.get('amount')} 元"
                }
            },
            description_prefix="需要人工审批"
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-8"}}

result = agent.invoke(
    {"messages": [{"role": "user", "content": "转账 1000 元到 account_456"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    desc = result.interrupts[0].value['action_requests'][0]['description']
    print(f"审批描述: {desc}")

    result = agent.invoke(
        Command(resume={"decisions": [{"type": "approve"}]}),
        config=config,
        version="v2",
    )

print(f"回复: {result.value['messages'][-1].content[:80]}")
```

---

## Demo 9：完整实战 — 多工具分层审批

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

@tool
def query_users(filter: str) -> str:
    """查询用户。"""
    return f"用户查询结果: {filter}"

@tool
def update_user(user_id: str, field: str, value: str) -> str:
    """更新用户信息。"""
    return f"用户 {user_id} 的 {field} 已更新为 {value}"

@tool
def delete_user(user_id: str) -> str:
    """删除用户。"""
    return f"用户 {user_id} 已删除"

@tool
def send_notification(user_id: str, message: str) -> str:
    """发送通知。"""
    return f"通知已发送给 {user_id}: {message}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[query_users, update_user, delete_user, send_notification],
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={
                "query_users": False,         # 安全，自动批准
                "update_user": True,          # 需要审批
                "delete_user": {              # 高风险，仅批准或拒绝
                    "allowed_decisions": ["approve", "reject"],
                    "description": "⚠️ 删除用户 - 高风险操作"
                },
                "send_notification": True,    # 需要审批
            }
        ),
    ],
    checkpointer=InMemorySaver(),
)

config = {"configurable": {"thread_id": "hitl-9"}}

# 查询（自动批准）
r = agent.invoke(
    {"messages": [{"role": "user", "content": "查询所有活跃用户"}]},
    config=config,
    version="v2",
)
print(f"查询: {r.value['messages'][-1].content[:60]}")

# 删除（需要审批）
r = agent.invoke(
    {"messages": [{"role": "user", "content": "删除用户 user_123"}]},
    config=config,
    version="v2",
)

if r.interrupts:
    print(f"中断: {r.interrupts[0].value['action_requests'][0]['description']}")

    # 拒绝
    r = agent.invoke(
        Command(resume={
            "decisions": [{
                "type": "reject",
                "message": "请先确认用户已导出数据"
            }]
        }),
        config=config,
        version="v2",
    )

print(f"结果: {r.value['messages'][-1].content[:80]}")
```

---

## 运行说明

1. Demo 1 基础 approve 批准
2. Demo 2 reject 拒绝并反馈
3. Demo 3 edit 修改后执行
4. Demo 4 respond 直接回复
5. Demo 5 多个中断批量决策
6. Demo 6 限制决策类型
7. Demo 7 流式处理中断
8. Demo 8 自定义中断描述
9. Demo 9 完整实战
