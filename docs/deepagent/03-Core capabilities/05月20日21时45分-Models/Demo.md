# 模型 - Demo

## Demo 1: 使用模型字符串（最简方式）

```python
from deepagents import create_deep_agent

# 使用 provider:model 格式
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[internet_search],
    system_prompt="You are a helpful assistant.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "Hello!"}]})
```

## Demo 2: 使用不同提供商

```python
from deepagents import create_deep_agent

# Anthropic
agent_anthropic = create_deep_agent(model="anthropic:claude-sonnet-4-6")

# OpenAI
agent_openai = create_deep_agent(model="openai:gpt-5.4")

# Google
agent_google = create_deep_agent(model="google_genai:gemini-3.1-pro-preview")

# 开源权重（通过 Baseten）
agent_glm = create_deep_agent(model="baseten:zai-org/GLM-5")

# 开源权重（通过 Ollama 本地）
agent_local = create_deep_agent(model="ollama:minimax-m2.7:cloud")

# 开源权重（通过 OpenRouter）
agent_deepseek = create_deep_agent(model="openrouter:deepseek/deepseek-v4-flash")
```

## Demo 3: 使用 init_chat_model 配置参数

```python
from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent

# 通过 init_chat_model 传递自定义参数
model = init_chat_model(
    model="google_genai:gemini-3.1-pro-preview",
    thinking_level="medium",           # 自定义推理级别
    temperature=0.7,                    # 自定义温度
)
agent = create_deep_agent(model=model)
```

## Demo 4: 使用提供商包直接实例化

```python
from langchain_google_genai import ChatGoogleGenerativeAI
from deepagents import create_deep_agent

# 直接使用提供商类，完全控制所有参数
model = ChatGoogleGenerativeAI(
    model="gemini-3.1-pro-preview",
    thinking_level="medium",
    temperature=0.5,
    max_tokens=4096,
)
agent = create_deep_agent(model=model)
```

## Demo 5: Provider Profile（两级注册）

```python
from deepagents import create_deep_agent, ProviderProfile, register_provider_profile

# Provider 级：所有 OpenAI 模型默认 temperature=0
register_provider_profile(
    "openai",
    ProviderProfile(init_kwargs={"temperature": 0}),
)

# Model 级：gpt-5.4 额外设置推理努力程度
# 继承上面的 temperature=0
register_provider_profile(
    "openai:gpt-5.4",
    ProviderProfile(init_kwargs={"reasoning_effort": "medium"}),
)

# 使用时自动应用
agent_default = create_deep_agent(model="openai:gpt-4o")
# → temperature=0（来自 provider 级）

agent_gpt54 = create_deep_agent(model="openai:gpt-5.4")
# → temperature=0 + reasoning_effort="medium"（两级合并）

# 注意：Provider Profile 不适用于模型实例
model = init_chat_model("openai:gpt-5.4", temperature=0.9)
agent_custom = create_deep_agent(model=model)
# → temperature=0.9（Provider Profile 不生效）
```

## Demo 6: 运行时动态切换模型

```python
from dataclasses import dataclass
from langchain.chat_models import init_chat_model
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from deepagents import create_deep_agent
from typing import Callable

@dataclass
class Context:
    model: str  # 用户选择的模型

@wrap_model_call
def configurable_model(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse],
) -> ModelResponse:
    # 从运行时上下文获取用户选择的模型
    model_name = request.runtime.context.model
    # 创建新模型实例
    model = init_chat_model(model_name)
    # 覆盖当前请求的模型
    return handler(request.override(model=model))

agent = create_deep_agent(
    model="google_genai:gemini-3.1-pro-preview",  # 默认模型
    middleware=[configurable_model],
    context_schema=Context,
)

# 用户选择 GPT-5.4
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Hello!"}]},
    context=Context(model="openai:gpt-5.4"),  # 运行时覆盖
)

# 同一代理，另一个用户选择 Claude
result2 = agent.invoke(
    {"messages": [{"role": "user", "content": "Hi!"}]},
    context=Context(model="anthropic:claude-sonnet-4-6"),  # 不同模型
)
```

## Demo 7: Harness Profile vs Provider Profile 对比

```python
from deepagents import (
    create_deep_agent,
    HarnessProfile,
    ProviderProfile,
    register_harness_profile,
    register_provider_profile,
)

# Provider Profile：控制模型初始化参数
register_provider_profile(
    "openai",
    ProviderProfile(init_kwargs={"temperature": 0}),
)

# Harness Profile：控制代理行为
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        system_prompt_suffix="Be concise. Respond in under 100 words.",
        excluded_tools=frozenset({"execute"}),  # 禁用 execute 工具
    ),
)

# 创建代理时两者同时生效
agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[internet_search],
)
# → temperature=0（Provider Profile）
# → 系统提示追加 "Be concise..."（Harness Profile）
# → 没有 execute 工具（Harness Profile）
```

## Demo 8: 基于复杂度的动态路由

```python
from dataclasses import dataclass
from langchain.chat_models import init_chat_model
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from deepagents import create_deep_agent
from typing import Callable

@dataclass
class Context:
    complexity: str  # "simple" 或 "complex"

@wrap_model_call
def cost_optimized_model(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse],
) -> ModelResponse:
    complexity = request.runtime.context.complexity
    if complexity == "simple":
        # 简单任务用便宜模型
        model = init_chat_model("openai:gpt-4o-mini")
    else:
        # 复杂任务用强模型
        model = init_chat_model("anthropic:claude-opus-4-6")
    return handler(request.override(model=model))

agent = create_deep_agent(
    model="openai:gpt-4o-mini",  # 默认便宜模型
    middleware=[cost_optimized_model],
    context_schema=Context,
)

# 简单查询 → gpt-4o-mini
agent.invoke(
    {"messages": [{"role": "user", "content": "What is 2+2?"}]},
    context=Context(complexity="simple"),
)

# 复杂查询 → claude-opus-4-6
agent.invoke(
    {"messages": [{"role": "user", "content": "Design a distributed system..."}]},
    context=Context(complexity="complex"),
)
```
