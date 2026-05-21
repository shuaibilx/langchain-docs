# Skills - Demo

## Demo 1: 基础 Skill 目录结构

```plaintext
skills/
├── langgraph-docs
│   └── SKILL.md
└── arxiv_search
    ├── SKILL.md
    └── arxiv_search.py
```

## Demo 2: SKILL.md 基础模板

````md
---
name: langgraph-docs
description: Use this skill for requests related to LangGraph in order to fetch relevant documentation to provide accurate, up-to-date guidance.
---

# langgraph-docs

## Overview

This skill explains how to access LangGraph Python documentation.

## Instructions

### 1. Fetch the Documentation Index

Use the fetch_url tool to read: https://docs.langchain.com/llms.txt

### 2. Select Relevant Documentation

Identify 2-4 most relevant URLs from the index.

### 3. Fetch Selected Documentation

Use the fetch_url tool to read the selected URLs.

### 4. Provide accurate guidance

Answer the user's question using the fetched docs.
````

## Demo 3: SKILL.md 完整 Frontmatter

````md
---
name: langgraph-docs
description: Use this skill for requests related to LangGraph.
license: MIT
compatibility: Requires internet access
metadata:
  author: langchain
  version: "1.0"
allowed-tools: fetch_url
module: index.ts
---

# langgraph-docs

...
````

## Demo 4: StateBackend + Skills

```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.backends.utils import create_file_data
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
backend = StateBackend()

skill_url = "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/libs/cli/examples/skills/langgraph-docs/SKILL.md"
with urlopen(skill_url) as response:
    skill_content = response.read().decode('utf-8')

skills_files = {
    "/skills/langgraph-docs/SKILL.md": create_file_data(skill_content),
}

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    skills=["/skills/"],
    checkpointer=checkpointer,
)

result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "What is langgraph?"}],
        "files": skills_files,
    },
    config={"configurable": {"thread_id": "12345"}},
)
```

## Demo 5: StoreBackend + Skills

```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from deepagents.backends.utils import create_file_data
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
backend = StoreBackend(namespace=lambda _rt: ("filesystem",))

skill_url = "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/libs/cli/examples/skills/langgraph-docs/SKILL.md"
with urlopen(skill_url) as response:
    skill_content = response.read().decode('utf-8')

store.put(
    namespace=("filesystem",),
    key="/skills/langgraph-docs/SKILL.md",
    value=create_file_data(skill_content),
)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    store=store,
    skills=["/skills/"],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is langgraph?"}]},
    config={"configurable": {"thread_id": "12345"}},
)
```

## Demo 6: FilesystemBackend + Skills

```python
from pathlib import Path
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
root_dir = "/Users/user/myproject"
backend = FilesystemBackend(root_dir=root_dir)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    skills=[str(Path(root_dir) / "skills")],
    checkpointer=checkpointer,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is langgraph?"}]},
    config={"configurable": {"thread_id": "12345"}},
)
```

## Demo 7: 源优先级（最后获胜）

```python
# 如果两个源都有 "web-search" skill，
# /skills/project/ 的获胜（最后加载）
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    skills=["/skills/user/", "/skills/project/"],
    ...
)
```

## Demo 8: Subagent Skills 配置

```python
from deepagents import create_deep_agent

research_subagent = {
    "name": "researcher",
    "description": "Research assistant with specialized skills",
    "system_prompt": "You are a researcher.",
    "tools": [web_search],
    "skills": ["/skills/research/", "/skills/web-search/"],  # Subagent 专属
}

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    skills=["/skills/main/"],  # 主代理和 GP subagent 获得
    subagents=[research_subagent],  # Researcher 只获得自己的
)
```

## Demo 9: Interpreter Skill

````md
---
name: order-helpers
description: Helper functions for normalizing and grouping order records.
module: index.ts
---

# order-helpers

Use this skill when order records need deterministic cleanup or aggregation.

Import these utilities into the REPL:

```typescript
const { groupByStatus } = await import("@/skills/order-helpers");
groupByStatus(...);
```
````

```typescript
// skills/order-helpers/index.ts
interface Order {
  id: string;
  status: string;
}

export function groupByStatus(orders: Order[]) {
  return orders.reduce((acc, order) => {
    acc[order.status] = acc[order.status] ?? [];
    acc[order.status].push(order);
    return acc;
  }, {});
}
```

```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain_quickjs import CodeInterpreterMiddleware

backend = StateBackend()

agent = create_deep_agent(
    model="openai:gpt-5.4",
    backend=backend,
    skills=["/skills/"],
    middleware=[CodeInterpreterMiddleware(skills_backend=backend)],
)
```

## Demo 10: 沙箱中执行 Skill 脚本

```python
import asyncio
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from langchain.agents.middleware import AgentMiddleware, AgentState
from langgraph.runtime import Runtime
from langgraph.store.memory import InMemoryStore

SKILLS_SHARED_NAMESPACE = ("skills", "builtin")


class SkillSandboxSyncMiddleware(AgentMiddleware[AgentState, Any, Any]):
    """每次代理运行前从 store 复制 skill 文件到沙箱。"""

    def __init__(self, backend: CompositeBackend) -> None:
        super().__init__()
        self.backend = backend

    async def abefore_agent(self, state: AgentState, runtime: Runtime[Any]) -> None:
        store = runtime.store
        files = []
        for item in await store.asearch(SKILLS_SHARED_NAMESPACE):
            key = str(item.key)
            normalized = key if key.startswith("/") else f"/{key}"
            files.append((f"/skills{normalized}", item.value["content"].encode()))
        if files:
            await self.backend.aupload_files(files)


async def main() -> None:
    store = InMemoryStore()

    # 种子 skills
    skills_dir = Path("skills")
    for file_path in skills_dir.rglob("*"):
        if file_path.is_file():
            rel = file_path.relative_to(skills_dir).as_posix()
            await store.aput(
                SKILLS_SHARED_NAMESPACE,
                f"/{rel}",
                create_file_data(file_path.read_text()),
            )

    sandbox_backend = DaytonaSandbox(sandbox=Daytona().create())
    backend = CompositeBackend(
        default=sandbox_backend,
        routes={"/skills/": StoreBackend(namespace=lambda _rt: SKILLS_SHARED_NAMESPACE)},
    )

    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        backend=backend,
        skills=["/skills/"],
        store=store,
        middleware=[SkillSandboxSyncMiddleware(backend)],
    )
```

## Demo 11: 完整 Skills 应用

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    memory=["/memories/AGENTS.md"],
    skills=["/skills/"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
            "/skills/": StoreBackend(
                namespace=lambda rt: (rt.server_info.assistant_id,),
            ),
        },
    ),
    checkpointer=checkpointer,
    system_prompt="You are a helpful assistant. Use skills when relevant.",
    subagents=[{
        "name": "researcher",
        "description": "Research assistant",
        "system_prompt": "You are a researcher.",
        "skills": ["/skills/research/"],
    }],
)

# 代理启动时：
# 1. 读取 /memories/AGENTS.md（始终加载）
# 2. 读取 /skills/*/SKILL.md 的 frontmatter（渐进式披露）
# 3. 用户提问时，检查 skill 描述是否匹配
# 4. 匹配则加载完整 SKILL.md
```
