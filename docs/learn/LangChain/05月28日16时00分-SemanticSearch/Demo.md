# Semantic Search Engine — 实操 Demo

## 项目结构

```
semantic-search/
├── search_engine.py      # 核心搜索引擎
├── rag_chain.py          # RAG 扩展
├── pdf_loader.py         # PDF 加载工具
├── requirements.txt
├── data/
│   └── nke-10k-2023.pdf  # 示例 PDF（Nike 10-K 年报）
└── output/
    └── chroma_db/        # Chroma 持久化目录
```

---

## Step 1: 环境准备

### requirements.txt

```txt
langchain-core
langchain-text-splitters
langchain-openai
langchain-chroma
langchain-community
pypdf
```

### 环境变量

```bash
# 选择一个嵌入提供商
export OPENAI_API_KEY="sk-..."          # OpenAI
# 或
export GOOGLE_API_KEY="AIzaSy..."       # Google Gemini
```

### 安装

```bash
pip install -r requirements.txt
```

---

## Step 2: PDF 加载器

### pdf_loader.py

```python
"""PDF 文档加载和分割工具"""

from pathlib import Path
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def load_pdf(file_path: str) -> list[Document]:
    """加载 PDF 并按页转换为 Document 对象。"""
    import pypdf

    reader = pypdf.PdfReader(file_path)
    docs = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            docs.append(Document(
                page_content=text,
                metadata={"source": file_path, "page": i},
            ))

    print(f"Loaded {len(docs)} pages from {file_path}")
    return docs


def split_documents(
    docs: list[Document],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[Document]:
    """将文档分割为更小的块。

    Args:
        docs: 原始文档列表
        chunk_size: 每块最大字符数
        chunk_overlap: 块间重叠字符数（防止语义断裂）

    Returns:
        分割后的文档列表
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        add_start_index=True,  # 保留原始位置信息
    )
    splits = splitter.split_documents(docs)
    print(f"Split into {len(splits)} chunks (chunk_size={chunk_size}, overlap={chunk_overlap})")
    return splits


def load_and_split(file_path: str, chunk_size: int = 1000, overlap: int = 200) -> list[Document]:
    """一步完成：加载 + 分割。"""
    docs = load_pdf(file_path)
    return split_documents(docs, chunk_size, overlap)
```

---

## Step 3: 搜索引擎

### search_engine.py

