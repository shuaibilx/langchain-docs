# Backends - Demo

## Demo 1: 默认 StateBackend

```python
from deepagents import create_deep_agent

# 最简方式，默认使用 StateBackend
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    tools=[internet_search],
)

# 等价于
from deepagents.backends import StateBackend
agent2 = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=StateBackend(),
)

# 文件存储在 LangGraph 代理状态中
# 同一线程内多轮持久化（通过 checkpointer）
# 不跨线程共享
```

## Demo 2: FilesystemBackend（本地磁盘）

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=FilesystemBackend(root_dir=".", virtual_mode=True),
)

# 代理可以读写当前目录下的真实文件
# virtual_mode=True 启用路径沙箱化（阻止 ..、~、绝对路径逃逸）
```

## Demo 3: CompositeBackend（推荐模式）

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, FilesystemBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=CompositeBackend(
        default=StateBackend(),  # 内部数据（卸载结果、对话历史）→ 临时
        routes={
            "/workspace/": FilesystemBackend(
                root_dir="/path/to/project",
                virtual_mode=True,
            ),  # 项目文件 → 真实磁盘
        },
    ),
)

# 效果：
# /workspace/app.py → 读写真实磁盘 /path/to/project/app.py
# /large_tool_results/xxx → StateBackend（临时，不污染磁盘）
# /conversation_history/xxx → StateBackend（临时）
```

## Demo 4: StoreBackend（跨线程持久化）

```python
from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from langgraph.store.memory import InMemoryStore

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=StoreBackend(
        namespace=lambda rt: (rt.server_info.user.identity,),
    ),
    store=InMemoryStore(),  # 本地开发用；LangSmith 部署时省略
)

# 文件存储在 LangGraph Store 中
# 跨线程持久化
# namespace 按用户隔离
```

## Demo 5: Namespace Factory 模式

```python
from deepagents.backends import StoreBackend

# 按用户隔离：每个用户独立存储
user_backend = StoreBackend(
    namespace=lambda rt: (rt.server_info.user.identity,),
)

# 按助手隔离：同一助手的所有用户共享
assistant_backend = StoreBackend(
    namespace=lambda rt: (rt.server_info.assistant_id,),
)

# 按线程隔离：单个对话
thread_backend = StoreBackend(
    namespace=lambda rt: (rt.execution_info.thread_id,),
)

# 组合隔离：用户 + 助手
combined_backend = StoreBackend(
    namespace=lambda rt: (
        rt.server_info.assistant_id,
        rt.server_info.user.identity,
    ),
)
```

## Demo 6: 完整长期记忆配置

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
        },
    ),
    store=InMemoryStore(),
    system_prompt="""You have persistent memory at /memories/.
    At the start of each conversation, read /memories/preferences.txt.
    When you learn user preferences, update that file.""",
)

# /memories/preferences.txt → 跨线程持久化（StoreBackend）
# 其他文件 → 线程范围（StateBackend）
```

## Demo 7: ContextHubBackend

```python
from deepagents import create_deep_agent
from deepagents.backends import ContextHubBackend

# 需要设置 LANGSMITH_API_KEY
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=ContextHubBackend("my-agent"),  # owner/name 或 name
)

# 文件存储在 LangSmith Hub repo 中
# 首次使用延迟拉取，内存缓存读取
# 写入作为 Hub commits 持久化
```

## Demo 8: LocalShellBackend（本地开发）

```python
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=LocalShellBackend(
        root_dir=".",
        virtual_mode=True,
        env={"PATH": "/usr/bin:/bin"},
    ),
)

# 代理可以：
# - 读写文件（FilesystemBackend 功能）
# - 执行 shell 命令（execute 工具）
# 警告：命令直接在主机上运行，无沙箱！
```

## Demo 9: 权限控制

```python
from deepagents import create_deep_agent, FilesystemPermission
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
            "/policies/": StoreBackend(
                namespace=lambda rt: (rt.context.org_id,),
            ),
        },
    ),
    permissions=[
        # 禁止写入组织策略目录
        FilesystemPermission(
            operations=["write"],
            paths=["/policies/**"],
            mode="deny",
        ),
        # 禁止读写敏感文件
        FilesystemPermission(
            operations=["read", "write"],
            paths=[".env*", "*.key", "credentials.*"],
            mode="deny",
        ),
    ],
)

# write /policies/rule.txt → 被拒绝
# read /policies/rule.txt → 允许（只禁止了 write）
# write /memories/notes.txt → 允许
# read .env → 被拒绝
```

## Demo 10: 策略 Hooks（子类化）

```python
from deepagents.backends.filesystem import FilesystemBackend
from deepagents.backends.protocol import WriteResult, EditResult

