# Install LangChain - Demo

## Demo 1: 使用 pip 安装

```bash
# 安装核心包
pip install -U langchain

# 验证安装
python -c "import langchain; print(langchain.__version__)"
```

## Demo 2: 使用 uv 安装

```bash
# 初始化项目
uv init my-langchain-app
cd my-langchain-app

# 安装核心包
uv add langchain

# 同步依赖
uv sync
```

## Demo 3: 安装提供商集成

```bash
# OpenAI
pip install -U langchain-openai

# Anthropic
pip install -U langchain-anthropic

# Google Gemini
pip install -U langchain-google-genai

# Ollama（本地模型）
pip install -U langchain-ollama
```

## Demo 4: 一次性安装多个

```bash
pip install -U langchain langchain-openai langchain-anthropic
```

```bash
# uv 方式
uv add langchain langchain-openai langchain-anthropic
```

## Demo 5: 设置 LangSmith 追踪

```bash
# 设置环境变量
export LANGSMITH_TRACING="true"
export LANGSMITH_API_KEY="lsv2_..."

# 或永久存储
echo 'LANGSMITH_TRACING="true"' >> ~/.env
echo 'LANGSMITH_API_KEY="lsv2_..."' >> ~/.env
```

## Demo 6: 验证完整安装

```python
# test_install.py
import langchain
print(f"LangChain version: {langchain.__version__}")

# 测试 OpenAI 集成
try:
    from langchain_openai import ChatOpenAI
    print("OpenAI integration: OK")
except ImportError:
    print("OpenAI integration: NOT INSTALLED")

# 测试 Anthropic 集成
try:
    from langchain_anthropic import ChatAnthropic
    print("Anthropic integration: OK")
except ImportError:
    print("Anthropic integration: NOT INSTALLED")

# 测试核心 agent
try:
    from langchain.agents import create_agent
    print("Agent module: OK")
except ImportError:
    print("Agent module: NOT INSTALLED")
```

```bash
python test_install.py
```
