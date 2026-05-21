# Sandboxes - Demo

## Demo 1: Daytona 沙箱基础

```python
from daytona import Daytona
from deepagents import create_deep_agent
from langchain_anthropic import ChatAnthropic
from langchain_daytona import DaytonaSandbox

sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

agent = create_deep_agent(
    model=ChatAnthropic(model="claude-sonnet-4-6"),
    system_prompt="You are a Python coding assistant with sandbox access.",
    backend=backend,
)

try:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Create a small Python package and run pytest"}]}
    )
finally:
    sandbox.stop()
```

## Demo 2: Modal 沙箱

```python
import modal
from deepagents import create_deep_agent
from langchain_anthropic import ChatAnthropic
from langchain_modal import ModalSandbox

app = modal.App.lookup("your-app")
modal_sandbox = modal.Sandbox.create(app=app)
backend = ModalSandbox(sandbox=modal_sandbox)

agent = create_deep_agent(
    model=ChatAnthropic(model="claude-sonnet-4-6"),
    system_prompt="You are a Python coding assistant with sandbox access.",
    backend=backend,
)

try:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Create a hello world Python script and run it"}]}
    )
finally:
    modal_sandbox.terminate()
```

## Demo 3: Runloop 沙箱

```python
import os
from deepagents import create_deep_agent
from langchain_anthropic import ChatAnthropic
from langchain_runloop import RunloopSandbox
from runloop_api_client import RunloopSDK

client = RunloopSDK(bearer_token=os.environ["RUNLOOP_API_KEY"])
devbox = client.devbox.create()
backend = RunloopSandbox(devbox=devbox)

agent = create_deep_agent(
    model=ChatAnthropic(model="claude-sonnet-4-6"),
    system_prompt="You are a Python coding assistant with sandbox access.",
    backend=backend,
)

try:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Create a small Python package and run pytest"}]}
    )
finally:
    devbox.shutdown()
```

## Demo 4: 直接调用 execute()

```python
from daytona import Daytona
from langchain_daytona import DaytonaSandbox

sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

try:
    result = backend.execute("python --version")
    print(result.output)  # "Python 3.11.x"

    result = backend.execute("pip list")
    print(result.output)

    result = backend.execute("echo 'hello world'")
    print(result.output)  # "hello world"
finally:
    sandbox.stop()
```

## Demo 5: 种子沙箱（上传文件）

```python
from daytona import Daytona
from langchain_daytona import DaytonaSandbox

sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

# 在代理运行前上传文件
backend.upload_files(
    [
        ("/src/index.py", b"print('Hello')\n"),
        ("/pyproject.toml", b"[project]\nname = 'my-app'\n"),
        ("/data/input.csv", b"name,value\na,1\nb,2\n"),
    ]
)

# 现在代理可以访问这些文件
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    system_prompt="You are a coding assistant. Files are pre-loaded in /src/ and /data/.",
)
```

## Demo 6: 检索制品（下载文件）

```python
from daytona import Daytona
from langchain_daytona import DaytonaSandbox

sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

# 代理运行后检索输出
results = backend.download_files(["/src/index.py", "/output/result.csv"])

for result in results:
    if result.content is not None:
        print(f"{result.path}: {result.content.decode()}")
    else:
        print(f"Failed to download {result.path}: {result.error}")
```

## Demo 7: 线程范围沙箱

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent
from langchain_core.runnables import RunnableConfig
from langchain_daytona import DaytonaSandbox

client = Daytona()


async def agent(config: RunnableConfig):
    thread_id = config["configurable"]["thread_id"]
    try:
        sandbox = await client.find_one(labels={"thread_id": thread_id})
    except Exception:
        sandbox = await client.create(
            CreateSandboxFromSnapshotParams(
                labels={"thread_id": thread_id},
                auto_delete_interval=3600,  # TTL: 空闲 1 小时后清理
            )
        )
    return create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        backend=DaytonaSandbox(sandbox=sandbox),
    )

# 每个线程一个沙箱
# 同一线程的后续调用复用沙箱
```

## Demo 8: 助手范围沙箱

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent
from langchain_core.runnables import RunnableConfig
from langchain_daytona import DaytonaSandbox

client = Daytona()


async def agent(config: RunnableConfig):
    assistant_id = config["configurable"]["assistant_id"]
    try:
        sandbox = await client.find_one(labels={"assistant_id": assistant_id})
    except Exception:
        sandbox = await client.create(
            CreateSandboxFromSnapshotParams(labels={"assistant_id": assistant_id})
        )
    return create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        backend=DaytonaSandbox(sandbox=sandbox),
    )

# 同一助手的所有线程共享一个沙箱
# 文件、包、克隆的仓库跨对话持久化
# 注意：需要 TTL 或清理逻辑
```

## Demo 9: 沙箱作为工具模式

```python
from daytona import Daytona
from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain_daytona import DaytonaSandbox

load_dotenv()

sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    system_prompt="You are a coding assistant with sandbox access. You can create and run code in the sandbox.",
)

try:
    result = agent.invoke(
        {
            "messages": [
                {"role": "user", "content": "Create a hello world Python script and run it"}
            ]
        }
    )
    print(result["messages"][-1].content)
except Exception:
    sandbox.stop()
    raise
```

## Demo 10: 安全处理（密钥在沙箱外）

```python
from langchain.tools import tool
from deepagents import create_deep_agent
from langchain_daytona import DaytonaSandbox


# 密钥在主机上的工具中处理，不在沙箱内
@tool
def call_authenticated_api(endpoint: str, data: str) -> str:
    """Call an API that requires authentication."""
    import os
    import requests

    api_key = os.environ["SECRET_API_KEY"]  # 密钥在主机环境变量中
    response = requests.post(
        endpoint,
        json={"data": data},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    return response.text


sandbox = Daytona().create()
backend = DaytonaSandbox(sandbox=sandbox)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=backend,
    tools=[call_authenticated_api],  # 工具在主机上运行
    system_prompt="You are a coding assistant. Use call_authenticated_api for API calls.",
)

# 代理可以调用 API 但永远看不到 API 密钥
```

## Demo 11: 完整沙箱应用

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent, FilesystemPermission
from langchain_core.runnables import RunnableConfig
from langchain_daytona import DaytonaSandbox

client = Daytona()


async def agent(config: RunnableConfig):
    thread_id = config["configurable"]["thread_id"]
    try:
        sandbox = await client.find_one(labels={"thread_id": thread_id})
    except Exception:
        sandbox = await client.create(
            CreateSandboxFromSnapshotParams(
                labels={"thread_id": thread_id},
                auto_delete_interval=3600,
            )
        )

    backend = DaytonaSandbox(sandbox=sandbox)

    # 种子文件
    backend.upload_files([
        ("/src/app.py", b"print('Hello World')"),
        ("/tests/test_app.py", b"def test_app(): assert True"),
        ("/pyproject.toml", b"[project]\nname = 'my-app'\n"),
    ])

    return create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        backend=backend,
        system_prompt="""You are a Python coding assistant with sandbox access.

Capabilities:
- Read, write, and edit files in /src/ and /tests/
- Run shell commands with execute
- Install packages with pip

Workflow:
1. Read existing code
2. Make changes
3. Run tests
4. Report results""",
        permissions=[
            FilesystemPermission(
                operations=["read", "write"],
                paths=["/src/**", "/tests/**", "/tmp/**"],
                mode="allow",
            ),
            FilesystemPermission(
                operations=["read", "write"],
                paths=["/**"],
                mode="deny",
            ),
        ],
    )
```