class GuardedBackend(FilesystemBackend):
    """阻止对指定前缀的写入/编辑"""
    def __init__(self, *, deny_prefixes: list[str], **kwargs):
        super().__init__(**kwargs)
        self.deny_prefixes = [p if p.endswith("/") else p + "/" for p in deny_prefixes]

    def write(self, file_path: str, content: str) -> WriteResult:
        if any(file_path.startswith(p) for p in self.deny_prefixes):
            return WriteResult(error=f"Writes are not allowed under {file_path}")
        return super().write(file_path, content)

    def edit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        if any(file_path.startswith(p) for p in self.deny_prefixes):
            return EditResult(error=f"Edits are not allowed under {file_path}")
        return super().edit(file_path, old_string, new_string, replace_all)

# 使用
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=GuardedBackend(
        deny_prefixes=["/etc/", "/var/"],
        root_dir=".",
        virtual_mode=True,
    ),
)
```

## Demo 11: 策略 Hooks（通用包装器）

```python
from deepagents.backends.protocol import (
    BackendProtocol, WriteResult, EditResult, LsResult, ReadResult, GrepResult, GlobResult,
)

class PolicyWrapper(BackendProtocol):
    """包装任意 backend，添加写入拒绝逻辑"""
    def __init__(self, inner: BackendProtocol, deny_prefixes: list[str] | None = None):
        self.inner = inner
        self.deny_prefixes = [p if p.endswith("/") else p + "/" for p in (deny_prefixes or [])]

    def _deny(self, path: str) -> bool:
        return any(path.startswith(p) for p in self.deny_prefixes)

    def ls(self, path: str) -> LsResult:
        return self.inner.ls(path)

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        return self.inner.read(file_path, offset=offset, limit=limit)

    def grep(self, pattern: str, path: str | None = None, glob: str | None = None) -> GrepResult:
        return self.inner.grep(pattern, path, glob)

    def glob(self, pattern: str, path: str = "/") -> GlobResult:
        return self.inner.glob(pattern, path)

    def write(self, file_path: str, content: str) -> WriteResult:
        if self._deny(file_path):
            return WriteResult(error=f"Writes are not allowed under {file_path}")
        return self.inner.write(file_path, content)

    def edit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        if self._deny(file_path):
            return EditResult(error=f"Edits are not allowed under {file_path}")
        return self.inner.edit(file_path, old_string, new_string, replace_all)

# 使用：包装 StoreBackend
from deepagents import create_deep_agent
from deepagents.backends import StoreBackend

inner = StoreBackend(namespace=lambda rt: (rt.server_info.user.identity,))
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=PolicyWrapper(inner, deny_prefixes=["/restricted/"]),
)
```

## Demo 12: 自定义 S3 Backend

```python
from deepagents.backends.protocol import (
    BackendProtocol, WriteResult, EditResult, LsResult, ReadResult, GrepResult, GlobResult,
)

class S3Backend(BackendProtocol):
    def __init__(self, bucket: str, prefix: str = ""):
        self.bucket = bucket
        self.prefix = prefix.rstrip("/")

    def _key(self, path: str) -> str:
        return f"{self.prefix}{path}"

    def ls(self, path: str) -> LsResult:
        # 列出 S3 对象
        # 返回 LsResult(entries=[FileInfo(path=..., size=..., modified_at=...)])
        ...

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        # 获取 S3 对象
        # 返回 ReadResult(file_data=FileData(content=..., encoding="utf-8"))
        ...

    def grep(self, pattern: str, path: str | None = None, glob: str | None = None) -> GrepResult:
        # 列出并扫描内容
        ...

    def glob(self, pattern: str, path: str = "/") -> GlobResult:
        # 在 S3 键上应用 glob
        ...

    def write(self, file_path: str, content: str) -> WriteResult:
        # 创建 S3 对象
        # 返回 WriteResult(path=file_path, files_update=None)  # 外部持久化不需要 files_update
        ...

    def edit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        # 读取 → 替换 → 写入 S3
        ...

from deepagents import create_deep_agent
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=S3Backend(bucket="my-bucket", prefix="agent-files/"),
)
```

## Demo 13: 从工厂模式迁移

```python
# ❌ 旧方式（已弃用）
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent_old = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=lambda rt: CompositeBackend(
        default=StateBackend(rt),
        routes={"/memories/": StoreBackend(rt, namespace=lambda rt: (rt.server_info.user.identity,))},
    ),
)

# ✅ 新方式
agent_new = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=CompositeBackend(
        default=StateBackend(),
        routes={"/memories/": StoreBackend(namespace=lambda rt: (rt.server_info.user.identity,))},
    ),
)

# 关键变化：
# 1. 不传 lambda，直接传实例
# 2. StateBackend() 不需要 rt 参数
# 3. StoreBackend() 不需要 rt 参数
# 4. namespace lambda 参数从 BackendContext 变为 Runtime
```
