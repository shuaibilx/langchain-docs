# MCP Tools - Demo

## Demo 1: 快速开始——HTTP MCP 服务器

```bash
# 创建用户级配置
mkdir -p ~/.deepagents
cat > ~/.deepagents/.mcp.json << 'EOF'
{
    "mcpServers": {
        "docs-langchain": {
            "type": "http",
            "url": "https://docs.langchain.com/mcp"
        }
    }
}
EOF

# 启动
dcode
# 输出：✓ Loaded 3 MCP tools

# 查看 MCP 状态
# /mcp
```

## Demo 2: 项目级配置

```bash
# 项目根目录
cat > .mcp.json << 'EOF'
{
    "mcpServers": {
        "project-docs": {
            "type": "http",
            "url": "https://docs.myproject.com/mcp"
        }
    }
}
EOF
```

## Demo 3: 隐藏的项目级配置

```bash
# 放在 .deepagents 子目录（不污染仓库根目录）
mkdir -p .deepagents
cat > .deepagents/.mcp.json << 'EOF'
{
    "mcpServers": {
        "internal-tools": {
            "type": "http",
            "url": "https://internal.company.com/mcp"
        }
    }
}
EOF
```

## Demo 4: stdio 服务器——文件系统

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
            "env": {}
        }
    }
}
```

```bash
# 启动后 agent 可以使用 read_file、write_file、list_directory 等工具
dcode
```

## Demo 5: stdio 服务器——GitHub

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": { "GITHUB_TOKEN": "ghp_..." }
        }
    }
}
```

## Demo 6: SSE 服务器

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "remote-api": {
            "type": "sse",
            "url": "https://api.example.com/mcp",
            "headers": { "Authorization": "Bearer your-token" }
        }
    }
}
```

## Demo 7: 多个服务器

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
        },
        "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": { "GITHUB_TOKEN": "ghp_..." }
        },
        "database": {
            "type": "sse",
            "url": "https://db-mcp.internal:8080/mcp",
            "headers": { "Authorization": "Bearer ..." }
        },
        "docs": {
            "type": "http",
            "url": "https://docs.langchain.com/mcp"
        }
    }
}
```

```bash
# 启动
dcode
# 输出：✓ Loaded 12 MCP tools
```

## Demo 8: 工具过滤——allowedTools

```json
// 仅允许读取操作
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            "allowedTools": ["read_file", "list_directory"]
        }
    }
}
```

## Demo 9: 工具过滤——disabledTools

```json
// 禁用危险操作
{
    "mcpServers": {
        "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "disabledTools": ["delete_repository", "delete_*_branch"]
        }
    }
}
```

## Demo 10: 工具过滤——glob 模式

```json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            "allowedTools": ["read_file", "fs_list_*"]
        }
    }
}
```

## Demo 11: OAuth 登录——Linear

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "linear": {
            "type": "http",
            "url": "https://mcp.linear.app/mcp",
            "auth": "oauth"
        }
    }
}
```

```bash
# 运行登录流程（只需一次）
dcode mcp login linear
# 浏览器打开 → 授权 → 粘贴重定向 URL → 完成

# 令牌自动持久化到 ~/.deepagents/.state/mcp-tokens/

# 启动 dcode
dcode
# agent 可以使用 Linear 的工具
```

## Demo 12: OAuth 登录——Slack

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "slack": {
            "type": "http",
            "url": "https://mcp.slack.com/mcp",
            "auth": "oauth"
        }
    }
}
```

```bash
# 登录（提示输入可选团队 ID）
dcode mcp login slack
# 浏览器授权 → 粘贴 URL → 输入团队 ID（可选）→ 完成
```

## Demo 13: OAuth 登录——GitHub

```json
{
    "mcpServers": {
        "github-mcp": {
            "type": "http",
            "url": "https://api.githubcopilot.com/mcp",
            "auth": "oauth"
        }
    }
}
```

