# SQL Agent — 实操 Demo

## 项目结构

```
sql-agent/
├── sql_agent.py          # 基础 SQL Agent
├── sql_agent_hitl.py     # 带 Human-in-the-loop 的版本
├── tools.py              # 数据库工具
├── requirements.txt
└── data/
    └── (Chinook.db 自动下载)
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

## Step 2: 数据库工具

### tools.py

```python
"""SQL 数据库工具 — 4 个工具供代理使用"""

import sqlite3
from langchain.tools import tool

DB_PATH = "Chinook.db"


def get_connection():
    return sqlite3.connect(DB_PATH)


@tool
def sql_db_list_tables() -> str:
    """List all tables in the database. Input is empty string, output is comma-separated table names."""
    con = get_connection()
    try:
        cursor = con.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall() if not row[0].startswith("sqlite_")]
        return ", ".join(tables)
    finally:
        con.close()


@tool
def sql_db_schema(table_names: str) -> str:
    """Get schema and sample rows for specified tables.

    Args:
        table_names: Comma-separated list of table names (e.g., "Track, Genre")
    """
    con = get_connection()
    try:
        cursor = con.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        valid_tables = {row[0] for row in cursor.fetchall() if not row[0].startswith("sqlite_")}

        results = []
        for table in table_names.split(","):
            table = table.strip()
            if table not in valid_tables:
                results.append(f"Error: table '{table}' not found in database")
                continue

            # 获取 CREATE TABLE 语句
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?;", (table,))
            schema_row = cursor.fetchone()
            if schema_row:
                results.append(schema_row[0])

            # 获取 3 行示例数据
            try:
                quoted_table = '"' + table.replace('"', '""') + '"'
                cursor.execute(f"SELECT * FROM {quoted_table} LIMIT 3;")
                rows = cursor.fetchall()
                if rows:
                    col_names = [desc[0] for desc in cursor.description]
                    header = "\t".join(col_names)
                    data = "\n".join("\t".join(str(x) for x in row) for row in rows)
                    results.append(f"/*\n3 rows from {table}:\n{header}\n{data}\n*/")
            except Exception as e:
                results.append(f"Error fetching sample rows: {e}")

        return "\n\n".join(results)
    finally:
        con.close()


@tool
def sql_db_query(query: str) -> str:
    """Execute a SQL query and return results.

    Args:
        query: A valid SQL SELECT query
    """
    con = get_connection()
    try:
        cursor = con.cursor()
        cursor.execute(query)
        res = cursor.fetchall()
        return str(res)
    except Exception as e:
        return f"Error: {e}"
    finally:
        con.close()


@tool
def sql_db_query_checker(query: str) -> str:
    """Double check a SQL query for common mistakes before executing.

    Args:
        query: The SQL query to check
    """
    # 简化版：用规则检查（不依赖 LLM）
    warnings = []

    query_upper = query.upper()

    if "NOT IN" in query_upper and "SELECT" in query_upper:
        warnings.append("Warning: NOT IN with subquery may not handle NULLs correctly")

    if " UNION " in query_upper and " UNION ALL " not in query_upper:
        warnings.append("Warning: Consider if UNION ALL is more appropriate")

    if "SELECT *" in query_upper:
        warnings.append("Warning: Consider selecting only needed columns")

    if "DELETE" in query_upper or "DROP" in query_upper or "UPDATE" in query_upper:
        return "ERROR: DML statements are not allowed"

    if warnings:
        return f"Query passed with warnings:\n" + "\n".join(warnings)
    return "Query looks good."


# 导出工具列表
tools = [sql_db_list_tables, sql_db_schema, sql_db_query, sql_db_query_checker]
```

---

## Step 3: 基础 SQL Agent

### sql_agent.py

```python
"""基础 SQL Agent — 无 Human-in-the-loop"""

import pathlib
import requests
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from tools import tools


def download_database():
    """下载 Chinook 示例数据库。"""
    url = "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db"
    local_path = pathlib.Path("Chinook.db")

    if local_path.exists():
        print(f"{local_path} already exists, skipping download.")
    else:
        print(f"Downloading Chinook.db...")
        response = requests.get(url)
        if response.status_code == 200:
            local_path.write_bytes(response.content)
            print(f"Downloaded and saved as {local_path}")
        else:
            raise RuntimeError(f"Failed to download. Status code: {response.status_code}")


def create_sql_agent():
    """创建 SQL Agent。"""
    model = init_chat_model("gpt-4o-mini")

    system_prompt = """You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct sqlite query to run,
then look at the results of the query and return the answer.

Always limit your query to at most 5 results.
You can order the results by a relevant column to return the most interesting examples.

You MUST double check your query before executing it.
If you get an error, rewrite the query and try again.

DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.).

To start you should ALWAYS look at the tables in the database to see what you can query.
Then you should query the schema of the most relevant tables."""

    agent = create_agent(model, tools, system_prompt=system_prompt)
    return agent


