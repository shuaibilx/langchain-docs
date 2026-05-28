# Learn 模块总览 — 背诵版

## 模块位置

```
文档体系
├── Get started
├── Core components
├── ★ Learn（本模块）★
│   ├── Use Cases（Deep Agents / LangChain / LangGraph / Multi-agent）
│   ├── Conceptual overviews（Memory / Context / Graph API / Functional API）
│   └── Additional resources（Academy / Case Studies）
└── Reference
```

## 核心用例速查表

| 框架 | 用例 | 一句话 | 关键词 |
|------|------|--------|--------|
| **Deep Agents** | Data analysis | 数据分析→Slack报告 | 内置能力 |
| **Deep Agents** | Deep research | 多步研究+子代理+反思 | subagent, reflection |
| **LangChain** | Semantic Search | PDF语义搜索 | Embeddings, VectorStore |
| **LangChain** | RAG Agent | 检索增强生成 | create_retrieval_chain |
| **LangChain** | SQL Agent | 自然语言→SQL→结果 | human-in-the-loop |
| **LangChain** | Voice Agent | 语音交互 | STT, TTS |
| **LangGraph** | Custom RAG | 细粒度RAG控制 | StateGraph, 节点, 边 |
| **LangGraph** | Custom SQL | 最大灵活SQL | 直接LangGraph实现 |

## 多代理模式速查表

| 模式 | 核心思想 | 场景 | 关键词 |
|------|---------|------|--------|
| **Subagents** | 主代理委派任务 | 个人助手 | delegation |
| **Handoffs** | 代理间状态切换 | 客户支持 | state transition |
| **Router** | 查询路由到专业代理 | 知识库 | routing |
| **Skills** | 按需加载技能 | SQL助手 | on-demand loading |

```
多代理模式对比：
                    复杂度    灵活性    适用场景
Subagents           ★★☆      ★★★      任务可并行分解
Handoffs            ★★★      ★★☆      流程有明确阶段
Router              ★☆☆      ★★☆      查询需分发到不同来源
Skills              ★★☆      ★★★      技能按需加载，省token
```

## 概念指南速查

| 概念 | 一句话 |
|------|--------|
| **Memory** | 线程内/跨线程的交互持久化 |
| **Context engineering** | 给AI正确的信息+工具 |
| **Graph API** | 声明式构建状态图 |
| **Functional API** | 一个函数就是一个代理 |

## 框架选择决策

```
简单快速？ → LangChain agent
深度定制？ → LangGraph
内置高级能力？ → Deep Agents
多代理协作？ → Multi-agent 模式
```

## 核心代码模式

### RAG 模式（LangChain）
```python
retriever = vectorstore.as_retriever(search_kwargs={"k": 6})
question_answer_chain = create_stuff_documents_chain(llm, prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)
response = rag_chain.invoke({"input": "问题"})
# response["answer"], response["context"]
```

### RAG 模式（LangGraph）
```python
# 用 StateGraph 自定义每一步
graph = StateGraph(State)
graph.add_node("retrieve", retrieve_node)
graph.add_node("generate", generate_node)
graph.add_edge("retrieve", "generate")
```

### SQL Agent 模式
```python
# 自然语言 → SQL → 执行 → 解释
sql = llm.invoke(f"根据schema生成SQL: {question}")
if human_approve(sql):
    results = db.run(sql)
    answer = llm.invoke(f"解释结果: {results}")
```

### Router 模式
```python
route = router.invoke({"query": question})
agent = agents[route]  # 选择专业代理
response = agent.invoke({"input": question})
```

## 数据流记忆口诀

```
RAG：   问题 → 检索 → 填充上下文 → LLM生成 → 回答+引用
SQL：   问题 → 生成SQL → [审核] → 执行 → 解释结果
搜索：  PDF → 分割 → 嵌入 → 存储 → 查询 → 相似文档
研究：  问题 → 规划 → 子代理执行 → 反思 → 综合报告
路由：  查询 → 路由判断 → 专业代理 → 回答
```
