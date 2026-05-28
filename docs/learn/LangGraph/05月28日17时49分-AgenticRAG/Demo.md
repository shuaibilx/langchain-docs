# Agentic RAG with LangGraph — 实操 Demo

## 项目结构

```
agentic-rag/
├── rag_agent.py          # 完整代理
├── requirements.txt
└── .env
```

---

## Step 1: 环境准备

### requirements.txt

```txt
langgraph
langchain[openai]
langchain-text-splitters
bs4
requests
```

---

## Step 2: 完整实现

### rag_agent.py

```python
"""Agentic RAG with LangGraph — 自主决定是否检索

图结构:
START → generate_query_or_respond → retrieve → grade_documents
                                              ├── generate_answer → END
                                              └── rewrite_question → generate_query_or_respond
"""

import bs4
import requests
from typing import Literal

from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field


# ============================================================
# 1. 文档预处理
# ============================================================

def load_web_page(url: str) -> list[Document]:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    soup = bs4.BeautifulSoup(response.text, "html.parser")
    return [Document(page_content=soup.get_text(), metadata={"source": url})]


def build_retriever(urls: list[str]):
    """加载文档、分割、索引，返回 retriever。"""
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    docs = [load_web_page(url) for url in urls]
    docs_list = [item for sublist in docs for item in sublist]

    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        chunk_size=100, chunk_overlap=50
    )
    splits = splitter.split_documents(docs_list)

    vectorstore = InMemoryVectorStore.from_documents(splits, OpenAIEmbeddings())
    return vectorstore.as_retriever()


# ============================================================
# 2. 检索工具
# ============================================================

def create_retriever_tool(retriever):
    @tool
    def retrieve_blog_posts(query: str) -> str:
        """Search and return information from blog posts."""
        docs = retriever.invoke(query)
        return "\n\n".join(doc.page_content for doc in docs)

    return retrieve_blog_posts


# ============================================================
# 3. 节点函数
# ============================================================

def create_rag_graph(model_name: str = "gpt-4o-mini", urls: list[str] = None):
    """创建完整的 Agentic RAG 图。"""
    if urls is None:
        urls = [
            "https://lilianweng.github.io/posts/2024-11-28-reward-hacking/",
            "https://lilianweng.github.io/posts/2024-07-07-hallucination/",
        ]

    # 构建组件
    retriever = build_retriever(urls)
    retriever_tool = create_retriever_tool(retriever)
    model = init_chat_model(model_name, temperature=0)

    # --- generate_query_or_respond ---
    def generate_query_or_respond(state: MessagesState):
        response = model.bind_tools([retriever_tool]).invoke(state["messages"])
        return {"messages": [response]}

    # --- grade_documents ---
    class GradeDocuments(BaseModel):
        binary_score: str = Field(description="'yes' if relevant, 'no' if not")

    grader_model = init_chat_model(model_name, temperature=0)

    GRADE_PROMPT = (
        "You are a grader assessing relevance of a retrieved document to a user question.\n"
        "Here is the retrieved document:\n\n{context}\n\n"
        "Here is the user question: {question}\n"
        "Give a binary score 'yes' or 'no' to indicate whether the document is relevant."
    )

    def grade_documents(state: MessagesState) -> Literal["generate_answer", "rewrite_question"]:
        question = state["messages"][0].content
        context = state["messages"][-1].content
        prompt = GRADE_PROMPT.format(question=question, context=context)
        response = grader_model.with_structured_output(GradeDocuments).invoke(
            [{"role": "user", "content": prompt}]
        )
        return "generate_answer" if response.binary_score == "yes" else "rewrite_question"

    # --- rewrite_question ---
    REWRITE_PROMPT = (
        "Look at the input and try to reason about the underlying semantic intent.\n"
        "Here is the initial question:\n ------- \n{question}\n ------- \n"
        "Formulate an improved question:"
    )

    def rewrite_question(state: MessagesState):
        question = state["messages"][0].content
        response = model.invoke([{"role": "user", "content": REWRITE_PROMPT.format(question=question)}])
        return {"messages": [HumanMessage(content=response.content)]}

    # --- generate_answer ---
    GENERATE_PROMPT = (
        "You are an assistant for question-answering tasks. "
        "Use the following pieces of retrieved context to answer the question. "
        "If you don't know the answer, just say that you don't know. "
        "Use three sentences maximum and keep the answer concise.\n"
        "Question: {question}\nContext: {context}"
    )

    def generate_answer(state: MessagesState):
        question = state["messages"][0].content
        context = state["messages"][-1].content
        response = model.invoke([{"role": "user", "content": GENERATE_PROMPT.format(question=question, context=context)}])
        return {"messages": [response]}

    # ============================================================
    # 4. 组装图
    # ============================================================

    def route_on_tool_calls(state: MessagesState):
        if getattr(state["messages"][-1], "tool_calls", None):
            return "tools"
        return END

    workflow = (
        StateGraph(MessagesState)
        .add_node(generate_query_or_respond)
        .add_node("retrieve", ToolNode([retriever_tool]))
        .add_node(rewrite_question)
        .add_node(generate_answer)
        .add_edge(START, "generate_query_or_respond")
        .add_conditional_edges("generate_query_or_respond", route_on_tool_calls, {"tools": "retrieve", END: END})
        .add_conditional_edges("retrieve", grade_documents)
        .add_edge("generate_answer", END)
        .add_edge("rewrite_question", "generate_query_or_respond")
        .compile()
    )

    return workflow


# ============================================================
# 5. 运行
# ============================================================

if __name__ == "__main__":
    graph = create_rag_graph()

    queries = [
        "Hello, how are you?",  # 直接回复
        "What does Lilian Weng say about types of reward hacking?",  # 检索
    ]

    for q in queries:
        print(f"\n{'='*60}")
        print(f"Q: {q}")
        print(f"{'='*60}")

        for chunk in graph.stream({"messages": [{"role": "user", "content": q}]}):
            for node, update in chunk.items():
                msg = update["messages"][-1]
                if hasattr(msg, "content") and msg.content:
                    print(f"\n[{node}] {msg.content[:200]}")
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        print(f"\n[{node}] tool_call: {tc['name']}({tc['args']})")
```

---

## Step 3: 运行

```bash
python rag_agent.py
```

---

## 进阶：添加文档来源

```python
urls = [
    "https://your-blog.com/post-1",
    "https://your-blog.com/post-2",
    "https://your-docs-site.com/api-reference",
]
graph = create_rag_graph(urls=urls)
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 无限循环 | grade 一直返回 "no" | 限制 rewrite 次数或检查文档质量 |
| 检索结果为空 | 文档未索引 | 确认 build_retriever 成功执行 |
| 不调用检索 | 问题太简单 | 正常行为，LLM 直接回答 |
| 结构化输出失败 | 模型不支持 | 用支持 function calling 的模型 |
