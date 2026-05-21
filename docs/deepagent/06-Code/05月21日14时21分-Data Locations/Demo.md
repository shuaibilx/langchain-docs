# Data Locations - Demo

## Demo 1: 查看完整目录结构

```bash
# 查看用户级目录
ls -la ~/.deepagents/
# .state/
# agent/

# 查看 .state 内容
ls -la ~/.deepagents/.state/
# sessions.db
# history.jsonl
# auth.json
# mcp-tokens/
# onboarding_complete

# 查看 agent 目录
ls -la ~/.deepagents/agent/
# AGENTS.md
# skills/
# agents/
```

## Demo 2: 查看项目级目录

```bash
# 查看项目根目录
ls -la ./
# AGENTS.md
# .deepagents/
# .agents/

# 查看 .deepagents 内容
ls -la .deepagents/
# AGENTS.md
# skills/
# agents/

# 查看 .agents 内容
ls -la .agents/
# skills/
```

## Demo 3: 用户级 AGENTS.md

```bash
# 查看用户自定义指令
cat ~/.deepagents/agent/AGENTS.md
```

```markdown
# My Custom Instructions
- Always use type hints in Python
- Prefer async/await over threading
- Write docstrings in Google style
```

## Demo 4: 项目级 AGENTS.md

```bash
# 项目根目录的指令
cat AGENTS.md
```

```markdown
# Project Instructions
This is a FastAPI + SQLAlchemy project.
Use async endpoints and repository pattern.
```

```bash
# .deepagents 子目录的指令（首选位置）
cat .deepagents/AGENTS.md
```

```markdown
# DeepAgents Project Instructions
Follow our coding standards in docs/CONVENTIONS.md
Use the project-specific skill for database migrations.
```

## Demo 5: 指令组合验证

```bash
# 四个来源全部加载并组合
# 1. 包基础提示（默认）
# 2. ~/.deepagents/agent/AGENTS.md（用户自定义）
# 3. .deepagents/AGENTS.md（项目指令）
# 4. AGENTS.md（项目根目录）

# 启动 dcode 查看完整指令
dcode
# 所有指令都生效，按顺序追加
```

## Demo 6: Skills 优先级演示

```bash
# 同名 skill 存在于多个位置
ls ~/.deepagents/agent/skills/format/SKILL.md     # 用户级
ls ~/.agents/skills/format/SKILL.md                 # 用户工具无关
ls .deepagents/skills/format/SKILL.md               # 项目级
ls .agents/skills/format/SKILL.md                   # 项目工具无关

# 结果：.agents/skills/format/SKILL.md 胜出（最高优先级）
```

## Demo 7: Subagents 优先级演示

```bash
# 同名 subagent 存在于两个位置
cat ~/.deepagents/agent/agents/researcher/AGENTS.md   # 用户级
cat .deepagents/agents/researcher/AGENTS.md            # 项目级

# 结果：.deepagents/agents/researcher/AGENTS.md 胜出（项目级优先）
```

## Demo 8: 工具无关 Skills

```bash
# 创建适用于任何 AI 编码助手的 skill
mkdir -p ~/.agents/skills/format
cat > ~/.agents/skills/format/SKILL.md << 'EOF'
---
name: format
description: Format code using project standards
---
Format code according to project conventions.
EOF

# 该 skill 对 dcode、Claude Code 等所有兼容工具可用
```

## Demo 9: Deep Agents 特定 Skills

```bash
# 创建使用 dcode 特定功能的 skill
mkdir -p ~/.deepagents/agent/skills/deploy
cat > ~/.deepagents/agent/skills/deploy/SKILL.md << 'EOF'
---
name: deploy
description: Deploy using Deep Agents sandbox
---
Use the remote sandbox to run deployment scripts.
Relies on dcode --sandbox flag.
EOF
```

## Demo 10: 项目级 Skills

