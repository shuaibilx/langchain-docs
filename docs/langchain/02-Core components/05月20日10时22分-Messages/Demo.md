# Messages 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai
```

```bash
export OPENAI_API_KEY="your-api-key"
```

---

## Demo 1：四种消息类型基础

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

model = init_chat_model("gpt-4o-mini")

# 1. SystemMessage — 设定角色
system = SystemMessage("你是一个专业的 Python 教师，回答要简洁。")

# 2. HumanMessage — 用户输入
human = HumanMessage("什么是列表推导式？")

# 组合调用
response = model.invoke([system, human])

# 3. AIMessage — 模型输出
print(f"类型: {type(response).__name__}")
print(f"内容: {response.content[:100]}...")
print(f"Token 用量: {response.usage_metadata}")

# 4. ToolMessage — 后续 Demo 展示
```

---

## Demo 2：多轮对话（消息历史）

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage, AIMessage

model = init_chat_model("gpt-4o-mini")

# 手动构建对话历史
messages = [
    SystemMessage("你是一个友好的助手。"),
    HumanMessage("我叫小明"),
    AIMessage("你好小明！很高兴认识你。"),
    HumanMessage("你还记得我的名字吗？"),
]

response = model.invoke(messages)
print(response.content)
# 模型会从历史中知道用户叫小明
```

---

## Demo 3：字典格式 vs 消息对象

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage

model = init_chat_model("gpt-4o-mini")

# 方式一：字典格式（OpenAI 风格）
dict_messages = [
    {"role": "system", "content": "你是翻译助手"},
    {"role": "user", "content": "把'你好'翻译成英文"},
]
r1 = model.invoke(dict_messages)
print(f"字典格式: {r1.content}")

# 方式二：消息对象
obj_messages = [
    SystemMessage("你是翻译助手"),
    HumanMessage("把'你好'翻译成英文"),
]
r2 = model.invoke(obj_messages)
print(f"消息对象: {r2.content}")

# 两者完全等价
```

---

## Demo 4：AIMessage 属性详解

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")
response = model.invoke("解释什么是递归")

# 基本属性
print(f"text: {response.text[:80]}...")
print(f"content 类型: {type(response.content)}")
print(f"id: {response.id}")

# 使用元数据
if response.usage_metadata:
    meta = response.usage_metadata
    print(f"输入 token: {meta.get('input_tokens')}")
    print(f"输出 token: {meta.get('output_tokens')}")
    print(f"总 token: {meta.get('total_tokens')}")

# 响应元数据
print(f"response_metadata keys: {list(response.response_metadata.keys())}")

# 内容块
print(f"content_blocks 数量: {len(response.content_blocks)}")
for block in response.content_blocks:
    print(f"  类型: {block['type']}, 内容: {str(block)[:60]}...")
```

---

## Demo 5：流式消息（AIMessageChunk）

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o-mini")

# 流式接收
chunks = []
full_message = None

for chunk in model.stream("写一首关于春天的五言绝句"):
    chunks.append(chunk)
    print(chunk.text, end="", flush=True)
    # 累积完整消息
    full_message = chunk if full_message is None else full_message + chunk

print(f"\n\n--- 统计 ---")
print(f"收到 {len(chunks)} 个 chunk")
print(f"完整消息长度: {len(full_message.text)} 字符")
print(f"完整消息类型: {type(full_message).__name__}")

# AIMessageChunk 可以像 AIMessage 一样使用
print(f"content_blocks: {len(full_message.content_blocks)}")
```

---

## Demo 6：手动工具调用循环（ToolMessage）

```python
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langchain.messages import HumanMessage, ToolMessage

@tool
def get_weather(location: str) -> str:
    """获取天气。"""
    data = {"北京": "晴 25°C", "上海": "多云 22°C"}
    return data.get(location, "未知")

model = init_chat_model("gpt-4o-mini")
model_with_tools = model.bind_tools([get_weather])

# 第 1 步：模型返回工具调用
messages = [HumanMessage("北京天气如何？")]
ai_msg = model_with_tools.invoke(messages)
messages.append(ai_msg)

print("模型请求的工具调用:")
for tc in ai_msg.tool_calls:
    print(f"  {tc['name']}({tc['args']})")

# 第 2 步：执行工具，创建 ToolMessage
for tc in ai_msg.tool_calls:
    result = get_weather.invoke(tc)
    # 创建 ToolMessage，tool_call_id 必须匹配
    tool_msg = ToolMessage(
        content=result,
        tool_call_id=tc["id"],
        name=tc["name"]
    )
    messages.append(tool_msg)
    print(f"ToolMessage: {tool_msg.content}")

# 第 3 步：模型根据工具结果回答
final = model_with_tools.invoke(messages)
print(f"\n最终回答: {final.content}")
```

---

## Demo 7：ToolMessage 的 artifact 字段

