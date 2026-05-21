# LangChain 技术文档 — 官方文档中文走读

> 系统学习 LangChain / LangGraph / DeepAgent 的中文学习资料，适合零基础入门。

**在线阅读：** [https://shuaibilx.github.io/langchain-docs](https://shuaibilx.github.io/langchain-docs)

---

## 这是什么

本项目是对 LangChain 官方文档的**完整中文走读**，涵盖三大技术栈共 **73 篇文档**。每篇文档包含三个部分：

| 部分 | 说明 |
|------|------|
| **📖 翻译** | 逐段中文翻译，完整保留原文内容，不遗漏任何描述 |
| **📋 总结** | 表格、架构图、核心概念提炼，快速掌握要点 |
| **💻 Demo** | Python / TypeScript / Bash 实战代码示例，即学即用 |

## 适合谁

- 想系统学习 LangChain 生态的**初学者**
- 英文文档读起来吃力，需要中文参考的**开发者**
- 想快速查找某个概念或用法的**已有用户**

## 文档结构

### LangChain（22 篇）

LangChain 是构建 LLM 应用的核心框架。

| 分类 | 内容 |
|------|------|
| **01-Get started** | 入门 |
| **02-Core components** | Agents、Models、Messages、Tools、Memory、Streaming、Structured Output |
| **03-Middleware** | 中间件概述、内置中间件、自定义中间件 |
| **04-Fronted** | 前端集成 |
| **05-Advanced usage** | Guardrails、Runtime、Context Engineering、MCP、Human-in-the-Loop、Multi-agent、Long-term Memory、Retrieval |
| **06-Agent development** | Agent 开发 |
| **07-Deploy with Langsmith** | LangSmith 部署 |

### LangGraph（22 篇）

LangGraph 是构建有状态、多步骤 Agent 的框架。

| 分类 | 内容 |
|------|------|
| **01-Get started** | Quickstart、Local Server、Thinking in LangGraph、Workflows and Agents |
| **02-Capabilities** | Persistence、Durable Execution、Fault Tolerance、Streaming、Interrupts、Time Travel、Subgraphs |
| **03-Production** | Application Structure、Test、Backward Compatibility、LangSmith Studio、Agent Chat UI、Observability |
| **04-Fronted** | 前端集成 |
| **05-Langgraph APIs** | Graph API、Functional API、LangGraph Runtime |

### DeepAgent（29 篇）

DeepAgent 是 LangChain 的终端编码 Agent 工具。

| 分类 | 内容 |
|------|------|
| **01-Get started** | Quickstart、Customization、Comparison with Claude Agent SDK |
| **02-Deployment** | Going to Production |
| **03-Core capabilities** | Harness、Models、Context Engineering、Subagents、Memory、Skills、Sandboxes、Interpreters、Profiles、Streaming 等 |
| **04-Fronted** | Frontend UI |
| **05-Protocols** | ACP（Agent Client Protocol） |
| **06-Code** | Deep Agents Code CLI、Configuration、MCP Tools、Data Locations 等 |

## 本地运行

如果你想在本地预览网站：

```bash
# 克隆仓库
git clone https://github.com/shuaibilx/langchain-docs.git
cd langchain-docs

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建静态文件
npm run build
```

## 技术栈

- [VitePress](https://vitepress.dev/) — 静态站点生成器
- [Mermaid](https://mermaid.js.org/) — 图表渲染
- [GitHub Pages](https://pages.github.com/) — 托管部署

## 相关链接

- [LangChain 官方文档](https://docs.langchain.com/)
- [LangGraph 官方文档](https://docs.langchain.com/langgraph)
- [DeepAgent 官方文档](https://docs.langchain.com/deepagents)
