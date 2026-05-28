<div align="center">

# LangChain 技术笔记

**从文档到实践 — 我的 LangChain / LangGraph / DeepAgent 学习笔记与实战 Demo**

**[>>> 点击访问在线文档 <<<](https://shuaibilx.github.io/langchain-docs)**

[LangChain 官方文档](https://docs.langchain.com/) · [LangGraph 官方文档](https://docs.langchain.com/langgraph) · [DeepAgent 官方文档](https://docs.langchain.com/deepagents)

</div>

---

## 项目简介

这不是简单的文档翻译。本仓库记录了我系统学习 LangChain 生态的**完整过程**，核心价值在于：

- **个人总结** — 每篇文档都有表格、架构图、核心概念提炼，用自己的理解重新组织
- **实战 Demo** — Python / TypeScript / Bash 代码示例，即学即用，不是伪代码
- **中文走读** — 逐段翻译作为辅助，降低英文阅读门槛

> 73 篇文档，每篇都包含「总结 + Demo + 翻译」三部分。

## 核心亮点

| | 说明 |
|:--:|:--|
| **总结** | 用表格和架构图提炼核心概念，不是逐字翻译，而是用自己的话重新组织 |
| **Demo** | 可运行的代码示例，涵盖 Python / TypeScript / Bash，拿来就能跑 |
| **翻译** | 完整的中文走读，保留原文细节，适合对照学习 |

## 文档地图

### LangChain（22 篇）

LLM 应用开发核心框架 — 从基础组件到高级用法。

| 分类 | 核心内容 |
|:--|:--|
| **入门** | Quickstart、安装配置 |
| **核心组件** | Agents、Models、Messages、Tools、Memory、Streaming、Structured Output |
| **中间件** | 内置中间件、自定义中间件 |
| **前端集成** | 前端接入方案 |
| **高级用法** | Guardrails、Runtime、Context Engineering、MCP、Human-in-the-Loop、Multi-agent、Long-term Memory、Retrieval |
| **Agent 开发** | Agent 构建实战 |
| **部署与监控** | LangSmith 部署 |

### LangGraph（22 篇）

有状态、多步骤 Agent 框架 — 构建复杂工作流。

| 分类 | 核心内容 |
|:--|:--|
| **入门** | Quickstart、Thinking in LangGraph、Workflows & Agents |
| **核心能力** | Persistence、Durable Execution、Fault Tolerance、Streaming、Interrupts、Time Travel、Subgraphs |
| **生产实践** | Application Structure、Testing、Backward Compatibility、LangSmith Studio、Observability |
| **前端集成** | 前端接入方案 |
| **API 参考** | Graph API、Functional API、LangGraph Runtime |

### DeepAgent（29 篇）

终端编码 Agent — AI 辅助编程工具。

| 分类 | 核心内容 |
|:--|:--|
| **入门** | Quickstart、Customization、与 Claude Agent SDK 对比 |
| **部署** | Going to Production |
| **核心能力** | Harness、Models、Context Engineering、Subagents、Memory、Skills、Sandboxes、Streaming 等 |
| **前端集成** | Frontend UI |
| **协议** | ACP（Agent Client Protocol） |
| **CLI 工具** | Deep Agents Code CLI、Configuration、MCP Tools、Data Locations |

## 本地运行

```bash
git clone https://github.com/shuaibilx/langchain-docs.git
cd langchain-docs
npm install
npm run dev    # 开发服务器
npm run build  # 构建静态文件
```

## 技术栈

| 工具 | 用途 |
|:--|:--|
| [VitePress](https://vitepress.dev/) | 静态站点生成 |
| [Mermaid](https://mermaid.js.org/) | 图表渲染 |
| [GitHub Pages](https://pages.github.com/) | 托管部署 |
