# Configuration - Demo

## Demo 1: 基础配置目录结构

```bash
# 创建配置目录
mkdir -p ~/.deepagents

# 查看现有配置
ls ~/.deepagents/
# config.toml  .env  hooks.json  .mcp.json  .state/
```

## Demo 2: 使用 /auth 管理凭证

```bash
dcode

# 打开凭证管理器
/auth

# 显示：
# ✓ credentials set          → Anthropic
# ! missing OPENAI_API_KEY   → OpenAI
# local provider             → Ollama
# 选择某行 → 粘贴密钥
```

## Demo 3: .env 文件配置

```bash
# 全局凭证
cat > ~/.deepagents/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
LANGSMITH_API_KEY=lsv2_...
EOF

# 项目级覆盖（当前目录）
cat > .env << 'EOF'
OPENAI_API_KEY=sk-project-specific...
EOF
```

## Demo 4: DEEPAGENTS_CODE_ 前缀隔离

```bash
# 场景：dcode 和其他工具使用不同的 OpenAI 密钥

cat > ~/.deepagents/.env << 'EOF'
# 其他工具使用此密钥
OPENAI_API_KEY=sk-default-for-all-tools

# dcode 专用密钥（优先级更高）
DEEPAGENTS_CODE_OPENAI_API_KEY=sk-dcode-only

# 阻止 dcode 使用 shell 中导出的 Anthropic 密钥
DEEPAGENTS_CODE_ANTHROPIC_API_KEY=
EOF
```

## Demo 5: 模型默认值配置

```toml
# ~/.deepagents/config.toml

[models]
default = "anthropic:claude-opus-4-7"

[agents]
default = "backend-dev"
```

```bash
# 设置默认模型（CLI 方式）
dcode --default-model anthropic:claude-opus-4-7

# 查看默认
dcode --default-model

# 清除默认
dcode --clear-default-model
```

## Demo 6: 提供商配置

```toml
# ~/.deepagents/config.toml

# OpenAI 提供商
[models.providers.openai]
models = ["gpt-5.5", "gpt-4o"]
api_key_env = "OPENAI_API_KEY"

[models.providers.openai.params]
reasoning = { effort = "high", summary = "auto" }

# Anthropic 提供商
[models.providers.anthropic]
models = ["claude-opus-4-7", "claude-sonnet-4-6"]

[models.providers.anthropic.params]
thinking = { type = "enabled", budget_tokens = 10000 }
max_tokens = 16000

# Ollama 本地
[models.providers.ollama]
base_url = "http://localhost:11434"
models = ["qwen3:4b", "llama3"]

[models.providers.ollama.params]
num_ctx = 16384
temperature = 0
```

## Demo 7: 每模型参数覆盖

```toml
# ~/.deepagents/config.toml

[models.providers.ollama.params]
temperature = 0
num_ctx = 8192

# qwen3:4b 使用不同参数
[models.providers.ollama.params."qwen3:4b"]
temperature = 0.5
num_ctx = 4000
```

```bash
# 结果：
# ollama:qwen3:4b → {temperature: 0.5, num_ctx: 4000}  # 模型覆盖
# ollama:llama3   → {temperature: 0, num_ctx: 8192}    # 提供商级别
```

## Demo 8: 配置文件覆盖

```toml
# ~/.deepagents/config.toml

# 降低所有 Anthropic 模型的上下文限制（触发更早的自动摘要）
[models.providers.anthropic.profile]
max_input_tokens = 4096

# Sonnet 使用更高限制
[models.providers.anthropic.profile."claude-sonnet-4-5"]
max_input_tokens = 8192
```

## Demo 9: CLI 配置文件覆盖

```bash
# 运行时覆盖（不修改配置文件）
dcode --profile-override '{"max_input_tokens": 4096}'

# 与 --model 组合
dcode --model google_genai:gemini-3.5-flash --profile-override '{"max_input_tokens": 4096}'

# 非交互模式
dcode -n "Summarize this repo" --profile-override '{"max_input_tokens": 4096}'
```

## Demo 10: 任意提供商（class_path）

```toml
# ~/.deepagents/config.toml

[models.providers.my_custom]
class_path = "my_package.models:MyChatModel"
api_key_env = "MY_API_KEY"
base_url = "https://my-endpoint.example.com"
models = ["my-model-v1"]

[models.providers.my_custom.params]
temperature = 0
max_tokens = 4096
```

```bash
# 安装提供商包
uv tool install deepagents-code --with my_package

# 使用
dcode --model my_custom:my-model-v1
```

## Demo 11: 兼容 API

```toml
# ~/.deepagents/config.toml

# OpenAI 兼容的自定义端点
[models.providers.openai]
base_url = "https://api.example.com/v1"
api_key_env = "EXAMPLE_API_KEY"
models = ["my-model"]

# 禁用 Responses API（如果端点不支持）
[models.providers.openai.params]
use_responses_api = false
```

```toml
# Anthropic 兼容
[models.providers.anthropic]
base_url = "https://api.example.com"
api_key_env = "EXAMPLE_API_KEY"
models = ["my-model"]
```

## Demo 12: Tavily 网络搜索配置

```bash
# 注册 tavily.com 获取密钥（免费层级足够）

# 添加到全局 .env
echo 'TAVILY_API_KEY=tvly-...' >> ~/.deepagents/.env

# 或使用前缀限定到 dcode
echo 'DEEPAGENTS_CODE_TAVILY_API_KEY=tvly-...' >> ~/.deepagents/.env

# 重新加载
dcode
# /reload
```

## Demo 13: 主题配置

```bash
dcode

# 交互式选择主题
/theme
# 浏览列表 → 实时预览 → Enter 持久化

# 为当前终端保存主题（在 /theme 选择器中按 T）
```

