# Agent Chat UI 功能 Demo

## 环境准备

```bash
# 需要 Node.js 和 pnpm
npm install -g pnpm
```

---

## Demo 1：使用托管版本

1. 访问 https://agentchat.vercel.app
2. 在 "Graph ID" 输入框中输入你的图名称
3. 在 "Deployment URL" 输入代理地址：
   - 本地：`http://localhost:2024`
   - 已部署：你的代理 URL
4. 点击 "Connect"
5. 开始聊天！

---

## Demo 2：创建本地 Agent Chat UI

```bash
# 创建项目
npx create-agent-chat-app --project-name my-chat-ui
cd my-chat-ui

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:3000` 查看 UI。

---

## Demo 3：连接本地代理

首先启动本地代理：

```bash
# 在另一个终端
cd your-agent-project
langgraph dev
```

然后在 Agent Chat UI 中配置：
- Graph ID: `agent`（对应 langgraph.json 中的 graphs 键）
- Deployment URL: `http://localhost:2024`

---

## Demo 4：连接已部署代理

如果代理已部署到 LangSmith：

1. 在 LangSmith 中找到你的部署 URL
2. 在 Agent Chat UI 中输入：
   - Graph ID: `agent`
   - Deployment URL: `https://your-deployment-url`
   - API Key: 你的 LangSmith API 密钥

---

## Demo 5：使用克隆仓库自定义

```bash
# 克隆
git clone https://github.com/langchain-ai/agent-chat-ui.git
cd agent-chat-ui

# 安装依赖
pnpm install

# 自定义（修改源代码）
# ...

# 启动
pnpm dev
```

---

## 运行说明

1. Demo 1 使用托管版本
2. Demo 2 创建本地项目
3. Demo 3 连接本地代理
4. Demo 4 连接已部署代理
5. Demo 5 克隆仓库自定义