```python
"""语义搜索引擎 — Embeddings + VectorStore + Retriever"""

from pathlib import Path
from langchain_core.documents import Document

# ============================================================
# 嵌入模型选择（取消注释你需要的）
# ============================================================

# OpenAI
from langchain_openai import OpenAIEmbeddings
def get_embeddings():
    return OpenAIEmbeddings(model="text-embedding-3-large")

# Google Gemini
# from langchain_google_genai import GoogleGenerativeAIEmbeddings
# def get_embeddings():
#     return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

# HuggingFace (本地免费)
# from langchain_huggingface import HuggingFaceEmbeddings
# def get_embeddings():
#     return HuggingFaceEmbeddings(
#         model_name="sentence-transformers/all-mpnet-base-v2",
#         encode_kwargs={"normalize_embeddings": True},
#     )

# Ollama (本地免费)
# from langchain_ollama import OllamaEmbeddings
# def get_embeddings():
#     return OllamaEmbeddings(model="llama3")


# ============================================================
# VectorStore 选择
# ============================================================

# In-Memory（最简单，不持久化）
from langchain_core.vectorstores import InMemoryVectorStore
def get_vector_store(embeddings):
    return InMemoryVectorStore(embeddings)

# Chroma（本地持久化）
# from langchain_chroma import Chroma
# def get_vector_store(embeddings):
#     return Chroma(
#         collection_name="pdf_search",
#         embedding_function=embeddings,
#         persist_directory="./output/chroma_db",
#     )


# ============================================================
# 搜索引擎类
# ============================================================

class SemanticSearchEngine:
    """语义搜索引擎封装。"""

    def __init__(self, embeddings=None, vector_store=None):
        self.embeddings = embeddings or get_embeddings()
        self.vector_store = vector_store or get_vector_store(self.embeddings)
        self._retriever = None

    def index_documents(self, documents: list[Document]) -> list[str]:
        """将文档索引到向量存储。"""
        ids = self.vector_store.add_documents(documents)
        print(f"Indexed {len(ids)} documents")
        return ids

    def search(self, query: str, k: int = 3) -> list[Document]:
        """基本相似度搜索。"""
        results = self.vector_store.similarity_search(query, k=k)
        return results

    def search_with_score(self, query: str, k: int = 3) -> list[tuple[Document, float]]:
        """带分数的相似度搜索。分数越低越相似（L2 距离）。"""
        return self.vector_store.similarity_search_with_score(query, k=k)

    def search_by_vector(self, query: str) -> list[Document]:
        """先嵌入查询，再按向量搜索。"""
        embedding = self.embeddings.embed_query(query)
        return self.vector_store.similarity_search_by_vector(embedding)

    def as_retriever(self, search_type="similarity", k=3):
        """转换为 Retriever（Runnable 接口）。"""
        if self._retriever is None:
            self._retriever = self.vector_store.as_retriever(
                search_type=search_type,
                search_kwargs={"k": k},
            )
        return self._retriever

    def batch_search(self, queries: list[str], k: int = 3) -> list[list[Document]]:
        """批量搜索（使用 Retriever 的 batch 接口）。"""
        retriever = self.as_retriever(k=k)
        return retriever.batch(queries)


# ============================================================
# 使用示例
# ============================================================

def demo_basic_search():
    """基础搜索演示。"""
    from pdf_loader import load_and_split

    # 1. 加载和分割 PDF
    pdf_path = "data/nke-10k-2023.pdf"
    if not Path(pdf_path).exists():
        print(f"PDF not found: {pdf_path}")
        print("Using sample documents instead...")
        documents = [
            Document(page_content="NIKE, Inc. was incorporated in 1967 under the laws of the State of Oregon.",
                     metadata={"source": "nike-10k", "page": 3}),
            Document(page_content="In the United States, NIKE has eight significant distribution centers.",
                     metadata={"source": "nike-10k", "page": 4}),
            Document(page_content="NIKE, Inc. Revenues were $51.2 billion in fiscal 2023.",
                     metadata={"source": "nike-10k", "page": 35}),
            Document(page_content="Gross margin decreased 250 basis points to 43.5% for fiscal 2023.",
                     metadata={"source": "nike-10k", "page": 36}),
        ]
    else:
        documents = load_and_split(pdf_path)

    # 2. 创建搜索引擎
    engine = SemanticSearchEngine()

    # 3. 索引文档
    engine.index_documents(documents)

    # 4. 搜索
    print("\n=== 基本搜索 ===")
    results = engine.search("How many distribution centers does Nike have?")
    for i, doc in enumerate(results):
        print(f"\n--- Result {i+1} (page {doc.metadata.get('page', '?')}) ---")
        print(doc.page_content[:300])

    # 5. 带分数搜索
    print("\n=== 带分数搜索 ===")
    scored = engine.search_with_score("What was Nike's revenue in 2023?")
    for doc, score in scored:
        print(f"\nScore: {score:.4f} (page {doc.metadata.get('page', '?')})")
        print(doc.page_content[:200])

    # 6. 批量搜索
    print("\n=== 批量搜索 ===")
    queries = [
        "When was Nike incorporated?",
        "What are Nike's main products?",
        "How did gross margins change?",
    ]
    batch_results = engine.batch_search(queries)
    for query, results in zip(queries, batch_results):
        print(f"\nQ: {query}")
        print(f"A: {results[0].page_content[:150]}...")


if __name__ == "__main__":
    demo_basic_search()
```

---

## Step 4: RAG 扩展

### rag_chain.py

