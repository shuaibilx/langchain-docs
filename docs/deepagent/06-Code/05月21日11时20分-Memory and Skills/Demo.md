# Memory and Skills - Demo

## Demo 1: 自动记忆使用

```bash
# 启动特定 agent
dcode --agent backend-dev

# 教 agent 约定
> Our API uses snake_case and includes created_at/updated_at timestamps

# 未来会话自动应用
> Create a /users endpoint
# Agent 自动应用之前学到的约定
```

## Demo 2: 记忆文件结构

```bash
# 查看记忆文件
ls ~/.deepagents/backend-dev/memories/
# 输出：
# api-conventions.md
# database-schema.md
# deployment-process.md

# 记忆文件内容示例
cat ~/.deepagents/backend-dev/memories/api-conventions.md
# 内容可能是：
# - API 使用 snake_case 命名
# - 所有端点包含 created_at/updated_at
# - 使用 JWT 认证
# - 分页使用 cursor-based
```

## Demo 3: 全局 AGENTS.md

```markdown
<!-- ~/.deepagents/agent/AGENTS.md -->

# Agent Personality
- Be concise and direct
- Use type hints in all Python code
- Prefer functional programming patterns

# Coding Style
- 4 spaces indentation
- Max line length: 88 (Black formatter)
- Always write docstrings for public functions

# Communication
- Explain reasoning before making changes
- Use examples when explaining concepts
```

## Demo 4: 项目 AGENTS.md

```markdown
<!-- .deepagents/AGENTS.md -->

# Project: MyWebApp

## Architecture
- FastAPI backend with SQLAlchemy ORM
- React frontend with TypeScript
- PostgreSQL database

## Conventions
- All API endpoints return JSON with `data` wrapper
- Use async/await for all database operations
- Error responses follow RFC 7807

## Testing
- pytest for backend tests
- Jest for frontend tests
- Minimum 80% coverage required

## See Also
- [api-conventions.md](./api-conventions.md)
- [database-schema.md](./database-schema.md)
```

## Demo 5: 引用额外记忆文件

```markdown
<!-- .deepagents/AGENTS.md -->

# Project Knowledge

See the following files for detailed information:
- [api-conventions.md](./api-conventions.md) — API design standards
- [database-schema.md](./database-schema.md) — Database structure
- [deployment-process.md](./deployment-process.md) — Deploy steps

## Key Rules
- Always use migrations for schema changes
- Never commit .env files
```

## Demo 6: /remember 命令

```bash
# 在交互模式中
> /remember

# Agent 回顾对话并更新记忆
# 可能输出：
# ✓ Updated api-conventions.md
# ✓ Created testing-strategy.md
# ✓ Updated AGENTS.md

# 带额外上下文
> /remember "we switched from Flask to FastAPI"
```

## Demo 7: 创建用户技能

```bash
# 创建技能
dcode skills create code-review

# 生成结构：
# skills/
# └── code-review
#     └── SKILL.md

# 编辑 SKILL.md
```

```markdown
<!-- skills/code-review/SKILL.md -->
---
name: code-review
description: Perform thorough code reviews with security focus
---

# Code Review Skill

When reviewing code:
1. Check for security vulnerabilities (SQL injection, XSS, etc.)
2. Verify error handling is comprehensive
3. Ensure proper logging is in place
4. Validate input sanitization
5. Check for race conditions in async code
6. Verify test coverage for new code

## Output Format
- List issues by severity (critical/high/medium/low)
- Provide specific line references
- Suggest fixes with code examples
```

## Demo 8: 创建项目技能

```bash
# 创建项目技能
dcode skills create deploy-check --project

# 生成：.deepagents/skills/deploy-check/SKILL.md
```

```markdown
<!-- .deepagents/skills/deploy-check/SKILL.md -->
---
name: deploy-check
description: Pre-deployment checklist and validation
---

# Deploy Check Skill

Before deployment, verify:
1. All tests pass: `pytest`
2. Linting passes: `ruff check .`
3. Type checking passes: `mypy .`
4. No uncommitted changes: `git status`
5. Database migrations are up to date
6. Environment variables are documented
7. CHANGELOG is updated

## Commands
```bash
pytest && ruff check . && mypy . && git status
```
```

## Demo 9: 安装社区技能

```bash
# 安装 Vercel 的 web-design-guidelines 技能
npx skills add vercel-labs/agent-skills \
  --skill web-design-guidelines \
  -a deepagents -g -y

# 列出已安装技能
npx skills ls -a deepagents -g

# 项目级安装（不带 -g）
npx skills add vercel-labs/agent-skills \
  --skill api-standards \
  -a deepagents -y
```

## Demo 10: 技能发现和调用

```bash
# 列出所有技能
dcode skills list
# 输出：
# User skills:
#   code-review — Perform thorough code reviews
#   test-skill — Test skill description
#
# Project skills:
#   deploy-check — Pre-deployment checklist

# 查看技能详情
dcode skills info code-review

# 交互调用
> /skill:code-review

# 带参数调用
> /skill:code-review src/auth.py

# 命令行调用
dcode --skill code-review

# 管道调用
git diff | dcode --skill code-review -m 'focus on security'

# 非交互调用
dcode --skill code-review -n 'review this patch' -q > review.md
```

## Demo 11: 技能命令行调用（各种方式）

```bash
# 打开 TUI 并立即运行技能
dcode --skill code-review

# 用 -m 传递请求
dcode --skill code-review -m 'review the auth module'

# 管道内容到技能
cat diff.txt | dcode --skill code-review

# 管道内容并添加请求
cat diff.txt | dcode --skill code-review -m 'focus on security'

# 非交互无头运行
dcode --skill code-review -n 'review this patch'

# 非交互安静模式
dcode --skill code-review -n 'review this patch' -q

# 输出到文件
dcode --skill code-review -n 'review this patch' -q > review.md
```

## Demo 12: 技能管理

```bash
# 列出用户技能
dcode skills list

# 列出项目技能
dcode skills list --project

# 查看详情
dcode skills info code-review
dcode skills info deploy-check --project

# 删除技能
dcode skills delete test-skill
dcode skills delete test-skill --dry-run  # 预览

# 重新发现技能（无需重启）
> /reload
```

## Demo 13: 完整工作流

```bash
# 1. 创建 agent
dcode --agent myproject

# 2. 设置全局 AGENTS.md
cat > ~/.deepagents/myproject/AGENTS.md << 'EOF'
# My Agent
- Be concise
- Use type hints
- Explain before changing
EOF

# 3. 设置项目 AGENTS.md
mkdir -p .deepagents
cat > .deepagents/AGENTS.md << 'EOF'
# Project: MyApp
## Stack: FastAPI + React + PostgreSQL
## Rules: async everywhere, 80% test coverage
EOF

# 4. 创建项目技能
dcode skills create code-review --project
# 编辑 .deepagents/skills/code-review/SKILL.md

# 5. 教 agent 约定
dcode
> Our API uses snake_case with created_at/updated_at
> /remember

# 6. 使用技能
> /skill:code-review src/api/

# 7. 未来会话自动应用
dcode
> Create a new /orders endpoint
# Agent 自动应用所有学到的约定和技能
```
