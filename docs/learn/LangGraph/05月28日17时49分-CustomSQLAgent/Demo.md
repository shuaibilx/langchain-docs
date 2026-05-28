# Custom SQL Agent with LangGraph — 实操 Demo

## 项目结构

```
custom-sql-agent/
├── sql_agent.py          # 基础版
├── sql_agent_hitl.py     # 人在回路版
├── requirements.txt
└── data/ (Chinook.db 自动下载)
```

---

## Step 1: 环境准备

### requirements.txt

```txt
langchain
langchain-openai
langgraph
```

---

## Step 2: 完整实现

### sql_agent.py

```python
"""Custom SQL Agent with LangGraph — 强制执行顺序

图结构:
START → list_tables → call_get_schema → get_schema → generate_query
                                                    ├── check_query → run_query → generate_query (循环)
                                                    └── END
"""

import pathlib
import requests
import sqlite3
from typing import Literal

from langchain.chat_models import init_chat_model
from langchain.messages import AIMessage
from langchain.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode


# ============================================================
# 1. 数据库设置
# ============================================================

def download_database():
    url = "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db"
    local_path = pathlib.Path("Chinook.db")
    if not local_path.exists():
        local_path.write_bytes(requests.get(url).content)
        print(f"Downloaded {local_path}")


# ============================================================
# 2. 工具定义
# ============================================================

@tool
def sql_db_list_tables() -> str:
    """List all tables in the database."""
    con = sqlite3.connect("Chinook.db")
    try:
        cursor = con.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cursor.fetchall() if not r[0].startswith("sqlite_")]
        return ", ".join(tables)
    finally:
        con.close()


@tool
def sql_db_schema(table_names: str) -> str:
    """Get schema and sample rows for specified tables.

    Args:
        table_names: Comma-separated list of table names
    """
    con = sqlite3.connect("Chinook.db")
    try:
        cursor = con.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        valid_tables = {r[0] for r in cursor.fetchall() if not r[0].startswith("sqlite_")}
        results = []
        for table in table_names.split(","):
            table = table.strip()
            if table not in valid_tables:
                results.append(f"Error: table '{table}' not found")
                continue
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?;", (table,))
            schema_row = cursor.fetchone()
            if schema_row:
                results.append(schema_row[0])
                try:
                    cursor.execute(f'SELECT * FROM "{table}" LIMIT 3;')
                    rows = cursor.fetchall()
                    if rows:
                        cols = [d[0] for d in cursor.description]
                        results.append(f"/*\n3 rows:\n" + "\t".join(cols) + "\n" + "\n".join("\t".join(str(x) for x in r) for r in rows) + "\n*/")
                except Exception as e:
                    results.append(f"Error: {e}")
        return "\n\n".join(results)
    finally:
        con.close()


@tool
def sql_db_query(query: str) -> str:
    """Execute a SQL query.

    Args:
        query: A valid SQL query
    """
    con = sqlite3.connect("Chinook.db")
    try:
        cursor = con.cursor()
        cursor.execute(query)
        return str(cursor.fetchall())
    except Exception as e:
        return f"Error: {e}"
    finally:
        con.close()


# ============================================================
# 3. 图节点
# ============================================================

def create_sql_agent(model_name: str = "gpt-4o-mini"):
    model = init_chat_model(model_name)

    # 工具节点
    get_schema_tool = next(t for t in [sql_db_schema] if t.name == "sql_db_schema")
    get_schema_node = ToolNode([get_schema_tool], name="get_schema")
    run_query_tool = next(t for t in [sql_db_query] if t.name == "sql_db_query")
    run_query_node = ToolNode([run_query_tool], name="run_query")

    # --- list_tables (强制执行) ---
    def list_tables(state: MessagesState):
        tool_call = {"name": "sql_db_list_tables", "args": {}, "id": "abc123", "type": "tool_call"}
        tool_call_msg = AIMessage(content="", tool_calls=[tool_call])
        tool_msg = sql_db_list_tables.invoke(tool_call)
        response = AIMessage(f"Available tables: {tool_msg.content}")
        return {"messages": [tool_call_msg, tool_msg, response]}

    # --- call_get_schema (强制工具调用) ---
    def call_get_schema(state: MessagesState):
        llm = model.bind_tools([get_schema_tool], tool_choice="any")
        response = llm.invoke(state["messages"])
        return {"messages": [response]}

    # --- generate_query (LLM 自主决定) ---
    SYSTEM_PROMPT = (
        "You are an agent designed to interact with a SQL database. "
        "Given an input question, create a syntactically correct sqlite query to run, "
        "then look at the results and return the answer. "
        "Always limit your query to at most 5 results. "
        "DO NOT make any DML statements."
    )

    def generate_query(state: MessagesState):
        system_msg = {"role": "system", "content": SYSTEM_PROMPT}
        llm = model.bind_tools([run_query_tool])
        response = llm.invoke([system_msg] + state["messages"])
        return {"messages": [response]}

    # --- check_query (强制检查) ---
    CHECK_PROMPT = (
        "You are a SQL expert. Double check the sqlite query for common mistakes:\n"
        "- NOT IN with NULL\n- UNION vs UNION ALL\n- BETWEEN ranges\n"
        "- Data type mismatch\n- Proper quoting\n\n"
        "If there are mistakes, rewrite the query. If no mistakes, reproduce the original.\n"
        "You MUST call the sql_db_query tool to execute the checked query."
    )

    def check_query(state: MessagesState):
        system_msg = {"role": "system", "content": CHECK_PROMPT}
        tool_call = state["messages"][-1].tool_calls[0]
        user_msg = {"role": "user", "content": tool_call["args"]["query"]}
        llm = model.bind_tools([run_query_tool], tool_choice="any")
        response = llm.invoke([system_msg, user_msg])
        response.id = state["messages"][-1].id
        return {"messages": [response]}

    # --- should_continue ---
    def should_continue(state: MessagesState) -> Literal[END, "check_query"]:
        if not state["messages"][-1].tool_calls:
            return END
        return "check_query"

    # ============================================================
    # 4. 组装图
    # ============================================================

    builder = StateGraph(MessagesState)
    builder.add_node(list_tables)
    builder.add_node(call_get_schema)
    builder.add_node(get_schema_node, "get_schema")
    builder.add_node(generate_query)
    builder.add_node(check_query)
    builder.add_node(run_query_node, "run_query")

    builder.add_edge(START, "list_tables")
    builder.add_edge("list_tables", "call_get_schema")
    builder.add_edge("call_get_schema", "get_schema")
    builder.add_edge("get_schema", "generate_query")
    builder.add_conditional_edges("generate_query", should_continue)
    builder.add_edge("check_query", "run_query")
    builder.add_edge("run_query", "generate_query")

    return builder.compile()


# ============================================================
# 5. 运行
# ============================================================

if __name__ == "__main__":
    download_database()
    agent = create_sql_agent()

    question = "Which genre on average has the longest tracks?"
    print(f"Q: {question}\n")

    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        stream_mode="values",
    ):
        step["messages"][-1].pretty_print()
```