```python
"""RAG 链 — 在语义搜索基础上添加 LLM 生成"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import chain
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI

from search_engine import SemanticSearchEngine


def create_rag_chain(engine: SemanticSearchEngine, k: int = 3):
    """创建 RAG 链：检索 + 生成。"""

    # 1. 检索器
    retriever = engine.as_retriever(k=k)

    # 2. 提示词模板
    prompt = ChatPromptTemplate.from_template("""
Answer the question based on the following context from Nike's 10-K filing.

Context:
{context}

Question: {question}

Instructions:
- Answer based ONLY on the provided context
- If the context doesn't contain the answer, say "I don't have enough information"
- Cite the page number when possible
- Be concise and specific
""")

    # 3. LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # 4. 组合链
    @chain
    def rag(question: str) -> str:
        # 检索相关文档
        docs = retriever.invoke(question)
        # 格式化上下文
        context = "\n\n".join(
            f"[Page {doc.metadata.get('page', '?')}]\n{doc.page_content}"
            for doc in docs
        )
        # 生成回答
        response = llm.invoke(prompt.invoke({
            "context": context,
            "question": question,
        }))
        return response.content

    return rag


def demo_rag():
    """RAG 演示。"""
    from pdf_loader import load_and_split
    from pathlib import Path

    # 加载文档
    pdf_path = "data/nke-10k-2023.pdf"
    if Path(pdf_path).exists():
        documents = load_and_split(pdf_path)
    else:
        documents = [
            Document(page_content="NIKE, Inc. was incorporated in 1967 under the laws of the State of Oregon. Our principal business activity is the design, development and worldwide marketing and selling of athletic footwear, apparel, equipment, accessories and services.",
                     metadata={"source": "nike-10k", "page": 3}),
            Document(page_content="In the United States, NIKE has eight significant distribution centers. U.S. RETAIL STORES: NIKE Brand factory stores 213, NIKE Brand in-line stores 74, Converse stores 82, TOTAL 369.",
                     metadata={"source": "nike-10k", "page": 4}),
            Document(page_content="NIKE, Inc. Revenues were $51.2 billion in fiscal 2023, which increased 10% and 16% compared to fiscal 2022 on a reported and currency-neutral basis, respectively.",
                     metadata={"source": "nike-10k", "page": 35}),
            Document(page_content="Gross margin decreased 250 basis points to 43.5% for fiscal 2023 compared to 46.0% for fiscal 2022. The decrease was primarily due to higher product costs and lower margin in NIKE Direct business.",
                     metadata={"source": "nike-10k", "page": 36}),
        ]

    # 创建引擎和 RAG 链
    engine = SemanticSearchEngine()
    engine.index_documents(documents)
    rag = create_rag_chain(engine, k=2)

    # 提问
    questions = [
        "When was Nike incorporated and what do they do?",
        "How many distribution centers does Nike have in the US?",
        "What was Nike's revenue in fiscal 2023?",
        "Why did Nike's gross margin decrease?",
    ]

    print("=== RAG 问答演示 ===\n")
    for q in questions:
        print(f"Q: {q}")
        answer = rag.invoke(q)
        print(f"A: {answer}\n")
        print("-" * 60)


if __name__ == "__main__":
    demo_rag()
```

---

## Step 5: 运行

```bash
# 基础搜索演示
python search_engine.py

# RAG 问答演示
python rag_chain.py
```

---

## 进阶：选择不同组件

### 嵌入模型对比

| 模型 | 维度 | 价格 | 质量 | 本地运行 |
|------|------|------|------|---------|
| OpenAI text-embedding-3-large | 1536 | $0.13/M tokens | 高 | 否 |
| Google gemini-embedding-001 | 768 | 免费额度 | 高 | 否 |
| HuggingFace all-mpnet-base-v2 | 768 | 免费 | 中 | 是 |
| Ollama llama3 | 4096 | 免费 | 中 | 是 |

### VectorStore 对比

| VectorStore | 安装 | 持久化 | 适用场景 |
|-------------|------|--------|---------|
| InMemoryVectorStore | langchain-core | 否 | 原型测试 |
| Chroma | langchain-chroma | 本地文件 | 本地开发 |
| PGVector | langchain-postgres | PostgreSQL | 已有 PG |
| Pinecone | langchain-pinecone | 云 | 生产环境 |
| Milvus | langchain-milvus | 分布式 | 大规模 |

### 切换到 Chroma（持久化）

```python
from langchain_chroma import Chroma

vector_store = Chroma(
    collection_name="pdf_search",
    embedding_function=embeddings,
    persist_directory="./output/chroma_db",  # 数据保存到磁盘
)

# 下次启动时可以直接加载已有索引
# 无需重新索引 PDF
```

### 切换到 HuggingFace（免费本地）

```python
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-mpnet-base-v2",
    encode_kwargs={"normalize_embeddings": True},
)
# 首次运行会下载模型（~420MB）
# 之后完全本地运行，无需 API Key
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `pypdf` 导入失败 | 未安装 | `pip install pypdf` |
| 嵌入维度不匹配 | 切换了嵌入模型但没重建索引 | 删除旧的 chroma_db 目录 |
| 搜索结果不相关 | chunk_size 太大或太小 | 调整为 500-1500 |
| 中文 PDF 乱码 | PDF 编码问题 | 尝试 `pdfplumber` 替代 `pypdf` |
| Chroma 目录锁冲突 | 多进程访问 | 关闭其他使用同一目录的进程 |
| 内存不足 | 文档太多 | 使用 Chroma 持久化，或减少文档量 |
