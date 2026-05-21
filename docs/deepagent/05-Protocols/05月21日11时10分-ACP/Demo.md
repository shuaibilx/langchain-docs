# ACP - Demo

## Demo 1: 基础 ACP Agent 服务器

```python
import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

from deepagents_acp.server import AgentServerACP


async def main() -> None:
    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        system_prompt="You are a helpful coding assistant",
        checkpointer=MemorySaver(),
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```

## Demo 2: 带自定义工具的 ACP Agent

```python
import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import MemorySaver

from deepagents_acp.server import AgentServerACP


@tool
def search_docs(query: str) -> str:
    """Search project documentation for the given query."""
    # 实际实现中会搜索项目文档
    return f"Found 5 results for '{query}' in project docs."


@tool
def run_tests(path: str = ".") -> str:
    """Run tests in the specified directory."""
    import subprocess

    result = subprocess.run(
        ["pytest", path, "-v"],
        capture_output=True,
        text=True,
    )
    return result.stdout[-2000:] if result.stdout else result.stderr[-2000:]


async def main() -> None:
    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        system_prompt=(
            "You are a coding assistant. You can search docs and run tests. "
            "Always explain what you're doing before using tools."
        ),
        tools=[search_docs, run_tests],
        checkpointer=MemorySaver(),
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```

## Demo 3: 带 Subagent 的 ACP Agent

```python
import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

from deepagents_acp.server import AgentServerACP


async def main() -> None:
    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        system_prompt="You are a coding coordinator. Delegate tasks to specialists.",
        subagents=[
            {
                "name": "reviewer",
                "description": "Reviews code for bugs and style issues",
                "system_prompt": (
                    "You are a code reviewer. Check for bugs, "
                    "style issues, and suggest improvements."
                ),
            },
            {
                "name": "documenter",
                "description": "Writes documentation for code",
                "system_prompt": (
                    "You are a documentation writer. "
                    "Create clear, concise docs for the given code."
                ),
            },
        ],
        checkpointer=MemorySaver(),
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```

## Demo 4: Zed 配置（settings.json）

```json
{
  "agent_servers": {
    "DeepAgents": {
      "type": "custom",
      "command": "/home/user/deepagents/libs/acp/run_demo_agent.sh"
    }
  }
}
```

## Demo 5: run_demo_agent.sh 脚本

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 加载环境变量
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# 运行 ACP agent 服务器
exec uv run python -m examples.demo_agent
```

## Demo 6: demo_agent.py 完整示例

```python
"""Demo ACP coding agent with filesystem and shell tools."""

import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

from deepagents_acp.server import AgentServerACP


async def main() -> None:
    agent = create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        system_prompt=(
            "You are a helpful coding assistant. You can read, write, "
            "and execute code. Always explain your reasoning before "
            "making changes. When editing files, prefer small, focused changes."
        ),
        checkpointer=MemorySaver(),
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```

## Demo 7: Toad 本地开发

```bash
# 安装 Toad
uv tool install -U batrachian-toad

# 运行 ACP agent 服务器
toad acp "python my_agent.py" .

# 或使用 uv run
toad acp "uv run python my_agent.py" .
```

## Demo 8: .env 配置

```bash
# .env.example
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

```bash
# 复制并配置
cp .env.example .env
# 编辑 .env 设置你的 API key
```

## Demo 9: 带 Checkpointer 的持久化会话

```python
import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langgraph.checkpoint.sqlite import SqliteSaver

from deepagents_acp.server import AgentServerACP


async def main() -> None:
    # 使用 SQLite 持久化（比 MemorySaver 更持久）
    checkpointer = SqliteSaver.from_conn_string("checkpoints.db")

    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        system_prompt="You are a helpful coding assistant with persistent memory.",
        checkpointer=checkpointer,
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```

## Demo 10: 完整 ACP 应用

```python
"""Full ACP agent with tools, subagents, and persistent state."""

import asyncio

from acp import run_agent
from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph.checkpoint.sqlite import SqliteSaver

from deepagents_acp.server import AgentServerACP


@tool
def read_file(path: str) -> str:
    """Read the contents of a file."""
    with open(path, "r") as f:
        return f.read()


@tool
def list_directory(path: str = ".") -> str:
    """List files and directories."""
    import os

    entries = os.listdir(path)
    dirs = [e + "/" for e in entries if os.path.isdir(os.path.join(path, e))]
    files = [e for e in entries if os.path.isfile(os.path.join(path, e))]
    return "\n".join(sorted(dirs) + sorted(files))


async def main() -> None:
    checkpointer = SqliteSaver.from_conn_string("checkpoints.db")

    agent = create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        system_prompt=(
            "You are a senior coding assistant. You can:\n"
            "- Read and analyze code files\n"
            "- Review code for bugs and improvements\n"
            "- Write documentation\n"
            "Always explain your reasoning. Be thorough but concise."
        ),
        tools=[read_file, list_directory],
        subagents=[
            {
                "name": "reviewer",
                "description": "Reviews code for quality and bugs",
                "system_prompt": (
                    "You are a code reviewer. Focus on:\n"
                    "- Potential bugs\n"
                    "- Performance issues\n"
                    "- Code style\n"
                    "Be specific about line numbers and suggestions."
                ),
            },
        ],
        checkpointer=checkpointer,
    )

    server = AgentServerACP(agent)
    await run_agent(server)


if __name__ == "__main__":
    asyncio.run(main())
```
