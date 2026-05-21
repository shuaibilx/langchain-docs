# Model Providers - Demo

## Demo 1: 基础安装（默认提供商）

```bash
# OpenAI、Anthropic、Gemini 默认包含
curl -LsSf https://langch.in/dcode | bash

# 设置凭证
mkdir -p ~/.deepagents
echo 'OPENAI_API_KEY=sk-...' >> ~/.deepagents/.env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> ~/.deepagents/.env

# 启动
dcode
```

## Demo 2: 安装额外提供商

```bash
# 安装 Groq 和 Baseten
DEEPAGENTS_EXTRAS="baseten,groq" curl -LsSf https://langch.in/dcode | bash

# 或使用 uv
uv tool install 'deepagents-code[baseten,groq]'

# 稍后添加 Ollama
uv tool install deepagents-code --with langchain-ollama
```

## Demo 3: 设置凭证（三种方式）

```bash
# 方式 1：永久存储在 ~/.deepagents/.env
mkdir -p ~/.deepagents
echo 'OPENAI_API_KEY=sk-...' >> ~/.deepagents/.env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> ~/.deepagents/.env
echo 'GOOGLE_API_KEY=AIza...' >> ~/.deepagents/.env

# 方式 2：当前会话导出
export OPENAI_API_KEY="sk-..."

# 方式 3：使用 DEEPAGENTS_CODE_ 前缀限定
export DEEPAGENTS_CODE_OPENAI_API_KEY="sk-..."
# 仅在 dcode 内有效，不影响其他工具
```

## Demo 4: 启动时指定模型

```bash
# 使用 Anthropic Claude
dcode --model anthropic:claude-opus-4-7

# 使用 OpenAI GPT
dcode --model openai:gpt-5.5

# 使用 DeepSeek
dcode --model deepseek:deepseek-chat

# 使用本地 Ollama
dcode --model ollama:qwen3:4b
```

## Demo 5: 会话中切换模型

```bash
# 启动 dcode
dcode

# 交互式切换（显示可用模型列表）
/model

# 直接指定模型
/model gpt-5.5
/model anthropic:claude-sonnet-4-6
/model ollama:qwen3:4b
```

## Demo 6: 设置默认模型

```bash
# 通过命令设置默认
dcode --default-model anthropic:claude-opus-4-7

# 查看当前默认
dcode --default-model

# 清除默认
dcode --clear-default-model

# 会话中设置默认
# /model → 导航到模型 → Ctrl+S
```

```bash
# 通过 config.toml 设置
cat >> ~/.deepagents/config.toml << 'EOF'
[models]
default = "anthropic:claude-opus-4-7"
EOF
```

## Demo 7: 模型参数（启动时）

```bash
# OpenAI 推理努力程度
dcode --model openai:gpt-5.5 --model-params '{"reasoning": {"effort": "high"}}'

# Anthropic 扩展思考
dcode --model anthropic:claude-opus-4-7 --model-params '{"thinking": {"type": "enabled", "budget_tokens": 10000}, "max_tokens": 16000}'

# Ollama 上下文窗口
dcode --model ollama:qwen3:4b --model-params '{"num_ctx": 16384, "temperature": 0}'
```

## Demo 8: 模型参数（会话中）

```bash
dcode

# 设置温度
/model --model-params '{"temperature": 0.7}' anthropic:claude-opus-4-7

# 仅设置参数，使用选择器选模型
/model --model-params '{"num_ctx": 16384}'
```

## Demo 9: 模型参数（config.toml 持久化）

```toml
# ~/.deepagents/config.toml

# Anthropic 提供商级别参数
[models.providers.anthropic.params]
thinking = { type = "enabled", budget_tokens = 10000 }
max_tokens = 16000

# OpenAI 提供商级别参数
[models.providers.openai.params]
reasoning = { effort = "high", summary = "auto" }
output_version = "responses/v1"

# Ollama 提供商级别参数
[models.providers.ollama.params]
num_ctx = 16384
temperature = 0

# Ollama 特定模型覆盖（优先于提供商级别）
[models.providers.ollama.params."qwen3:4b"]
temperature = 0.5
```

## Demo 10: 模型路由器（OpenRouter）

```bash
# 安装 OpenRouter 包
uv tool install 'deepagents-code[openrouter]'

# 设置凭证
echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.deepagents/.env

# 使用 OpenRouter 模型
dcode --model openrouter:anthropic/claude-opus-4-7
dcode --model openrouter:meta-llama/llama-4-scout
```

## Demo 11: 模型路由器（LiteLLM）

```bash
# 安装 LiteLLM 包
uv tool install 'deepagents-code[litellm]'

# 使用 LiteLLM 模型
dcode --model litellm:gpt-5.5
dcode --model litellm:claude-opus-4-7
```

## Demo 12: 本地 Ollama 配置

```bash
# 安装 Ollama 包
uv tool install deepagents-code --with langchain-ollama

# 拉取模型
ollama pull qwen3:4b

# 添加模型到切换器
cat >> ~/.deepagents/config.toml << 'EOF'
[models.providers.ollama.models]
"qwen3:4b" = {}

[models.providers.ollama.profile."qwen3:4b"]
tool_calling = true
max_input_tokens = 32768
max_output_tokens = 8192

[models.providers.ollama.params."qwen3:4b"]
num_ctx = 16384
temperature = 0
EOF

# 启动
dcode --model ollama:qwen3:4b
```

## Demo 13: 缺失模型故障排除

```bash
# 问题：提供商显示但模型缺失
# 原因：模型配置文件 tool_calling 为 false 或无配置文件

# 修复方式 1：添加到 config.toml models 列表
cat >> ~/.deepagents/config.toml << 'EOF'
[models.providers.ollama.models]
"llama3:8b" = {}
EOF

# 修复方式 2：添加配置文件
cat >> ~/.deepagents/config.toml << 'EOF'
[models.providers.ollama.profile."llama3:8b"]
tool_calling = true
max_input_tokens = 8192
max_output_tokens = 4096
EOF

# 修复方式 3：直接指定（绕过列表过滤）
/model ollama:llama3:8b
```

## Demo 14: 完整工作流

```bash
# 1. 安装所有需要的提供商
uv tool install 'deepagents-code[anthropic,openai,ollama,openrouter]'

# 2. 设置凭证
cat >> ~/.deepagents/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
EOF

# 3. 配置默认模型和参数
cat >> ~/.deepagents/config.toml << 'EOF'
[models]
default = "anthropic:claude-opus-4-7"

[models.providers.anthropic.params]
thinking = { type = "enabled", budget_tokens = 10000 }
max_tokens = 16000

[models.providers.openai.params]
reasoning = { effort = "high" }
EOF

# 4. 启动
dcode

# 5. 会话中切换
/model openai:gpt-5.5
/model --model-params '{"temperature": 0.7}'
/model anthropic:claude-sonnet-4-6
```

## Demo 15: DEEPAGENTS_CODE_ 前缀隔离

```bash
# 场景：同时使用 dcode 和其他工具，需要不同的 API 密钥

# 其他工具使用默认密钥
export OPENAI_API_KEY="sk-default-key"

# dcode 使用专用密钥（优先级更高）
export DEEPAGENTS_CODE_OPENAI_API_KEY="sk-dcode-specific-key"

# dcode 使用 sk-dcode-specific-key
# 其他工具使用 sk-default-key
dcode
```