---

## Step 3: 人在回路版

### sql_agent_hitl.py

```python
"""带 human-in-the-loop 的版本"""

from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver
from sql_agent import *

# 重写 run_query 工具，添加 interrupt
@tool(
    sql_db_query.name,
    description=sql_db_query.description,
    args_schema=sql_db_query.args_schema,
)
def run_query_with_interrupt(config, **tool_input):
    """Execute SQL with human review."""
    request = {"action": "sql_db_query", "args": tool_input, "description": "Please review"}
    response = interrupt([request])

    if response["type"] == "accept":
        return sql_db_query.invoke(tool_input, config)
    elif response["type"] == "edit":
        return sql_db_query.invoke(response["args"]["args"], config)
    elif response["type"] == "response":
        return response["args"]
    else:
        raise ValueError(f"Unknown type: {response['type']}")


# 重新构建图
def create_sql_agent_hitl(model_name="gpt-4o-mini"):
    model = init_chat_model(model_name)

    run_query_node = ToolNode([run_query_with_interrupt], name="run_query")
    get_schema_tool = sql_db_schema
    get_schema_node = ToolNode([get_schema_tool], name="get_schema")

    # ... (与 sql_agent.py 相同的节点定义，但用 run_query_with_interrupt)

    builder = StateGraph(MessagesState)
    builder.add_node(list_tables)
    builder.add_node(call_get_schema)
    builder.add_node(get_schema_node, "get_schema")
    builder.add_node(generate_query)
    builder.add_node(run_query_node, "run_query")

    builder.add_edge(START, "list_tables")
    builder.add_edge("list_tables", "call_get_schema")
    builder.add_edge("call_get_schema", "get_schema")
    builder.add_edge("get_schema", "generate_query")
    builder.add_conditional_edges("generate_query", should_continue)
    builder.add_edge("run_query", "generate_query")

    checkpointer = InMemorySaver()
    return builder.compile(checkpointer=checkpointer)


if __name__ == "__main__":
    download_database()
    agent = create_sql_agent_hitl()
    config = {"configurable": {"thread_id": "1"}}

    question = "Which genre on average has the longest tracks?"

    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        config,
        stream_mode="values",
    ):
        if "messages" in step:
            step["messages"][-1].pretty_print()
        elif "__interrupt__" in step:
            import json
            action = step["__interrupt__"][0]
            print("INTERRUPTED:")
            for req in action.value:
                print(json.dumps(req, indent=2))

    # 批准
    for step in agent.stream(Command(resume={"type": "accept"}), config, stream_mode="values"):
        if "messages" in step:
            step["messages"][-1].pretty_print()
```

---

## 运行

```bash
# 基础版
python sql_agent.py

# 人在回路版
python sql_agent_hitl.py
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| list_tables 不执行 | 函数实现错误 | 确保直接构造 AIMessage |
| get_schema 不触发 | tool_choice 设置错误 | 确保 `tool_choice="any"` |
| 查询错误不重试 | generate_query → check_query 边未连接 | 检查 should_continue 返回值 |
| interrupt 不生效 | 缺少 checkpointer | 确保 `compile(checkpointer=...)` |
| 无限循环 | run_query → generate_query 一直有 tool_calls | 加最大轮次限制 |
