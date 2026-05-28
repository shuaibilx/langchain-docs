# Router Knowledge Base — 实操 Demo

## 项目结构

```
router-knowledge-base/
├── router.py             # 路由器工作流
├── conversational.py     # 有状态对话版本
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
pydantic
```

### 环境变量

```bash
export OPENAI_API_KEY="sk-..."
```

---

## Step 2: 路由器工作流

### router.py

```python
"""Multi-Source Knowledge Router — 路由器模式多代理系统

三阶段：Classify → Route (并行) → Synthesize
"""

import operator
from typing import Annotated, Literal, TypedDict

from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from pydantic import BaseModel, Field


# ============================================================
# 1. 状态定义
# ============================================================

class AgentInput(TypedDict):
    query: str

class AgentOutput(TypedDict):
    source: str
    result: str

class Classification(TypedDict):
    source: Literal["github", "notion", "slack"]
    query: str

class RouterState(TypedDict):
    query: str
    classifications: list[Classification]
    results: Annotated[list[AgentOutput], operator.add]  # Reducer
    final_answer: str

class ClassificationResult(BaseModel):
    classifications: list[Classification] = Field(
        description="List of agents to invoke with their targeted sub-questions"
    )


# ============================================================
# 2. 工具定义（Stub）
# ============================================================

@tool
def search_code(query: str, repo: str = "main") -> str:
    """Search code in GitHub repositories."""
    return f"Found code matching '{query}' in {repo}: authentication middleware in src/auth.py"

@tool
def search_issues(query: str) -> str:
    """Search GitHub issues and pull requests."""
    return f"Found 3 issues matching '{query}': #142 (API auth docs), #89 (OAuth flow), #203 (token refresh)"

@tool
def search_prs(query: str) -> str:
    """Search pull requests for implementation details."""
    return f"PR #156 added JWT authentication, PR #178 updated OAuth scopes"

@tool
def search_notion(query: str) -> str:
    """Search Notion workspace for documentation."""
    return f"Found documentation: 'API Authentication Guide' - covers OAuth2 flow, API keys, and JWT tokens"

@tool
def get_page(page_id: str) -> str:
    """Get a specific Notion page by ID."""
    return f"Page content: Step-by-step authentication setup instructions"

@tool
def search_slack(query: str) -> str:
    """Search Slack messages and threads."""
    return f"Found discussion in #engineering: 'Use Bearer tokens for API auth, see docs for refresh flow'"

@tool
def get_thread(thread_id: str) -> str:
    """Get a specific Slack thread."""
    return f"Thread discusses best practices for API key rotation"


# ============================================================
# 3. 创建专门代理
# ============================================================

model = init_chat_model("gpt-4o-mini")
router_llm = init_chat_model("gpt-4o-mini")

github_agent = create_agent(
    model,
    tools=[search_code, search_issues, search_prs],
    system_prompt=(
        "You are a GitHub expert. Answer questions about code, "
        "API references, and implementation details by searching "
        "repositories, issues, and pull requests. Be concise."
    ),
)

notion_agent = create_agent(
    model,
    tools=[search_notion, get_page],
    system_prompt=(
        "You are a Notion expert. Answer questions about internal "
        "processes, policies, and team documentation. Be concise."
    ),
)

slack_agent = create_agent(
    model,
    tools=[search_slack, get_thread],
    system_prompt=(
        "You are a Slack expert. Answer questions by searching "
        "relevant threads and discussions. Be concise."
    ),
)


# ============================================================
# 4. 工作流节点
# ============================================================

def classify_query(state: RouterState) -> dict:
    """分类查询，决定调用哪些代理。"""
    structured_llm = router_llm.with_structured_output(ClassificationResult)
    result = structured_llm.invoke([
        {
            "role": "system",
            "content": """Analyze this query and determine which knowledge bases to consult.
For each relevant source, generate a targeted sub-question optimized for that source.

Available sources:
- github: Code, API references, implementation details, issues, pull requests
- notion: Internal documentation, processes, policies, team wikis
- slack: Team discussions, informal knowledge sharing, recent conversations

Return ONLY the sources that are relevant to the query."""
        },
        {"role": "user", "content": state["query"]}
    ])
    return {"classifications": result.classifications}


def route_to_agents(state: RouterState) -> list[Send]:
    """并行分发到选定的代理。"""
    return [Send(c["source"], {"query": c["query"]}) for c in state["classifications"]]


def query_github(state: AgentInput) -> dict:
    result = github_agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"results": [{"source": "github", "result": result["messages"][-1].content}]}


def query_notion(state: AgentInput) -> dict:
    result = notion_agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"results": [{"source": "notion", "result": result["messages"][-1].content}]}


def query_slack(state: AgentInput) -> dict:
    result = slack_agent.invoke({"messages": [{"role": "user", "content": state["query"]}]})
    return {"results": [{"source": "slack", "result": result["messages"][-1].content}]}


def synthesize_results(state: RouterState) -> dict:
    """综合多源结果为连贯回答。"""
    if not state["results"]:
        return {"final_answer": "No results found from any knowledge source."}

    formatted = [f"**From {r['source'].title()}:**\n{r['result']}" for r in state["results"]]
    response = router_llm.invoke([
        {
            "role": "system",
            "content": f"""Synthesize these search results to answer: "{state['query']}"
- Combine information without redundancy
- Highlight the most relevant and actionable information
- Note any discrepancies between sources
- Keep the response concise"""
        },
        {"role": "user", "content": "\n\n".join(formatted)}
    ])
    return {"final_answer": response.content}


# ============================================================
# 5. 编译工作流
# ============================================================

workflow = (
    StateGraph(RouterState)
    .add_node("classify", classify_query)
    .add_node("github", query_github)
    .add_node("notion", query_notion)
    .add_node("slack", query_slack)
    .add_node("synthesize", synthesize_results)
    .add_edge(START, "classify")
    .add_conditional_edges("classify", route_to_agents, ["github", "notion", "slack"])
    .add_edge("github", "synthesize")
    .add_edge("notion", "synthesize")
    .add_edge("slack", "synthesize")
    .add_edge("synthesize", END)
    .compile()
)


# ============================================================
# 6. 运行
# ============================================================

if __name__ == "__main__":
    queries = [
        "How do I authenticate API requests?",
        "What's our deployment process?",
        "How do I set up the dev environment?",
    ]

    for q in queries:
        print(f"\n{'='*60}")
        print(f"Q: {q}")
        print(f"{'='*60}")

        result = workflow.invoke({"query": q})

        print(f"\nClassifications:")
        for c in result["classifications"]:
            print(f"  {c['source']}: {c['query']}")

        print(f"\nAnswer:\n{result['final_answer']}")
```

