# Component Architecture — 速查参考

## 组件导入速查

```python
# Models
from langchain.chat_models import init_chat_model

# Tools
from langchain.tools import tool

# Agents
from langchain.agents import create_agent

# Memory
from langgraph.checkpoint.memory import InMemorySaver

# Document Loaders
from langchain_community.document_loaders import PyPDFLoader

# Text Splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Embeddings
from langchain_openai import OpenAIEmbeddings

# Vector Stores
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_chroma import Chroma

# Retrievers
retriever = vector_store.as_retriever()
```

## 三种模式的代码骨架

### RAG

```python
# 1. 加载 + 分割
docs = PyPDFLoader("file.pdf").load()
splits = RecursiveCharacterTextSplitter(chunk_size=1000).split_documents(docs)

# 2. 索引
vector_store = InMemoryVectorStore.from_documents(splits, OpenAIEmbeddings())

# 3. 检索 + 生成
retriever = vector_store.as_retriever()
docs = retriever.invoke("question")
response = model.invoke(f"Context: {docs}\nQuestion: question")
```

### Agent + Tools

```python
@tool
def search(query: str) -> str:
    """Search the web."""
    return api.search(query)

agent = create_agent(model, tools=[search])
result = agent.invoke({"messages": [{"role": "user", "content": "question"}]})
```

### Multi-agent

```python
from langchain.agents import create_agent

worker = create_agent(model, tools=[...], system_prompt="You are a specialist...")
supervisor = create_agent(model, tools=[wrap_as_tool(worker)])
```

## 组件关系图

```
Agents ──→ Models (推理)
  │          │
  ├──→ Tools (外部能力)
  │          │
  ├──→ Retrievers (信息检索)
  │          │
  └──→ Memory (状态保持)
              │
              ▼
         Vector Stores ←── Embeddings ←── Documents ←── Loaders ←── Splitters
```
