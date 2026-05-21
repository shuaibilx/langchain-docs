# Harness 能力 - Demo

## Demo 1: 规划能力（write_todos）

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a research assistant. Use write_todos to plan your work.",
)

# 代理会自动使用 write_todos 工具来跟踪任务：
# write_todos([
#     {"task": "Search for papers on quantum computing", "status": "in_progress"},
#     {"task": "Summarize key findings", "status": "pending"},
#     {"task": "Write comparison report", "status": "pending"},
# ])
```

## Demo 2: 文件系统操作

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    system_prompt="You are a code assistant.",
)

# 代理可以使用以下文件系统工具：
# - ls("/workspace")           → 列出目录
# - read_file("/workspace/data.csv", offset=0, limit=100)  → 读取前100行
# - write_file("/workspace/output.txt", "content")         → 创建文件
# - edit_file("/workspace/app.py", old_str, new_str)       → 精确替换
# - glob("**/*.py")             → 查找所有 Python 文件
# - grep("import pandas", path="/workspace")               → 搜索内容
```

## Demo 3: 文件系统权限

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    permissions=[
        # 拒绝写入敏感文件
        {"operations": ["write"], "paths": [".env*", "*.key", "credentials.*"], "mode": "deny"},
        # 拒绝读取 secrets 目录
        {"operations": ["read"], "paths": ["/secrets/**"], "mode": "deny"},
        # 允许读写工作区
        {"operations": ["read", "write"], "paths": ["/workspace/**"], "mode": "allow"},
    ],
)

# 测试效果：
# write_file(".env", "SECRET=123")     → 被第1条规则拒绝
# read_file("/secrets/api_key.txt")    → 被第2条规则拒绝
# write_file("/workspace/app.py", ...) → 匹配第3条规则，允许
# read_file("/etc/hosts")              → 无匹配规则，默认允许
```

## Demo 4: 子代理任务委派

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a research manager. Delegate tasks to subagents.",
    subagents=[
        {
            "name": "researcher",
            "model": "anthropic:claude-sonnet-4-6",
            "tools": [internet_search],
            "system_prompt": "You are a thorough researcher. Search extensively.",
        },
        {
            "name": "writer",
            "model": "anthropic:claude-sonnet-4-6",
            "system_prompt": "You are a technical writer. Be concise and clear.",
        },
    ],
)

# 主代理调用 task 工具：
# task(subagent="researcher", task="Research the latest developments in quantum computing")
# → 创建独立子代理，隔离执行，返回压缩结果
# → 主代理上下文只增加一行结果，不包含100+条中间工具调用
```

## Demo 5: 人机交互（HITL）

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    interrupt_on={
        "write_file": True,      # 写文件前暂停
        "edit_file": True,       # 编辑文件前暂停
        "execute": True,         # 执行命令前暂停
        "internet_search": False, # 搜索不暂停
    },
)

# 代理执行流程：
# 1. 代理决定 write_file("/workspace/config.yaml", content)
# 2. 执行暂停，等待人工批准
# 3. 人类审查并批准（或修改输入）
# 4. 代理继续执行
```

## Demo 6: 不使用默认文件系统工具

```python
from deepagents import create_deep_agent, HarnessProfile, register_harness_profile

# 注册 profile，隐藏文件系统工具
register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        excluded_tools=frozenset(
            {"ls", "read_file", "write_file", "edit_file", "glob", "grep"}
        ),
    ),
)

# 创建代理时自动应用 profile
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
)

# 代理只能看到 internet_search 工具，看不到文件系统工具
# 但 FilesystemMiddleware 本身仍在运行（不能通过 excluded_middleware 移除）
```

## Demo 7: 不使用子代理

```python
from deepagents import create_deep_agent, HarnessProfile, register_harness_profile

# 通过 harness profile 禁用默认子代理
register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        excluded_tools=frozenset({"task"}),  # 隐藏 task 工具
    ),
)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    # 不传 subagents 参数
)

# 代理没有 task 工具，不能委派子任务
# 所有工作都在主代理上下文中完成
```

## Demo 8: Skills 渐进式加载

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    skills=["./skills/data-analysis", "./skills/report-writing"],
)

# 启动时：代理只读取每个 SKILL.md 的 frontmatter（名称、描述）
# 当任务需要时：代理加载完整的 skill 内容（指令、脚本、模板）
# 效果：不相关的 skills 不消耗 token
```

## Demo 9: Memory 始终加载

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    memory=["./AGENTS.md", "./project-rules.md"],
)

# 每次对话开始时，memory 文件内容都会被加载到上下文中
# 代理可以读取和更新这些文件
# 适用于：编码风格、项目约定、用户偏好
```

## Demo 10: 代码执行 - 沙箱 vs 解释器

```python
from deepagents import create_deep_agent
from deepagents.interpreters import QuickJSInterpreter

# 方式 1: 沙箱（需要沙箱 backend）
agent_sandbox = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=ModalSandbox(...),  # 提供 execute 工具
)
# 代理可以：execute("pip install pandas && python analyze.py")

# 方式 2: 解释器（轻量级 JavaScript）
agent_interpreter = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    interpreters=[QuickJSInterpreter()],
)
# 代理可以：eval("let x = [1,2,3].map(n => n * 2); return x;")
# 不能：安装包、访问文件系统、网络请求
```

## Demo 11: 完整 Harness 配置

```python
from deepagents import create_deep_agent, HarnessProfile, register_harness_profile
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

# 注册模型 profile
register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        system_prompt_suffix="Be thorough and cite sources.",
    ),
)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a research assistant.",
    memory=["./AGENTS.md"],
    skills=["./skills/research"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={"/memories/": StoreBackend(...)},
    ),
    permissions=[
        {"operations": ["write"], "paths": [".env*"], "mode": "deny"},
        {"operations": ["read", "write"], "paths": ["/workspace/**"], "mode": "allow"},
    ],
    subagents=[...],
    interrupt_on={"execute": True},
    context_schema=Context,
)
