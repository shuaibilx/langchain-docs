# Local Server 功能 Demo

## 环境准备

```bash
pip install -U "langgraph-cli[inmem]" langgraph-sdk
```

```bash
export LANGSMITH_API_KEY="your-api-key"
```

---

## Demo 1：创建 LangGraph 应用

```bash
# 从模板创建
langgraph new my-agent-app --template new-langgraph-project-python

# 进入目录
cd my-agent-app

# 安装依赖
pip install -e .

# 创建 .env 文件
echo "LANGSMITH_API_KEY=lsv2..." > .env
```

---

## Demo 2：启动本地服务器

```bash
# 启动（内存模式）
langgraph dev

# 输出示例：
# - 🚀 API: http://127.0.0.1:2024
# - 🎨 Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
# - 📚 API Docs: http://127.0.0.1:2024/docs
```

---

## Demo 3：Python SDK 异步测试

```python
from langgraph_sdk import get_client
import asyncio

client = get_client(url="http://localhost:2024")

async def main():
    async for chunk in client.runs.stream(
        None,  # 无线程运行
        "agent",
        input={
            "messages": [{
                "role": "human",
                "content": "What is LangGraph?",
            }],
        },
    ):
        print(f"事件类型: {chunk.event}")
        print(chunk.data)
        print()

asyncio.run(main())
```

---

## Demo 4：Python SDK 同步测试

```python
from langgraph_sdk import get_sync_client

client = get_sync_client(url="http://localhost:2024")

for chunk in client.runs.stream(
    None,
    "agent",
    input={
        "messages": [{
            "role": "human",
            "content": "What is LangGraph?",
        }],
    },
    stream_mode="messages-tuple",
):
    print(f"事件类型: {chunk.event}")
    print(chunk.data)
    print()
```

---

## Demo 5：REST API 测试

```bash
curl -s --request POST \
    --url "http://localhost:2024/runs/stream" \
    --header 'Content-Type: application/json' \
    --data '{
        "assistant_id": "agent",
        "input": {
            "messages": [
                {
                    "role": "human",
                    "content": "What is LangGraph?"
                }
            ]
        },
        "stream_mode": "messages-tuple"
    }'
```

---

## Demo 6：自定义端口启动

```bash
# 使用自定义端口
langgraph dev --port 3000

# Studio URL 变为：
# https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:3000
```

---

## Demo 7：Safari 兼容（隧道模式）

```bash
# 创建安全隧道
langgraph dev --tunnel

# 输出会包含一个公网 URL，Safari 可以访问
```

---

## 运行说明

1. Demo 1 创建应用（bash 命令）
2. Demo 2 启动服务器（bash 命令）
3. Demo 3-4 Python SDK 测试（需要服务器运行）
4. Demo 5 REST API 测试（需要服务器运行）
5. Demo 6-7 高级选项
