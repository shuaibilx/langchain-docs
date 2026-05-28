# Skills SQL Assistant — 实操 Demo

## 项目结构

```
skills-sql-assistant/
├── sql_assistant.py      # 主脚本 — 渐进式披露 SQL 助手
├── skills_data.py        # 技能数据定义
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
```

---

## Step 2: 技能数据

### skills_data.py

```python
"""技能定义 — 销售分析 + 库存管理"""

from typing import TypedDict


class Skill(TypedDict):
    name: str
    description: str
    content: str


SKILLS: list[Skill] = [
    {
        "name": "sales_analytics",
        "description": "Database schema and business logic for sales data analysis including customers, orders, and revenue.",
        "content": """# Sales Analytics Schema

## Tables

### customers
- customer_id (PRIMARY KEY)
- name
- email
- signup_date
- status (active/inactive)
- customer_tier (bronze/silver/gold/platinum)

### orders
- order_id (PRIMARY KEY)
- customer_id (FOREIGN KEY -> customers)
- order_date
- status (pending/completed/cancelled/refunded)
- total_amount
- sales_region (north/south/east/west)

### order_items
- item_id (PRIMARY KEY)
- order_id (FOREIGN KEY -> orders)
- product_id
- quantity
- unit_price
- discount_percent

## Business Logic

- **Active customers**: status = 'active' AND signup_date <= CURRENT_DATE - INTERVAL '90 days'
- **Revenue**: Only count orders with status = 'completed'
- **High-value orders**: total_amount > 1000
- **Customer lifetime value (CLV)**: Sum of all completed order amounts

## Example Queries

-- Top 10 customers by revenue in last quarter
SELECT c.customer_id, c.name, c.customer_tier, SUM(o.total_amount) as total_revenue
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed' AND o.order_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY c.customer_id, c.name, c.customer_tier
ORDER BY total_revenue DESC LIMIT 10;

-- Monthly revenue trend
SELECT DATE_TRUNC('month', order_date) as month, SUM(total_amount) as revenue
FROM orders WHERE status = 'completed'
GROUP BY month ORDER BY month;
""",
    },
    {
        "name": "inventory_management",
        "description": "Database schema and business logic for inventory tracking including products, warehouses, and stock levels.",
        "content": """# Inventory Management Schema

## Tables

### products
- product_id (PRIMARY KEY)
- product_name
- sku
- category
- unit_cost
- reorder_point (minimum stock before reordering)
- discontinued (boolean)

### warehouses
- warehouse_id (PRIMARY KEY)
- warehouse_name
- location
- capacity

### inventory
- inventory_id (PRIMARY KEY)
- product_id (FOREIGN KEY -> products)
- warehouse_id (FOREIGN KEY -> warehouses)
- quantity_on_hand
- last_updated

### stock_movements
- movement_id (PRIMARY KEY)
- product_id (FOREIGN KEY -> products)
- warehouse_id (FOREIGN KEY -> warehouses)
- movement_type (inbound/outbound/transfer/adjustment)
- quantity (positive=inbound, negative=outbound)
- movement_date
- reference_number

## Business Logic

- **Available stock**: quantity_on_hand > 0
- **Reorder needed**: SUM(quantity_on_hand) <= reorder_point
- **Active products**: discontinued = false
- **Stock valuation**: quantity_on_hand * unit_cost

## Example Queries

-- Products below reorder point
SELECT p.product_id, p.product_name, p.reorder_point,
       SUM(i.quantity_on_hand) as total_stock,
       (p.reorder_point - SUM(i.quantity_on_hand)) as units_to_reorder
FROM products p
JOIN inventory i ON p.product_id = i.product_id
WHERE p.discontinued = false
GROUP BY p.product_id, p.product_name, p.reorder_point
HAVING SUM(i.quantity_on_hand) <= p.reorder_point
ORDER BY units_to_reorder DESC;

-- Stock by warehouse
SELECT w.warehouse_name, p.category, SUM(i.quantity_on_hand) as total_stock
FROM inventory i
JOIN warehouses w ON i.warehouse_id = w.warehouse_id
JOIN products p ON i.product_id = p.product_id
GROUP BY w.warehouse_name, p.category;
""",
    },
]
```

---

## Step 3: 主脚本

### sql_assistant.py