def run_query(agent, question: str):
    """运行查询并打印结果。"""
    print(f"\n{'='*60}")
    print(f"Q: {question}")
    print(f"{'='*60}\n")

    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        stream_mode="values",
    ):
        step["messages"][-1].pretty_print()


def main():
    download_database()
    agent = create_sql_agent()

    # 测试查询
    questions = [
        "Which genre on average has the longest tracks?",
        "Who are the top 5 customers by total spending?",
        "How many albums does each artist have? Show top 5.",
    ]

    for q in questions:
        run_query(agent, q)


if __name__ == "__main__":
    main()
```

---

## Step 4: Human-in-the-loop 版本

### sql_agent_hitl.py

```python
"""SQL Agent with Human-in-the-loop — 执行前需人工审批"""

import pathlib
import requests
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from tools import tools


def download_database():
    url = "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db"
    local_path = pathlib.Path("Chinook.db")
    if not local_path.exists():
        response = requests.get(url)
        local_path.write_bytes(response.content)
        print(f"Downloaded {local_path}")


def create_sql_agent_hitl():
    """创建带 Human-in-the-loop 的 SQL Agent。"""
    model = init_chat_model("gpt-4o-mini")

    system_prompt = """You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct sqlite query to run.
Always limit your query to at most 5 results.
You MUST double check your query before executing it.
DO NOT make any DML statements.
To start you should ALWAYS look at the tables in the database."""

    agent = create_agent(
        model,
        tools,
        system_prompt=system_prompt,
        middleware=[
            HumanInTheLoopMiddleware(
                interrupt_on={"sql_db_query": True},  # 只拦截 sql_db_query
                description_prefix="SQL query pending approval",
            ),
        ],
        checkpointer=InMemorySaver(),
    )
    return agent


def run_with_approval(agent, question: str, thread_id: str = "1"):
    """运行查询，执行前需要人工审批。"""
    config = {"configurable": {"thread_id": thread_id}}

    print(f"\n{'='*60}")
    print(f"Q: {question}")
    print(f"{'='*60}\n")

    # 第一轮：运行到中断
    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        config,
        stream_mode="values",
    ):
        if "__interrupt__" in step:
            print("\n⏸️  INTERRUPTED — SQL query needs approval:")
            print("-" * 40)
            interrupt = step["__interrupt__"][0]
            for request in interrupt.value["action_requests"]:
                print(f"Tool: {request.get('tool', 'unknown')}")
                print(f"Args: {request.get('args', {})}")
            print("-" * 40)

            # 自动批准（实际应用中可等待用户输入）
            print("✅ Auto-approving...")
        elif "messages" in step:
            step["messages"][-1].pretty_print()

    # 第二轮：批准后继续执行
    print("\n▶️  Resuming with approval...\n")
    for step in agent.stream(
        Command(resume={"decisions": [{"type": "approve"}]}),
        config,
        stream_mode="values",
    ):
        if "messages" in step:
            step["messages"][-1].pretty_print()


def main():
    download_database()
    agent = create_sql_agent_hitl()

    questions = [
        "Which genre on average has the longest tracks?",
        "Who are the top 3 customers by total spending?",
    ]

    for i, q in enumerate(questions):
        run_with_approval(agent, q, thread_id=str(i))


if __name__ == "__main__":
    main()
```

---

## Step 5: 运行

```bash
# 基础版 — 自动执行
python sql_agent.py

# Human-in-the-loop 版 — 执行前审批
python sql_agent_hitl.py
```

---

## 进阶：支持多种数据库

```python
"""支持 SQLite / PostgreSQL / MySQL 的工具工厂"""

def create_sql_tools(db_type: str, connection_string: str):
    """根据数据库类型创建工具。"""
    if db_type == "sqlite":
        import sqlite3
        def get_conn():
            return sqlite3.connect(connection_string)
    elif db_type == "postgresql":
        import psycopg2
        def get_conn():
            return psycopg2.connect(connection_string)
    elif db_type == "mysql":
        import mysql.connector
        def get_conn():
            return mysql.connector.connect(connection_string)

    @tool
    def sql_db_query(query: str) -> str:
        """Execute a SQL query."""
        con = get_conn()
        try:
            cursor = con.cursor()
            cursor.execute(query)
            return str(cursor.fetchall())
        finally:
            con.close()

    return [sql_db_query, ...]
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Chinook.db 下载失败 | 网络问题 | 手动下载或用本地 SQLite |
| SQL 语法错误 | 代理生成了错误 SQL | query_checker 会自动重试 |
| 查询结果为空 | 表名或列名错误 | 先调用 sql_db_schema 确认 |
| DML 语句执行 | 提示词不够强 | 加强 system_prompt 约束 |
| Human-in-the-loop 不生效 | 缺少 checkpointer | 确保传入 InMemorySaver |
| 中断后无法恢复 | thread_id 不一致 | 确保 config 中 thread_id 正确 |