```bash
# 登录（设备授权流程）
dcode mcp login github-mcp
# 打印验证 URL 和用户代码 → 浏览器输入代码 → 自动完成
```

## Demo 14: Header 环境变量插值

```json
// ~/.deepagents/.mcp.json
{
    "mcpServers": {
        "internal-api": {
            "type": "http",
            "url": "https://api.example.com/mcp",
            "headers": {
                "Authorization": "Bearer ${INTERNAL_API_TOKEN}",
                "X-API-Key": "${API_KEY}"
            }
        }
    }
}
```

```bash
# 环境变量在服务器激活时解析
export INTERNAL_API_TOKEN="token-123"
export API_KEY="key-456"
dcode
# internal-api 服务器连接成功

# 如果变量未设置，只影响该服务器，其他服务器正常
```

## Demo 15: 显式配置文件

```bash
# 使用特定配置文件（最高优先级）
dcode --mcp-config ./custom-mcp.json

# 完全禁用 MCP
dcode --no-mcp
```

## Demo 16: 项目级信任——交互模式

```bash
# 首次在项目中使用
cd /path/to/untrusted-project
dcode
# 提示：
# ⚠ Project-level MCP servers detected:
#   stdio: npx @modelcontextprotocol/server-filesystem /tmp
#   http: https://api.example.com/mcp
# Approve? [y/N]
# 输入 y → 信任持久化（SHA-256 指纹）

# 后续启动不再提示（除非配置更改）
dcode
```

## Demo 17: 项目级信任——非交互模式

```bash
# 非交互模式默认跳过项目服务器
dcode -n "run tests"
# 项目 MCP 服务器未加载

# 显式信任
dcode -n "run tests" --trust-project-mcp
# 项目 MCP 服务器已加载
```

## Demo 18: 撤销信任

```toml
# ~/.deepagents/config.toml
[mcp_trust.projects]
"/Users/you/myproject" = "sha256:abc123..."
```

```bash
# 方式 1：删除信任条目
# 编辑 config.toml，删除对应行

# 方式 2：修改项目的 .mcp.json
# 指纹自动失效，下次启动会重新提示

# 方式 3：项目配置更改后自动失效
echo '{"mcpServers": {"new-server": {"type": "http", "url": "..."}}}' > .mcp.json
dcode
# 重新提示批准
```

## Demo 19: /mcp 命令查看状态

```bash
dcode

# 查看 MCP 服务器状态
/mcp
# 显示：
# Server          Transport  Status   Tools
# docs-langchain  http       ok       3
# filesystem      stdio      ok       5
# linear          http       ok       8
# internal        http       error    0  (connection refused)
# 支持 tab/shift+tab 导航
```

## Demo 20: 重新认证

```bash
# 发现服务器需要重新认证
dcode
# /mcp → linear: unauthenticated (refresh token expired)

# 重新登录（会话继续运行）
dcode mcp login linear
# 登录成功 → 服务器重新连接 → 可以使用工具

# 不需要重启 dcode
```

## Demo 21: 完整工作流

```bash
# 1. 创建配置
cat > ~/.deepagents/.mcp.json << 'EOF'
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
            "allowedTools": ["read_file", "write_file", "list_directory", "edit_file"]
        },
        "github": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": { "GITHUB_TOKEN": "ghp_..." },
            "disabledTools": ["delete_repository"]
        },
        "linear": {
            "type": "http",
            "url": "https://mcp.linear.app/mcp",
            "auth": "oauth"
        },
        "docs": {
            "type": "http",
            "url": "https://docs.langchain.com/mcp"
        }
    }
}
EOF

# 2. OAuth 登录（只需一次）
dcode mcp login linear

# 3. 启动
dcode
# ✓ Loaded 16 MCP tools

# 4. 使用工具
# /mcp → 查看所有服务器状态
# agent 现在可以使用文件系统、GitHub、Linear、文档搜索工具
```
