# Long-term Memory 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础 — Store 读写

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 写入
namespace = ("users",)
store.put(namespace, "user_001", {"name": "小明", "language": "中文"})
store.put(namespace, "user_002", {"name": "John", "language": "English"})

# 读取
item = store.get(namespace, "user_001")
print(f"读取: {item.value}")

# 搜索
items = store.search(namespace, filter={"language": "中文"})
for item in items:
    print(f"搜索结果: {item.value}")
```

---

## Demo 2：工具读取长期记忆

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langgraph.store.memory import InMemoryStore

@dataclass
class Context:
    user_id: str

store = InMemoryStore()
store.put(("users",), "user_001", {"name": "小明", "language": "中文", "style": "简洁"})
store.put(("users",), "user_002", {"name": "John", "language": "English", "style": "detailed"})

@tool
def get_user_info(runtime: ToolRuntime[Context]) -> str:
    """获取用户信息。"""
    user_id = runtime.context.user_id
    user_info = runtime.store.get(("users",), user_id)
    if user_info:
        return f"用户: {user_info.value['name']}, 语言: {user_info.value['language']}, 风格: {user_info.value['style']}"
    return "未知用户"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[get_user_info],
    store=store,
    context_schema=Context,
)

r = agent.invoke(
    {"messages": [{"role": "user", "content": "查找我的信息"}]},
    context=Context(user_id="user_001")
)
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## Demo 3：工具写入长期记忆

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langgraph.store.memory import InMemoryStore
from typing_extensions import TypedDict

store = InMemoryStore()

@dataclass
class Context:
    user_id: str

class UserInfo(TypedDict):
    name: str
    language: str

@tool
def save_user_info(user_info: UserInfo, runtime: ToolRuntime[Context]) -> str:
    """保存用户信息。"""
    user_id = runtime.context.user_id
    runtime.store.put(("users",), user_id, dict(user_info))
    return f"已保存: {user_info}"

@tool
def get_user_info(runtime: ToolRuntime[Context]) -> str:
    """获取用户信息。"""
    user_id = runtime.context.user_id
    info = runtime.store.get(("users",), user_id)
    return str(info.value) if info else "未找到"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_user_info, get_user_info],
    store=store,
    context_schema=Context,
)

# 保存
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫小明，说中文"}]},
    context=Context(user_id="user_001")
)
print(f"保存: {r['messages'][-1].content[:60]}")

# 读取
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我的信息是什么？"}]},
    context=Context(user_id="user_001")
)
print(f"读取: {r['messages'][-1].content[:60]}")

# 直接访问 Store
item = store.get(("users",), "user_001")
print(f"Store 直接读取: {item.value}")
```

---

## Demo 4：命名空间层级组织

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 用户信息
store.put(("users",), "user_001", {"name": "小明", "role": "admin"})
store.put(("users",), "user_002", {"name": "John", "role": "user"})

# 用户偏好
store.put(("prefs", "user_001"), "theme", {"value": "dark"})
store.put(("prefs", "user_001"), "language", {"value": "中文"})
store.put(("prefs", "user_002"), "theme", {"value": "light"})

# 对话历史
store.put(("conversations", "user_001"), "conv_001", {"topic": "Python学习", "turns": 5})

# 读取
print(f"用户: {store.get(('users',), 'user_001').value}")
print(f"主题: {store.get(('prefs', 'user_001'), 'theme').value}")
print(f"对话: {store.get(('conversations', 'user_001'), 'conv_001').value}")

# 搜索某个命名空间下的所有记忆
items = store.search(("prefs", "user_001"))
for item in items:
    print(f"偏好: {item.key} = {item.value}")
```

---

## Demo 5：带嵌入的语义搜索

```python
from collections.abc import Sequence
from langgraph.store.base import IndexConfig
from langgraph.store.memory import InMemoryStore

def mock_embed(texts: Sequence[str]) -> list[list[float]]:
    """模拟嵌入函数。实际使用时替换为真实的嵌入模型。"""
    # 简单的字符编码模拟
    results = []
    for text in texts:
        vec = [float(ord(c) % 10) / 10 for c in text[:2]]
        vec.extend([0.0] * (2 - len(vec)))
        results.append(vec)
    return results

store = InMemoryStore(index=IndexConfig(embed=mock_embed, dims=2))

