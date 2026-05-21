# Permissions - Demo

## Demo 1: 只读代理

```python
from deepagents import FilesystemPermission, create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=backend,
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
)
# 代理可以读取任何文件，但不能写入/编辑任何文件
```

## Demo 2: 隔离到工作区目录

```python
from deepagents import FilesystemPermission, create_deep_agent

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=backend,
    permissions=[
        # 允许读写 /workspace/ 下的文件
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/**"],
            mode="allow",
        ),
        # 拒绝其他一切
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
)
# /workspace/app.py → 允许
# /etc/passwd → 拒绝
# /tmp/test.txt → 拒绝
```

## Demo 3: 保护特定文件

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=backend,
    permissions=[
        # 先拒绝敏感文件（具体规则在前）
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/.env", "/workspace/examples/**"],
            mode="deny",
        ),
        # 再允许工作区其他文件
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/**"],
            mode="allow",
        ),
        # 最后拒绝其他一切
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
)
# /workspace/.env → 拒绝
# /workspace/examples/test.py → 拒绝
# /workspace/app.py → 允许
```

## Demo 4: 只读记忆

```python
from deepagents import FilesystemPermission, create_deep_agent
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
        FilesystemPermission(
            operations=["write"],
            paths=["/memories/**", "/policies/**"],
            mode="deny",
        ),
    ],
)
# read /memories/preferences.txt → 允许
# write /memories/preferences.txt → 拒绝
# read /policies/rules.txt → 允许
# write /policies/rules.txt → 拒绝
```

## Demo 5: 拒绝所有访问

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=backend,
    permissions=[
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
)
# 所有读写操作都被拒绝
# 可作为限制性基线，在其上叠加更具体的允许规则
```

## Demo 6: 规则排序（正确 vs 错误）

```python
# ✅ 正确：具体规则在前
correct_permissions = [
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/workspace/.env"],
        mode="deny",  # 先拒绝 .env
    ),
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/workspace/**"],
        mode="allow",  # 再允许 workspace 其他
    ),
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/**"],
        mode="deny",  # 最后拒绝其他
    ),
]

# ❌ 错误：/workspace/** 先匹配 .env，deny 永远不触发
incorrect_permissions = [
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/workspace/**"],
        mode="allow",  # .env 也被匹配了！
    ),
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/workspace/.env"],
        mode="deny",  # 永远不会到达
    ),
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/**"],
        mode="deny",
    ),
]
```

## Demo 7: Subagent 权限覆盖

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=backend,
    # 主代理权限：可读写 workspace
    permissions=[
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/**"],
            mode="allow",
        ),
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
    subagents=[
        {
            "name": "auditor",
            "description": "Read-only code reviewer",
            "system_prompt": "Review the code for issues.",
            # Subagent 权限：完全替换，只读
            "permissions": [
                FilesystemPermission(
                    operations=["write"],
                    paths=["/**"],
                    mode="deny",
                ),
                FilesystemPermission(
                    operations=["read"],
                    paths=["/workspace/**"],
                    mode="allow",
                ),
                FilesystemPermission(
                    operations=["read"],
                    paths=["/**"],
                    mode="deny",
                ),
            ],
        }
    ],
)
# 主代理：read /workspace/app.py → 允许
# 主代理：write /workspace/app.py → 允许
# auditor：read /workspace/app.py → 允许
# auditor：write /workspace/app.py → 拒绝
```

## Demo 8: CompositeBackend 权限限制

```python
from deepagents.backends import CompositeBackend, StateBackend

sandbox = SandboxBackend(...)
memories_backend = StoreBackend(namespace=lambda rt: (rt.server_info.user.identity,))

composite = CompositeBackend(
    default=sandbox,
    routes={"/memories/": memories_backend},
)

# ✅ 有效：权限限定在 /memories/ 路由下
agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",
    backend=composite,
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/memories/**"],
            mode="deny",
        ),
    ],
)

# ❌ 引发 NotImplementedError：/workspace/** 命中沙箱默认
try:
    create_deep_agent(
        model="google_genai:gemini-3.1-pro-preview",
        backend=composite,
        permissions=[
            FilesystemPermission(
                operations=["write"],
                paths=["/workspace/**"],
                mode="deny",
            ),
        ],
    )
except NotImplementedError:
    print("Cannot use permissions outside known routes with sandbox default")
```

## Demo 9: 组合模式（工作区 + 只读记忆 + 保护文件）

```python
from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

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
    permissions=[
        # 1. 保护敏感文件
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/.env", "/workspace/.git/**", "/workspace/secrets/**"],
            mode="deny",
        ),
        # 2. 记忆只读
        FilesystemPermission(
            operations=["write"],
            paths=["/memories/**"],
            mode="deny",
        ),
        # 3. 允许工作区读写
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/**"],
            mode="allow",
        ),
        # 4. 拒绝其他一切
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny",
        ),
    ],
)
```

## Demo 10: 完整 Permissions 应用

```python
from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

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
        # 保护配置文件
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/.env", "/workspace/config/secrets.*"],
            mode="deny",
        ),
        # 组织策略只读
        FilesystemPermission(
            operations=["write"],
            paths=["/policies/**"],
            mode="deny",
        ),
        # 工作区可读写
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/workspace/**", "/memories/**"],
            mode="allow",
        ),
        # 其他拒绝
        FilesystemPermission(
            operations=["read", "write"],
            paths=["/**"],
            mode="deny"),
    ],
    subagents=[
        {
            "name": "auditor",
            "description": "Read-only code reviewer",
            "system_prompt": "Review code for issues. Report findings.",
            "permissions": [
                FilesystemPermission(operations=["write"], paths=["/**"], mode="deny"),
                FilesystemPermission(operations=["read"], paths=["/workspace/**"], mode="allow"),
                FilesystemPermission(operations=["read"], paths=["/**"], mode="deny"),
            ],
        },
    ],
    checkpointer=checkpointer,
)

# 主代理：read /workspace/app.py → 允许
# 主代理：write /workspace/app.py → 允许
# 主代理：read /workspace/.env → 拒绝
# 主代理：write /policies/rules.txt → 拒绝
# auditor：read /workspace/app.py → 允许
# auditor：write /workspace/app.py → 拒绝
```
