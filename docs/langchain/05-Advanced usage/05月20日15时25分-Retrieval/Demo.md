# Retrieval 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph langchain-community
```

---

## Demo 1：基础 — 文档加载与分割

```python
from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 模拟文档
docs = [
    "Python 是一种高级编程语言。它以简洁易读的语法著称。",
    "LangChain 是一个用于构建 LLM 应用的框架。它支持多种模型和工具。",
    "向量数据库存储嵌入向量，支持高效的相似性搜索。",
]

# 分割
splitter = RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=10)
chunks = splitter.create_documents(docs)

for i, chunk in enumerate(chunks):
    print(f"块 {i+1}: {chunk.page_content}")
```

---

## Demo 2：嵌入与向量存储

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

# 准备文档
documents = [
    Document(page_content="Python 是一种简洁的编程语言", metadata={"topic": "python"}),
    Document(page_content="LangChain 是 LLM 应用框架", metadata={"topic": "langchain"}),
    Document(page_content="向量数据库支持相似性搜索", metadata={"topic": "vector"}),
    Document(page_content="Agent 可以自主决策和执行任务", metadata={"topic": "agent"}),
]

# 创建向量存储
embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(documents, embeddings)

# 搜索
results = vectorstore.similarity_search("什么是 LangChain？", k=2)
for r in results:
    print(f"结果: {r.page_content} (主题: {r.metadata['topic']})")
```

---

## Demo 3：2-Step RAG

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 知识库
documents = [
    Document(page_content="LangChain 支持 OpenAI、Anthropic 等多种模型。"),
    Document(page_content="LangGraph 用于构建有状态的 Agent 工作流。"),
    Document(page_content="LangSmith 提供追踪和调试功能。"),
]

vectorstore = FAISS.from_documents(documents, OpenAIEmbeddings())
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

# RAG 链
prompt = ChatPromptTemplate.from_template("""
根据以下上下文回答问题。如果上下文中没有相关信息，请说明。

上下文: {context}

问题: {question}

回答:""")

llm = ChatOpenAI(model="gpt-4o-mini")

def format_docs(docs):
    return "\n".join(d.page_content for d in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": lambda x: x}
    | prompt
    | llm
    | StrOutputParser()
)

answer = rag_chain.invoke("LangChain 支持哪些模型？")
print(f"回答: {answer}")
```

---

## Demo 4：Agentic RAG — Agent 决定何时检索

```python
import requests
from langchain.tools import tool
from langchain.agents import create_agent

# 模拟知识库检索
KNOWLEDGE = {
    "python": "Python 3.12 引入了更好的错误消息和性能改进。",
    "langchain": "LangChain 是构建 LLM 应用的框架，支持工具、记忆和 Agent。",
    "agent": "Agent 能够自主决策，使用工具完成复杂任务。",
}

@tool
def search_knowledge(query: str) -> str:
    """搜索知识库获取信息。"""
    results = []
    for key, value in KNOWLEDGE.items():
        if key in query.lower():
            results.append(value)
    return "\n".join(results) if results else "未找到相关信息"

@tool
def fetch_url(url: str) -> str:
    """从 URL 获取文本内容。"""
    try:
        response = requests.get(url, timeout=10.0)
        response.raise_for_status()
        return response.text[:500]
    except Exception as e:
        return f"获取失败: {e}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_knowledge, fetch_url],
    system_prompt="你是助手。需要时使用 search_knowledge 搜索知识库，或用 fetch_url 获取网页。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "LangChain 是什么？"}]})
