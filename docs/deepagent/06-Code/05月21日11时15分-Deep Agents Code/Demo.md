# Deep Agents Code - Demo

## Demo 1: 安装和启动

```bash
# 脚本安装
curl -LsSf https://langch.in/dcode | bash

# 带额外提供商
DEEPAGENTS_EXTRAS="fireworks,nvidia" curl -LsSf https://langch.in/dcode | bash

# uv 安装
uv tool install 'deepagents-code[fireworks,nvidia]'

# 启动
dcode
```

## Demo 2: 基础交互使用

```bash
# 启动 dcode
dcode

# 在交互模式中输入
> Create a Python script that prints "Hello, World!"

# Agent 提出带 diff 的更改，审批后执行
# Agent 可能运行 shell 命令测试代码
```

## Demo 3: 非交互模式

```bash
# 单任务运行
dcode -n "Write a Python script that prints hello world"

# 带启动命令
dcode --startup-cmd "ls -la" -m "Summarize what's in this directory"

# 非交互模式带 git diff
dcode --startup-cmd "git diff --stat" -n "Review these changes"
```

## Demo 4: 管道输入

```bash
# 解释代码
echo "Explain this code" | dcode

# 分析错误日志
cat error.log | dcode -n "What's causing this error?"

# 代码审查
git diff | dcode -n "Review these changes"

# 带技能
git diff | dcode --skill code-review -n 'summarize changes'
```

## Demo 5: 模型切换

```bash
# 使用特定模型
dcode --model anthropic:claude-opus-4-7
dcode --model gpt-5.5
dcode --model google_genai:gemini-3.5-flash

# 在交互模式中切换
> /model
# 打开交互式模型选择器
```

## Demo 6: 自动审批和 Shell 白名单

```bash
# 自动审批所有工具调用
dcode -y
dcode --auto-approve

# Shell 白名单
dcode -n "Run the tests and fix failures" -S "pytest,git,make"

# 使用安全命令列表
dcode -n "Build the project" -S recommended

# 允许任意 shell 命令（谨慎！）
dcode -n "Fix the build" -S all
```

## Demo 7: 限制轮次和时间

```bash
# 限制 agentic 轮次
dcode -n "fix the failing tests" --max-turns 10

# 限制挂钟时间
dcode -n "run the test suite and summarise failures" --timeout 120

# 组合使用
dcode -n "refactor auth module" --timeout 300 --max-turns 20
```

## Demo 8: 干净输出和管道

```bash
# 生成 .gitignore
dcode -n "Generate a .gitignore for Python" -q > .gitignore

# 列出依赖并排序
dcode -n "List dependencies" -q --no-stream | sort

# 缓冲完整响应
dcode -n "Generate a README" -q --no-stream > README.md
```

## Demo 9: Agent 管理

```bash
# 列出所有 agent
dcode agents list

# 使用特定 agent
dcode --agent mybot

# 重置 agent 记忆
dcode agents reset --agent NAME

# 从另一个 agent 复制记忆
dcode agents reset --agent NAME --target SOURCE
```

## Demo 10: 技能管理

```bash
# 列出所有技能
dcode skills list
dcode skills list --project

# 创建新技能
dcode skills create my-skill
dcode skills create my-skill --project

# 查看技能详情
dcode skills info my-skill

# 删除技能
dcode skills delete my-skill
dcode skills delete my-skill --dry-run  # 预览

# 在交互模式中调用技能
> /skill:code-review
> /skill:my-skill arg1 arg2
```

## Demo 11: 会话管理

```bash
# 列出会话
dcode threads list
dcode threads list --agent mybot --limit 10
dcode threads list --sort updated -v

# 恢复最近会话
dcode -r

# 恢复特定会话
dcode -r <thread-id>

# 删除会话
dcode threads delete <thread-id>
dcode threads delete <thread-id> --dry-run  # 预览
```

## Demo 12: 远程 Sandbox

```bash
# 使用 LangSmith sandbox
dcode --sandbox langsmith

# 使用 Daytona sandbox
dcode --sandbox daytona

# 使用现有 sandbox
dcode --sandbox langsmith --sandbox-id <id>

# 带设置脚本
dcode --sandbox langsmith --sandbox-setup ./setup.sh
```

## Demo 13: MCP 工具

```bash
# 使用特定 MCP 配置
dcode --mcp-config ./mcp.json

# 禁用所有 MCP
dcode --no-mcp

# 信任项目 MCP 配置
dcode --trust-project-mcp

# 在交互模式中查看 MCP
> /mcp

# MCP OAuth 登录
dcode mcp login NAME
```

## Demo 14: LangSmith 追踪配置

```bash
# ~/.deepagents/.env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=my-project

# 分离 agent 追踪到专用项目
DEEPAGENTS_CODE_LANGSMITH_PROJECT=my-agent-execution
LANGSMITH_PROJECT=my-app-traces
```

```bash
# 临时禁用追踪
export LANGSMITH_TRACING=false

# 在交互模式中打开追踪
> /trace
```

## Demo 15: 配置文件

```toml
# ~/.deepagents/config.toml 示例
[agents]
recent = "mybot"

[agents.mybot]
model = "anthropic:claude-sonnet-4-6"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[themes.my-theme]
background = "#1a1a2e"
foreground = "#e0e0e0"
```

```bash
# .env 文件
# ~/.deepagents/.env（全局）
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
TAVILY_API_KEY=tvly-...

# 项目根目录 .env（覆盖全局）
LANGSMITH_PROJECT=my-project
```

## Demo 16: 交互模式快捷键使用

```bash
# 启动 dcode
dcode

# 输入提示，用 Shift+Enter 换行
> Please review this function
  and suggest improvements

# Tab 切换自动审批
# Shift+Tab: 当前 auto-approve: ON

# @ 引用文件
> Please review @src/main.py

# ! 运行 shell 命令
> !git status
> !npm test

# Ctrl+O 展开/折叠工具输出

# Escape 中断当前操作
```

## Demo 17: 完整工作流

```bash
# 1. 安装
curl -LsSf https://langch.in/dcode | bash

# 2. 配置凭证
dcode
> /auth
# 设置 ANTHROPIC_API_KEY

# 3. 配置追踪
echo 'LANGSMITH_TRACING=true' >> ~/.deepagents/.env
echo 'LANGSMITH_API_KEY=lsv2_...' >> ~/.deepagents/.env

# 4. 启用 web 搜索
echo 'TAVILY_API_KEY=tvly-...' >> ~/.deepagents/.env

# 5. 创建自定义 agent
dcode agents list
dcode --agent mybot

# 6. 创建技能
dcode skills create code-review

# 7. 开始工作
dcode
> Review the code in src/ and suggest improvements

# 8. 非交互 CI 使用
dcode -n "fix failing tests" --max-turns 20 --timeout 300 -S "pytest,git"
```
