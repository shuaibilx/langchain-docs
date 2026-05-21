# Remote Sandboxes - Demo

## Demo 1: LangSmith Sandbox

```bash
# 设置凭证
export LANGSMITH_API_KEY="your-key"

# 运行（默认包含，无需额外安装）
dcode --sandbox langsmith
```

## Demo 2: Daytona Sandbox

```bash
# 安装
uv tool install deepagents-code --with langchain-daytona

# 设置凭证
export DAYTONA_API_KEY="your-key"

# 运行
dcode --sandbox daytona
```

## Demo 3: Modal Sandbox

```bash
# 安装
uv tool install deepagents-code --with langchain-modal

# 设置凭证（交互式）
modal setup

# 运行
dcode --sandbox modal
```

## Demo 4: Runloop Sandbox

```bash
# 安装
uv tool install deepagents-code --with langchain-runloop

# 设置凭证
export RUNLOOP_API_KEY="your-key"

# 运行
dcode --sandbox runloop
```

## Demo 5: AgentCore Sandbox

```bash
# 安装
uv tool install deepagents-code --with langchain-agentcore-codeinterpreter

# 设置 AWS 凭证
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_SESSION_TOKEN="session-token"
export AWS_REGION="us-west-2"

# 运行
dcode --sandbox agentcore
```

## Demo 6: 重用现有 Sandbox

```bash
# 使用 Runloop 重用现有 sandbox
dcode --sandbox runloop --sandbox-id dbx_abc123

# 使用 LangSmith 重用
dcode --sandbox langsmith --sandbox-id sb_abc123

# 使用 Daytona 重用
dcode --sandbox daytona --sandbox-id ws_abc123
```

## Demo 7: 基础设置脚本

```bash
#!/bin/bash
# setup.sh
set -e

echo "Setting up workspace..."

# 克隆仓库
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/username/repo.git $HOME/workspace
cd $HOME/workspace

# 安装依赖
pip install -r requirements.txt

echo "Setup complete!"
```

```bash
# 使用设置脚本
dcode --sandbox langsmith --sandbox-setup ./setup.sh
```

## Demo 8: 完整设置脚本（环境变量持久化）

```bash
#!/bin/bash
# setup.sh
set -e

# 克隆仓库
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/username/repo.git $HOME/workspace
cd $HOME/workspace

# 安装项目依赖
pip install -r requirements.txt
npm install

# 使环境变量持久化（跨 shell 会话）
cat >> ~/.bashrc <<'EOF'
export GITHUB_TOKEN="${GITHUB_TOKEN}"
export OPENAI_API_KEY="${OPENAI_API_KEY}"
export DATABASE_URL="${DATABASE_URL}"
cd $HOME/workspace
EOF

source ~/.bashrc

# 创建 .env 文件
cat > .env <<EOF
DATABASE_URL=${DATABASE_URL}
SECRET_KEY=${SECRET_KEY}
EOF

echo "Workspace ready at $HOME/workspace"
```

## Demo 9: 非交互模式 + Sandbox

```bash
# 非交互运行（CI/CD 场景）
dcode --sandbox langsmith -n "run the test suite" -S "pytest,git"

# 限制轮次和时间
dcode --sandbox daytona -n "fix failing tests" --max-turns 10 --timeout 300

# 安静输出
dcode --sandbox modal -n "generate .gitignore" -q > .gitignore
```

## Demo 10: .env 文件配置

```bash
# 项目根目录 .env
GITHUB_TOKEN=ghp_...
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
LANGSMITH_API_KEY=lsv2_...
DAYTONA_API_KEY=dt_...
```

```bash
# 使用（设置脚本自动读取 .env）
dcode --sandbox daytona --sandbox-setup ./setup.sh
```

## Demo 11: 完整工作流

```bash
# 1. 选择提供商并安装
uv tool install deepagents-code --with langchain-daytona

# 2. 设置凭证
export DAYTONA_API_KEY="your-key"

# 3. 创建设置脚本
cat > setup.sh << 'SCRIPT'
#!/bin/bash
set -e
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/myorg/myapp.git $HOME/workspace
cd $HOME/workspace
pip install -r requirements.txt
cat >> ~/.bashrc <<'EOF'
export GITHUB_TOKEN="${GITHUB_TOKEN}"
cd $HOME/workspace
EOF
SCRIPT
chmod +x setup.sh

# 4. 启动带 sandbox 的 dcode
dcode --sandbox daytona --sandbox-setup ./setup.sh

# 5. Agent 在远程 sandbox 中执行代码
> Run the test suite and fix any failures
# 工具调用定向到远程 sandbox，不接触本地文件系统
```

## Demo 12: 多环境切换

```bash
# 开发环境（本地）
dcode

# 测试环境（LangSmith sandbox）
dcode --sandbox langsmith

# 生产级环境（Daytona sandbox）
dcode --sandbox daytona --sandbox-setup ./prod-setup.sh

# CI 环境（Modal sandbox，非交互）
dcode --sandbox modal -n "run full test suite" --max-turns 20 -S "pytest,git"
```