```toml
# ~/.deepagents/config.toml

[ui]
theme = "langchain-dark"

# 自定义主题
[themes.my-solarized]
label = "My Solarized"
dark = true
primary = "#268BD2"
warning = "#B58900"
background = "#FDF6E3"

# 终端映射
[ui.terminal_themes]
"Apple_Terminal" = "langchain-light"
"iTerm.app" = "langchain"
"vscode" = "langchain-dark"
```

## Demo 14: 自动更新配置

```toml
# ~/.deepagents/config.toml
[update]
auto_update = true
```

```bash
# 或环境变量
export DEEPAGENTS_CODE_AUTO_UPDATE=1

# 手动检查更新
dcode
/update
```

## Demo 15: 外部编辑器

```bash
# 在 shell 配置文件中设置
export VISUAL="code"    # GUI 编辑器
export EDITOR="nvim"    # 终端回退

# 使用
dcode
# Ctrl+X 或 /editor → 打开编辑器 → 编写提示 → 关闭 → 发送
```

## Demo 16: Hooks 基础设置

```json
// ~/.deepagents/hooks.json
{
  "hooks": [
    {
      "command": ["bash", "-c", "cat >> ~/deepagents-events.log"],
      "events": ["session.start", "session.end"]
    }
  ]
}
```

```bash
# 启动 dcode，事件自动记录
dcode
cat ~/deepagents-events.log
# {"event": "session.start", "thread_id": "abc123"}
# {"event": "session.end", "thread_id": "abc123"}
```

## Demo 17: Hooks 任务完成通知

```json
// ~/.deepagents/hooks.json
{
  "hooks": [
    {
      "command": [
        "bash", "-c",
        "osascript -e 'display notification \"Agent finished\" with title \"Deep Agents\"'"
      ],
      "events": ["task.complete"]
    }
  ]
}
```

## Demo 18: Hooks Python 处理器

```python
# my_handler.py
import json
import sys

payload = json.load(sys.stdin)
event = payload["event"]

if event == "session.start":
    print(f"Session started: {payload['thread_id']}", file=sys.stderr)
elif event == "permission.request":
    print(f"Approval needed for: {payload['tool_names']}", file=sys.stderr)
elif event == "task.complete":
    # 发送通知或记录到数据库
    with open("/tmp/dcode-tasks.log", "a") as f:
        f.write(f"{payload['thread_id']} completed\n")
```

```json
// ~/.deepagents/hooks.json
{
  "hooks": [
    {
      "command": ["python3", "my_handler.py"],
      "events": ["session.start", "permission.request", "task.complete"]
    }
  ]
}
```

## Demo 19: Hooks 记录所有事件

```json
// ~/.deepagents/hooks.json
{
  "hooks": [
    {
      "command": ["bash", "-c", "jq -c . >> ~/.deepagents/hook-events.jsonl"],
      "events": []
    }
  ]
}
```

```bash
# events 为空数组 → 接收所有事件
cat ~/.deepagents/hook-events.jsonl
```

## Demo 20: Skills 额外允许目录

```toml
# ~/.deepagents/config.toml
[skills]
extra_allowed_dirs = [
    "~/shared-skills",
    "/opt/team-skills",
]
```

```bash
# 或环境变量
export DEEPAGENTS_CODE_EXTRA_SKILLS_DIRS="~/shared-skills:/opt/team-skills"
```

## Demo 21: 环境变量参考

```bash
# 启用自动更新
export DEEPAGENTS_CODE_AUTO_UPDATE=1

# 启用调试日志
export DEEPAGENTS_CODE_DEBUG=1
export DEEPAGENTS_CODE_DEBUG_FILE="/tmp/dcode-debug.log"

# 覆盖 LangSmith 项目名
export DEEPAGENTS_CODE_LANGSMITH_PROJECT="my-project"

# 禁用更新检查
export DEEPAGENTS_CODE_NO_UPDATE_CHECK=1

# Shell 命令白名单
export DEEPAGENTS_CODE_SHELL_ALLOW_LIST="pytest,git,npm"

# 用户标识符
export DEEPAGENTS_CODE_USER_ID="user-123"

# 主题覆盖
export DEEPAGENTS_CODE_THEME="langchain-light"

# 禁用 Ollama 自动发现
export DEEPAGENTS_CODE_OLLAMA_DISCOVERY=0
```

## Demo 22: 完整配置工作流

```bash
# 1. 创建配置目录
mkdir -p ~/.deepagents

# 2. 配置凭证
cat > ~/.deepagents/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
LANGSMITH_API_KEY=lsv2_...
EOF

# 3. 配置模型和提供商
cat > ~/.deepagents/config.toml << 'EOF'
[models]
default = "anthropic:claude-opus-4-7"

[models.providers.anthropic.params]
thinking = { type = "enabled", budget_tokens = 10000 }
max_tokens = 16000

[models.providers.openai.params]
reasoning = { effort = "high" }

[models.providers.ollama]
models = ["qwen3:4b"]

[models.providers.ollama.params]
num_ctx = 16384
temperature = 0

[update]
auto_update = true

[ui]
theme = "langchain-dark"
EOF

# 4. 配置 hooks
cat > ~/.deepagents/hooks.json << 'EOF'
{
  "hooks": [
    {
      "command": ["bash", "-c", "jq -c . >> ~/.deepagents/events.jsonl"],
      "events": ["session.start", "session.end", "task.complete"]
    }
  ]
}
EOF

# 5. 启动
dcode

# 6. 验证配置
/auth        # 检查凭证
/model       # 检查可用模型
/theme       # 检查主题
```