```bash
# 项目特定 skill
mkdir -p .deepagents/skills/migrate
cat > .deepagents/skills/migrate/SKILL.md << 'EOF'
---
name: migrate
description: Run database migrations for this project
---
Use Alembic to run migrations.
EOF

# 工具无关项目 skill
mkdir -p .agents/skills/test
cat > .agents/skills/test/SKILL.md << 'EOF'
---
name: test
description: Run project test suite
---
Run pytest with coverage.
EOF
```

## Demo 11: 查看 .state 内容

```bash
# 会话数据库
file ~/.deepagents/.state/sessions.db
# SQLite 3 database

# 输入历史
head -5 ~/.deepagents/.state/history.jsonl
# {"prompt": "help me with...", "timestamp": "..."}
# {"prompt": "/model", "timestamp": "..."}

# 存储的凭证
cat ~/.deepagents/.state/auth.json
# {"openai": "sk-...", "anthropic": "sk-ant-..."}

# MCP OAuth 令牌
ls ~/.deepagents/.state/mcp-tokens/
# linear-a1b2c3d4.json
# slack-e5f6g7h8.json
```

## Demo 12: 清理操作

```bash
# 仅清除会话历史
rm ~/.deepagents/.state/sessions.db*
# 所有对话历史丢失！

# 清除输入历史
rm ~/.deepagents/.state/history.jsonl

# 清除存储的 API 密钥
rm ~/.deepagents/.state/auth.json

# 清除 MCP OAuth 令牌
rm -rf ~/.deepagents/.state/mcp-tokens

# 重新运行首次引导
rm ~/.deepagents/.state/onboarding_complete
dcode  # 重新显示引导流程
```

## Demo 13: 重置 Agent 指令

```bash
# 查看当前指令
cat ~/.deepagents/agent/AGENTS.md

# 重置为默认
dcode agents reset --agent agent

# 验证
cat ~/.deepagents/agent/AGENTS.md
# 已重置为默认内容
```

## Demo 14: 移除 Skill

```bash
# 查看已安装的 skills
ls ~/.deepagents/agent/skills/
# format/  deploy/  test/

# 移除特定 skill
rm -rf ~/.deepagents/agent/skills/deploy

# 验证
ls ~/.deepagents/agent/skills/
# format/  test/
```

## Demo 15: 完全重置

```bash
# 备份重要数据
cp ~/.deepagents/.state/sessions.db ~/sessions-backup.db

# 完全重置
rm -rf ~/.deepagents

# 重新启动（触发首次引导）
dcode
```

## Demo 16: 完整项目结构示例

```bash
# 创建完整的项目结构
mkdir -p .deepagents/skills/migrate
mkdir -p .deepagents/agents/researcher
mkdir -p .agents/skills/format

# 项目指令
cat > .deepagents/AGENTS.md << 'EOF'
# Project: MyFastAPIApp
Use async endpoints, SQLAlchemy 2.0, and repository pattern.
EOF

# 项目 skill
cat > .deepagents/skills/migrate/SKILL.md << 'EOF'
---
name: migrate
description: Database migration helper
---
Run Alembic migrations for this project.
EOF

# 项目 subagent
cat > .deepagents/agents/researcher/AGENTS.md << 'EOF'
---
name: researcher
description: Research FastAPI best practices
model: anthropic:claude-haiku-4-5-20251001
---
You are a FastAPI expert researcher.
EOF

# 工具无关 skill
cat > .agents/skills/format/SKILL.md << 'EOF'
---
name: format
description: Format code with ruff
---
Run ruff format and ruff check --fix.
EOF

# 查看最终结构
find . -name "*.md" -path "*/.deepagents/*" -o -name "*.md" -path "*/.agents/*" | sort
# .agents/skills/format/SKILL.md
# .deepagents/AGENTS.md
# .deepagents/agents/researcher/AGENTS.md
# .deepagents/skills/migrate/SKILL.md
```
