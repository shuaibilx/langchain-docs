# Deep Agents vs Claude Agent SDK - Demo

> 本页为概念比较文档，无代码 Demo。以下是两个框架的代码对比。

## 对比 1: 创建 Agent

**Deep Agents:**
```python
from deepagents import create_deep_agent

# 任意模型提供商
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",  # 或 openai:gpt-5.4, google_genai:...
    tools=[internet_search],
    system_prompt="You are a researcher.",
)
```

**Claude Agent SDK:**
```python
# 仅 Claude 模型
from claude_agent_sdk import Agent

agent = Agent(
    model="claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a researcher.",
)
```

## 对比 2: 沙箱配置

**Deep Agents（灵活选择 backend）:**
```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend, FilesystemBackend, StoreBackend, CompositeBackend

# 选项 1: 虚拟文件系统（默认）
agent = create_deep_agent(model="...", backend=StateBackend())

# 选项 2: 本地文件系统
agent = create_deep_agent(model="...", backend=FilesystemBackend(root_dir="."))

# 选项 3: 远程沙箱
agent = create_deep_agent(model="...", backend=ModalSandbox(...))

# 选项 4: 混合路由
agent = create_deep_agent(model="...", backend=CompositeBackend(
    default=StateBackend(),
    routes={"/data/": StoreBackend(...)},
))
```

**Claude Agent SDK（仅本地沙箱）:**
```python
# 代理在沙箱内运行，直接访问沙箱文件系统
agent = Agent(model="claude-sonnet-4-6", tools=[...])
```

## 对比 3: 多租户部署

**Deep Agents（内置）:**
```python
from deepagents import create_deep_agent
from deepagents.backends import StoreBackend

# 按用户隔离
agent = create_deep_agent(
    model="...",
    backend=StoreBackend(
        namespace=lambda rt: (rt.server_info.user.identity,),  # 按用户隔离
    ),
)
# LangSmith Sandbox 提供 auth proxy，用户可调用第三方 API
```

**Claude Agent SDK（自行构建）:**
```python
# 需要自己实现：
# 1. 为每个用户启动沙箱
# 2. 跟踪沙箱归属
# 3. 请求结束后销毁沙箱
class MultiTenantManager:
    def __init__(self):
        self.sandboxes = {}  # user_id -> sandbox

    def get_sandbox(self, user_id):
        if user_id not in self.sandboxes:
            self.sandboxes[user_id] = create_sandbox()
        return self.sandboxes[user_id]

    def cleanup(self, user_id):
        if user_id in self.sandboxes:
            self.sandboxes[user_id].destroy()
            del self.sandboxes[user_id]
```

## 对比 4: 部署方式

**Deep Agents:**
```bash
# 托管部署（LangSmith）
# 直接在 LangSmith UI 创建 Managed Deep Agent

# 自托管部署
langgraph build -t docker
docker run -p 8000:8000 my-agent:latest
# 开箱即用：流式端点、线程管理、认证
```

**Claude Agent SDK:**
```bash
# 自托管：需要自己构建
# 1. HTTP/WebSocket/SSE 服务器
# 2. 认证层
# 3. 流式传输层
# 4. 线程管理
# 5. 运行历史存储
```

## 对比 5: Harness Profiles（模型调优）

**Deep Agents:**
```python
from deepagents import HarnessProfile, register_harness_profile

# 声明式注册，自动应用
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(system_prompt_suffix="Respond in under 100 words."),
)
register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(system_prompt_suffix="Be thorough and cite sources."),
)

# 使用时自动应用对应 profile
agent_openai = create_deep_agent(model="openai:gpt-5.4")      # 自动加 "Respond in under 100 words."
agent_claude = create_deep_agent(model="anthropic:claude-sonnet-4-6")  # 自动加 "Be thorough..."
```

**Claude Agent SDK:**
```python
# 在代码中手动配置
agent = Agent(
    model="claude-sonnet-4-6",
    system_prompt="Be thorough and cite sources.",  # 手动添加
)
```