```python
"""SQL Assistant with On-Demand Skills — 渐进式披露模式

核心思想：系统提示词只放技能描述（轻量），完整 schema 通过工具按需加载。
"""

from typing import Callable
from langchain_core.utils.uuid import uuid7
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware,
    ModelRequest,
    ModelResponse,
)
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage
from langgraph.checkpoint.memory import InMemorySaver

from skills_data import SKILLS


# ============================================================
# 1. 技能加载工具
# ============================================================

@tool
def load_skill(skill_name: str) -> str:
    """Load the full content of a skill into the agent's context.

    Use this when you need detailed information about database schema,
    business logic, or specific domain knowledge.

    Args:
        skill_name: The name of the skill to load (e.g., "sales_analytics", "inventory_management")
    """
    for skill in SKILLS:
        if skill["name"] == skill_name:
            return f"Loaded skill: {skill_name}\n\n{skill['content']}"

    available = ", ".join(s["name"] for s in SKILLS)
    return f"Skill '{skill_name}' not found. Available skills: {available}"


@tool
def list_skills() -> str:
    """List all available skills with their descriptions."""
    result = []
    for skill in SKILLS:
        result.append(f"- **{skill['name']}**: {skill['description']}")
    return "\n".join(result)


# ============================================================
# 2. 技能中间件 — 注入描述 + 注册工具
# ============================================================

class SkillMiddleware(AgentMiddleware):
    """Injects skill descriptions into system prompt and registers load_skill tool."""

    tools = [load_skill, list_skills]

    def __init__(self):
        skills_list = []
        for skill in SKILLS:
            skills_list.append(f"- **{skill['name']}**: {skill['description']}")
        self.skills_prompt = "\n".join(skills_list)

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Inject skill descriptions into system prompt."""
        skills_addendum = (
            f"\n\n## Available Skills\n\n{self.skills_prompt}\n\n"
            "Use the load_skill tool when you need detailed schema information "
            "or business logic for a specific domain. "
            "Use list_skills to see all available skills."
        )

        new_content = list(request.system_message.content_blocks) + [
            {"type": "text", "text": skills_addendum}
        ]
        new_system_message = SystemMessage(content=new_content)
        modified_request = request.override(system_message=new_system_message)
        return handler(modified_request)


# ============================================================
# 3. 创建代理
# ============================================================

def create_sql_assistant(model_name: str = "gpt-4o-mini"):
    """创建带技能支持的 SQL 助手。"""
    model = init_chat_model(model_name)

    agent = create_agent(
        model,
        system_prompt=(
            "You are a SQL query assistant that helps users "
            "write queries against business databases. "
            "Always load the relevant skill before writing SQL queries "
            "to understand the database schema and business rules. "
            "Explain your query logic based on the loaded schema."
        ),
        middleware=[SkillMiddleware()],
        checkpointer=InMemorySaver(),
    )

    return agent


# ============================================================
# 4. 交互式运行
# ============================================================

def run_interactive():
    """交互式 SQL 助手。"""
    agent = create_sql_assistant()
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    print("SQL Assistant with On-Demand Skills")
    print("Commands: 'quit' to exit, 'restart' to start over, 'skills' to list skills")
    print("=" * 60)

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
        if user_input.lower() == "skills":
            for skill in SKILLS:
                print(f"  - {skill['name']}: {skill['description']}")
            continue

        result = agent.invoke(
            {"messages": [{"role": "user", "content": user_input}]},
            config,
        )

        for msg in result["messages"]:
            if hasattr(msg, "type") and msg.type == "ai":
                if msg.content:
                    print(f"\nAssistant: {msg.content}")
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        print(f"\n  [Tool call] {tc['name']}({tc['args']})")
            elif hasattr(msg, "type") and msg.type == "tool":
                content_preview = msg.content[:200] + "..." if len(msg.content) > 200 else msg.content
                print(f"\n  [Tool result] {msg.name}: {content_preview}")


# ============================================================
# 5. 自动演示
# ============================================================

def run_demo():
    """自动演示渐进式披露。"""
    agent = create_sql_assistant()
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    queries = [
        ("Sales Query", "Write a SQL query to find all customers who made orders over $1000 in the last month"),
        ("Inventory Query", "Which products need to be reordered across all warehouses?"),
        ("Cross-domain", "Join sales and inventory data to find which products generate the most revenue"),
    ]

    for label, query in queries:
        print(f"\n{'='*60}")
        print(f"[{label}] {query}")
        print(f"{'='*60}")

        # 新线程
        thread_id = str(uuid7())
        config = {"configurable": {"thread_id": thread_id}}

        result = agent.invoke(
            {"messages": [{"role": "user", "content": query}]},
            config,
        )

        for msg in result["messages"]:
            if hasattr(msg, "type") and msg.type == "ai":
                if msg.content:
                    print(f"\nAssistant:\n{msg.content[:500]}")
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        print(f"\n  [Loaded: {tc['args'].get('skill_name', '?')}]")
            elif hasattr(msg, "type") and msg.type == "tool":
                print(f"  [Skill content: {len(msg.content)} chars loaded]")


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

## Step 4: 运行

```bash
# 自动演示
python sql_assistant.py

# 交互式模式
python sql_assistant.py --interactive
```

---

## 进阶：添加新技能

```python
# 在 skills_data.py 中添加
{
    "name": "marketing_analytics",
    "description": "Database schema for marketing campaigns, conversions, and ROI analysis.",
    "content": """
# Marketing Analytics Schema

## Tables
### campaigns: campaign_id, name, channel, budget, start_date, end_date
### conversions: conversion_id, campaign_id, user_id, conversion_type, revenue
### attribution: attribution_id, conversion_id, channel, touchpoint_order

## Business Logic
- ROI: (revenue - budget) / budget
- Conversion rate: conversions / impressions
"""
}
```

无需修改代理代码，自动发现和加载。

---

## 进阶：文件系统存储

```python
from pathlib import Path

def load_skill_from_fs(skill_name: str) -> str:
    """从文件系统加载技能。"""
    skill_path = Path("skills") / skill_name / "SKILL.md"
    if skill_path.exists():
        return f"Loaded skill: {skill_name}\n\n{skill_path.read_text()}"
    return f"Skill '{skill_name}' not found"
```

类似 DeepAgent 的文件系统技能，但手动实现。

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 代理不调用 load_skill | 描述不够明确 | 在系统提示词中强调 "Always load the relevant skill first" |
| 加载了错误的技能 | 描述太模糊 | 让 description 更具体地描述领域 |
| 上下文溢出 | 技能内容太大 | 精简 content 或使用分页加载 |
| 技能不生效 | Middleware 未注册 tools | 确保 `tools = [load_skill]` 在类变量中 |
| 重复加载同一技能 | 无状态追踪 | 使用 Command + CustomState 记录已加载 |
| 查询不符合业务逻辑 | 技能中缺少业务规则 | 在 content 中明确写出 Business Logic 部分 |