# 写入多条记忆
store.put(("docs",), "python_intro", {"content": "Python 是一种简洁的编程语言", "topic": "python"})
store.put(("docs",), "langchain_intro", {"content": "LangChain 是 LLM 应用框架", "topic": "langchain"})
store.put(("docs",), "python_async", {"content": "Python 异步编程使用 async/await", "topic": "python"})

# 语义搜索
items = store.search(("docs",), query="Python 编程")
print("语义搜索 'Python 编程':")
for item in items:
    print(f"  {item.key}: {item.value['content'][:30]}")

# 带过滤的搜索
items = store.search(("docs",), filter={"topic": "python"})
print("\n过滤搜索 topic=python:")
for item in items:
    print(f"  {item.key}: {item.value['content'][:30]}")
```

---

## Demo 6：完整实战 — 用户画像系统

```python
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langgraph.store.memory import InMemoryStore
from typing_extensions import TypedDict

store = InMemoryStore()

@dataclass
class Context:
    user_id: str

class UserProfile(TypedDict):
    name: str
    interests: list[str]
    communication_style: str

@tool
def save_profile(profile: UserProfile, runtime: ToolRuntime[Context]) -> str:
    """保存用户画像。"""
    uid = runtime.context.user_id
    runtime.store.put(("users",), uid, dict(profile))
    return f"画像已保存: {profile['name']}"

@tool
def get_profile(runtime: ToolRuntime[Context]) -> str:
    """获取用户画像。"""
    uid = runtime.context.user_id
    info = runtime.store.get(("users",), uid)
    if info:
        p = info.value
        return f"姓名: {p.get('name')}, 兴趣: {p.get('interests')}, 风格: {p.get('communication_style')}"
    return "未找到画像"

@tool
def save_memory(key: str, content: str, runtime: ToolRuntime[Context]) -> str:
    """保存一条记忆。"""
    uid = runtime.context.user_id
    existing = runtime.store.get(("memories",), uid)
    memories = existing.value if existing else {}
    memories[key] = content
    runtime.store.put(("memories",), uid, memories)
    return f"记忆已保存: {key}"

@tool
def recall_memory(query: str, runtime: ToolRuntime[Context]) -> str:
    """回忆记忆。"""
    uid = runtime.context.user_id
    info = runtime.store.get(("memories",), uid)
    if info:
        memories = info.value
        results = [f"{k}: {v}" for k, v in memories.items() if query.lower() in k.lower() or query.lower() in v.lower()]
        return "\n".join(results) if results else "未找到相关记忆"
    return "暂无记忆"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[save_profile, get_profile, save_memory, recall_memory],
    store=store,
    context_schema=Context,
)

config = {"configurable": {"thread_id": "memory-1"}}

# 保存画像
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫小明，喜欢 Python 和 AI，喜欢简洁的回答"}]},
    context=Context(user_id="user_001")
)
print(f"画像: {r['messages'][-1].content[:60]}")

# 保存记忆
r = agent.invoke(
    {"messages": [{"role": "user", "content": "记住：我正在学习 LangChain"}]},
    context=Context(user_id="user_001")
)
print(f"记忆: {r['messages'][-1].content[:60]}")

# 回忆
r = agent.invoke(
    {"messages": [{"role": "user", "content": "我之前在学什么？"}]},
    context=Context(user_id="user_001")
)
print(f"回忆: {r['messages'][-1].content[:60]}")
```

---

## Demo 7：多用户隔离

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 用户 A 的数据
store.put(("users",), "user_A", {"name": "小明", "lang": "中文"})
store.put(("prefs",), "user_A", {"theme": "dark"})

# 用户 B 的数据
store.put(("users",), "user_B", {"name": "John", "lang": "English"})
store.put(("prefs",), "user_B", {"theme": "light"})

# 各自读取自己的数据
a = store.get(("users",), "user_A")
b = store.get(("users",), "user_B")

print(f"用户 A: {a.value}")
print(f"用户 B: {b.value}")

# 搜索不会跨用户泄露
items = store.search(("users",))
print(f"\n所有用户:")
for item in items:
    print(f"  {item.key}: {item.value}")
```

---

## 运行说明

1. Demo 1 基础 Store 读写
2. Demo 2 工具读取长期记忆
3. Demo 3 工具写入长期记忆
4. Demo 4 命名空间层级组织
5. Demo 5 语义搜索
6. Demo 6 完整实战
7. Demo 7 多用户隔离