print(f"回答: {r['messages'][-1].content[:100]}")
```

---

## Demo 5：Agentic RAG — 文档助手

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 模拟文档库
DOCS = {
    "安装": "pip install langchain langchain-openai langgraph",
    "创建Agent": "使用 create_agent(model, tools) 创建 Agent。",
    "工具": "使用 @tool 装饰器定义工具。",
    "记忆": "使用 InMemoryStore 实现长期记忆。",
}

@tool
def search_docs(topic: str) -> str:
    """搜索文档。"""
    for key, value in DOCS.items():
        if topic.lower() in key.lower() or topic.lower() in value.lower():
            return f"【{key}】{value}"
    return "未找到相关文档"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[search_docs],
    system_prompt="你是 LangChain 文档助手。使用 search_docs 搜索文档来回答问题。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "怎么创建 Agent？"}]})
print(f"回答: {r['messages'][-1].content[:100]}")
```

---

## Demo 6：Hybrid RAG — 带查询增强

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pydantic import BaseModel

# 知识库
documents = [
    Document(page_content="Python 是一种解释型、面向对象的高级编程语言。"),
    Document(page_content="Python 3.12 引入了更好的错误消息。"),
    Document(page_content="Python 广泛用于数据科学、Web 开发和自动化。"),
]

vectorstore = FAISS.from_documents(documents, OpenAIEmbeddings())
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

# 1. 查询增强
enhance_prompt = ChatPromptTemplate.from_template("""
将以下用户问题改写为更适合搜索的形式。只返回改写后的问题。

原始问题: {question}

改写后的问题:""")

llm = ChatOpenAI(model="gpt-4o-mini")

enhance_chain = enhance_prompt | llm | StrOutputParser()

# 2. 检索 + 生成
rag_prompt = ChatPromptTemplate.from_template("""
根据上下文回答问题。

上下文: {context}
问题: {question}

回答:""")

def format_docs(docs):
    return "\n".join(d.page_content for d in docs)

# 完整管道
question = "Python 有啥新特性？"

# 步骤1：增强查询
enhanced = enhance_chain.invoke({"question": question})
print(f"增强查询: {enhanced}")

# 步骤2：检索
docs = retriever.invoke(enhanced)
context = format_docs(docs)
print(f"检索到 {len(docs)} 个文档")

# 步骤3：生成
rag_chain = rag_prompt | llm | StrOutputParser()
answer = rag_chain.invoke({"context": context, "question": question})
print(f"回答: {answer}")
```

---

## Demo 7：带验证的 RAG

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 知识库
documents = [
    Document(page_content="LangChain 支持 OpenAI、Anthropic、Google 等模型。"),
    Document(page_content="LangGraph 用于构建有状态的多步 Agent。"),
    Document(page_content="LangSmith 提供 LLM 应用的追踪和评估。"),
]

vectorstore = FAISS.from_documents(documents, OpenAIEmbeddings())
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})
llm = ChatOpenAI(model="gpt-4o-mini")

def format_docs(docs):
    return "\n".join(d.page_content for d in docs)

# 步骤1：检索
question = "LangChain 支持哪些模型？"
docs = retriever.invoke(question)
context = format_docs(docs)

# 步骤2：验证相关性
validate_prompt = ChatPromptTemplate.from_template("""
判断以下文档是否与问题相关。回答 "相关" 或 "不相关"。

问题: {question}
文档: {context}

判断:""")
validate_chain = validate_prompt | llm | StrOutputParser()
validation = validate_chain.invoke({"question": question, "context": context})
print(f"验证: {validation}")

# 步骤3：生成回答
if "相关" in validation:
    rag_prompt = ChatPromptTemplate.from_template("根据上下文回答。\n上下文: {context}\n问题: {question}\n回答:")
    rag_chain = rag_prompt | llm | StrOutputParser()
    answer = rag_chain.invoke({"context": context, "question": question})
    print(f"回答: {answer}")
else:
    print("文档不相关，需要重新检索")
```

---

## 运行说明

1. Demo 1 文档加载与分割
2. Demo 2 嵌入与向量存储
3. Demo 3 2-Step RAG
4. Demo 4 Agentic RAG（Agent 决定何时检索）
5. Demo 5 Agentic RAG（文档助手）
6. Demo 6 Hybrid RAG（查询增强）
7. Demo 7 带验证的 RAG