```python
from langchain.messages import ToolMessage

# content — 发送给模型的内容
content = "Python 是一种解释型编程语言，由 Guido van Rossum 创建。"

# artifact — 不发送给模型，但程序可访问
artifact = {
    "source": "wikipedia",
    "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
    "retrieved_at": "2026-05-20",
    "confidence": 0.95
}

tool_msg = ToolMessage(
    content=content,
    tool_call_id="call_123",
    name="search_docs",
    artifact=artifact,
)

print(f"发送给模型: {tool_msg.content}")
print(f"程序可访问: {tool_msg.artifact}")
print(f"来源: {tool_msg.artifact['source']}")
print(f"置信度: {tool_msg.artifact['confidence']}")
```

---

## Demo 8：HumanMessage 元数据

```python
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage

model = init_chat_model("gpt-4o-mini")

# 带元数据的消息
msg = HumanMessage(
    content="你好！",
    name="alice",      # 标识用户
    id="msg_001"       # 唯一标识符
)

print(f"内容: {msg.content}")
print(f"名称: {msg.name}")
print(f"ID: {msg.id}")

# 多用户场景
messages = [
    HumanMessage("我是管理员", name="admin"),
    HumanMessage("请帮我查看日志", name="admin"),
    HumanMessage("我是普通用户", name="user1"),
    HumanMessage("请帮我重置密码", name="user1"),
]

response = model.invoke(messages)
print(response.content[:100])
```

---

## Demo 9：多模态输入 — 图片

```python
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage

model = init_chat_model("gpt-4o-mini")

# 从 URL 输入图片
message = HumanMessage(content=[
    {"type": "text", "text": "这张图片里有什么？请详细描述。"},
    {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg"}},
])

response = model.invoke([message])
print(response.content)

# 使用标准内容块格式
message_v1 = HumanMessage(content_blocks=[
    {"type": "text", "text": "这张图片里有什么？"},
    {"type": "image", "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg"},
])

response = model.invoke([message_v1])
print(response.content)
```

---

## Demo 10：多模态输入 — PDF 文档

```python
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage

model = init_chat_model("gpt-4o-mini")

# 从 URL 输入 PDF
message = HumanMessage(content=[
    {"type": "text", "text": "总结这个文档的主要内容。"},
    {"type": "file", "url": "https://example.com/sample.pdf"},
])

# 从 base64 输入 PDF（本地文件场景）
import base64

# 读取本地 PDF
with open("document.pdf", "rb") as f:
    pdf_base64 = base64.b64encode(f.read()).decode()

message = HumanMessage(content=[
    {"type": "text", "text": "总结这个文档的主要内容。"},
    {
        "type": "file",
        "base64": pdf_base64,
        "mime_type": "application/pdf",
    },
])

# response = model.invoke([message])
# print(response.content)
```

---

## Demo 11：content_blocks 属性（标准化访问）

```python
from langchain.chat_models import init_chat_model
from langchain.messages import AIMessage

model = init_chat_model("gpt-4o-mini")
response = model.invoke("什么是机器学习？")

# 通过 content_blocks 统一访问
print("=== 内容块 ===")
for block in response.content_blocks:
    block_type = block["type"]

    if block_type == "text":
        print(f"[文本] {block['text'][:80]}...")
    elif block_type == "reasoning":
        print(f"[推理] {block['reasoning'][:80]}...")
    else:
        print(f"[{block_type}] {str(block)[:80]}...")

# 对比原始 content
print(f"\n=== 原始 content ===")
print(f"类型: {type(response.content)}")
if isinstance(response.content, list):
    for item in response.content:
        if isinstance(item, dict):
            print(f"  type={item.get('type')}: {str(item)[:60]}...")
        else:
            print(f"  {str(item)[:60]}...")
```

---

## Demo 12：对话历史管理实践

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage, AIMessage

model = init_chat_model("gpt-4o-mini")

class ConversationManager:
    def __init__(self, model, system_prompt="你是一个有帮助的助手。"):
        self.model = model
        self.messages = [SystemMessage(system_prompt)]

    def chat(self, user_input: str) -> str:
        """发送消息并获取回复。"""
        self.messages.append(HumanMessage(user_input))
        response = self.model.invoke(self.messages)
        self.messages.append(AIMessage(response.content))
        return response.content

    def get_history(self) -> list:
        """获取对话历史。"""
        return [
            {"role": type(m).__name__, "content": m.content[:50]}
            for m in self.messages
        ]

    def clear(self):
        """清空对话历史（保留系统提示）。"""
        self.messages = self.messages[:1]

# 使用
conv = ConversationManager(model, "你是一个 Python 导师。")

print(conv.chat("什么是变量？"))
print(conv.chat("它和常量有什么区别？"))
print(conv.chat("给我一个例子"))

print("\n=== 对话历史 ===")
for item in conv.get_history():
    print(f"  {item['role']}: {item['content']}...")
```

---

## 运行说明

1. 确保安装了依赖并设置了 API Key
2. Demo 1-5 基础消息操作，建议先跑
3. Demo 6-7 工具消息，与 Agents 文档关联
4. Demo 8 元数据，实际项目常用
5. Demo 9-10 多模态，需要可访问的图片/PDF URL
6. Demo 11-12 进阶用法