---

## Step 3: 有状态对话版本

### conversational.py

```python
"""有状态对话路由器 — 包装无状态路由器为工具"""

from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from router import workflow


@tool
def search_knowledge_base(query: str) -> str:
    """Search across multiple knowledge sources (GitHub, Notion, Slack).

    Use this to find information about code, documentation, or team discussions.

    Args:
        query: The search query
    """
    result = workflow.invoke({"query": query})
    return result["final_answer"]


def create_conversational_agent():
    model = init_chat_model("gpt-4o-mini")

    return create_agent(
        model,
        tools=[search_knowledge_base],
        system_prompt=(
            "You are a helpful assistant that answers questions about our organization. "
            "Use the search_knowledge_base tool to find information across our code, "
            "documentation, and team discussions. "
            "Remember context from previous messages in the conversation."
        ),
        checkpointer=InMemorySaver(),
    )


if __name__ == "__main__":
    agent = create_conversational_agent()
    config = {"configurable": {"thread_id": "demo-user"}}

    conversations = [
        "How do I authenticate API requests?",
        "What about rate limiting for those endpoints?",
        "And what's the error handling strategy?",
    ]

    for msg in conversations:
        print(f"\n{'='*40}")
        print(f"User: {msg}")

        result = agent.invoke(
            {"messages": [{"role": "user", "content": msg}]},
            config,
        )
        print(f"\nAgent: {result['messages'][-1].content}")
```

---

## Step 4: 运行

```bash
# 无状态路由器
python router.py

# 有状态对话版本
python conversational.py
```

---

## 进阶：添加新的垂直领域

```python
# 添加 Jira 代理
@tool
def search_jira(query: str) -> str:
    """Search Jira issues and epics."""
    return f"Found: PROJ-123 - {query}"

jira_agent = create_agent(model, tools=[search_jira], ...)

# 更新分类器的可用源
# "... - jira: Project management, issues, sprints, epics"

# 添加到工作流
workflow.add_node("jira", query_jira)
workflow.add_conditional_edges("classify", route_to_agents, ["github", "notion", "slack", "jira"])
workflow.add_edge("jira", "synthesize")
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 分类结果不准确 | 提示词不够明确 | 在分类提示词中给出更多示例 |
| 并行不生效 | Send API 使用错误 | 确保 `route_to_agents` 返回 `list[Send]` |
| 结果列表为空 | Reducer 未配置 | 确保 `Annotated[list, operator.add]` |
| 综合结果有冗余 | 提示词不够强 | 在综合提示词中强调 "without redundancy" |
| 模型不支持结构化输出 | 模型太旧 | 用支持 function calling 的模型 |
| 对话版本无记忆 | 缺少 checkpointer | 确保有 `InMemorySaver()` |
