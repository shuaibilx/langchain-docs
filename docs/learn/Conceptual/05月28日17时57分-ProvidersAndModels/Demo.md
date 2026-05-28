# Providers and Models — 速查参考

## 快速切换提供商

```python
from langchain.chat_models import init_chat_model

# 一行切换
model = init_chat_model("openai:gpt-4o-mini")           # OpenAI
model = init_chat_model("anthropic:claude-sonnet-4-6")   # Anthropic
model = init_chat_model("google_genai:gemini-2.5-flash") # Google
model = init_chat_model("ollama:llama3")                  # 本地 Ollama
model = init_chat_model("openrouter:anthropic/claude-sonnet-4-6")  # OpenRouter
```

## 安装包对照

```bash
pip install langchain-openai        # OpenAI
pip install langchain-anthropic     # Anthropic
pip install langchain-google-genai  # Google Gemini
pip install langchain-aws           # AWS Bedrock
pip install langchain-ollama        # Ollama (本地)
pip install langchain-groq          # Groq (快速推理)
pip install langchain-openrouter    # OpenRouter (多提供商)
```

## 统一接口

```python
model = init_chat_model("any-provider:any-model")

# 所有提供商通用
model.invoke("Hello")                    # 同步调用
model.stream("Hello")                    # 流式调用
model.bind_tools([tool])                 # 绑定工具
model.with_structured_output(Schema)     # 结构化输出
```

## OpenAI 兼容端点

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    base_url="https://your-provider.com/v1",
    api_key="your-key",
    model="model-name",
)
```

## 本地免费方案

| 方案 | 安装 | 模型 |
|------|------|------|
| Ollama | ollama.com | llama3, mistral, codellama |
| HuggingFace | langchain-huggingface | 各种开源模型 |
| Fake | langchain-core | DeterministicFakeEmbedding (测试用) |
