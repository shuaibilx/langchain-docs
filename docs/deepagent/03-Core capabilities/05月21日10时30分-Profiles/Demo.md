# Profiles - Demo

## Demo 1: 基础 HarnessProfile

```python
from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    register_harness_profile,
)

register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        system_prompt_suffix="Respond in under 100 words.",
        excluded_tools={"execute"},
        excluded_middleware={"SummarizationMiddleware"},
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ),
)
```

## Demo 2: 提供商级 Profile

```python
from deepagents import HarnessProfile, register_harness_profile

# 适用于所有 OpenAI 模型
register_harness_profile(
    "openai",
    HarnessProfile(
        system_prompt_suffix="You are powered by OpenAI. Be concise.",
    ),
)
```

## Demo 3: 模型级 Profile 覆盖

```python
from deepagents import HarnessProfile, register_harness_profile

# 提供商级
register_harness_profile(
    "openai",
    HarnessProfile(
        system_prompt_suffix="Be concise.",
    ),
)

# 模型级覆盖
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        system_prompt_suffix="Be very concise. Max 50 words.",  # 覆盖
        excluded_tools={"execute"},  # 新增
    ),
)
# gpt-5.4 获得 "Be very concise. Max 50 words." + excluded_tools
# 其他 OpenAI 模型获得 "Be concise."
```

## Demo 4: 工具描述覆盖

```python
from deepagents import HarnessProfile, register_harness_profile

register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        tool_description_overrides={
            "edit_file": "Edit files with care. Prefer small, focused changes.",
            "write_file": "Create new files only. Use edit_file for modifications.",
        },
    ),
)
```

## Demo 5: 排除工具

```python
from deepagents import HarnessProfile, register_harness_profile

register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        excluded_tools={"execute", "grep"},  # 从模型隐藏这些工具
    ),
)
```

## Demo 6: 配置 GP Subagent

```python
from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    register_harness_profile,
)

# 禁用 GP subagent
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ),
)

# 重命名 GP subagent
register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(
            name="helper",
            system_prompt="You are a helpful assistant.",
        ),
    ),
)
```

## Demo 7: ProviderProfile

```python
from deepagents import ProviderProfile, register_provider_profile

# 静态 kwargs
register_provider_profile(
    "openai",
    ProviderProfile(init_kwargs={"temperature": 0}),
)

# 凭证检查
register_provider_profile(
    "anthropic",
    ProviderProfile(
        pre_init=lambda model: check_anthropic_key(),
        init_kwargs={"max_tokens": 4096},
    ),
)
```

## Demo 8: 从 YAML 加载 Profile

```yaml
# openai.yaml
base_system_prompt: You are helpful.
system_prompt_suffix: Respond briefly.
excluded_tools:
  - execute
  - grep
excluded_middleware:
  - SummarizationMiddleware
general_purpose_subagent:
  enabled: false
```

```python
import yaml
from deepagents import HarnessProfileConfig, register_harness_profile

with open("openai.yaml") as f:
    register_harness_profile(
        "openai",
        HarnessProfileConfig.from_dict(yaml.safe_load(f)),
    )
```

## Demo 9: 插件发布

```toml
# pyproject.toml
[project.entry-points."deepagents.harness_profiles"]
my_provider = "my_pkg.profiles:register_harness"

[project.entry-points."deepagents.provider_profiles"]
my_provider = "my_pkg.profiles:register_provider"
```

```python
# my_pkg/profiles.py
from deepagents import (
    HarnessProfile,
    ProviderProfile,
    register_harness_profile,
    register_provider_profile,
)


def register_harness() -> None:
    register_harness_profile(
        "my_provider",
        HarnessProfile(system_prompt_suffix="Batch independent tool calls in parallel."),
    )


def register_provider() -> None:
    register_provider_profile(
        "my_provider",
        ProviderProfile(init_kwargs={"temperature": 0}),
    )
```

## Demo 10: 完整 Profile 配置

```python
from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    ProviderProfile,
    register_harness_profile,
    register_provider_profile,
)

# Provider profile：模型构建
register_provider_profile(
    "openai",
    ProviderProfile(
        init_kwargs={"temperature": 0, "max_tokens": 4096},
    ),
)

# Harness profile：harness 行为
register_harness_profile(
    "openai",
    HarnessProfile(
        system_prompt_suffix="You are an OpenAI-powered assistant. Be concise and direct.",
        excluded_middleware={"SummarizationMiddleware"},
    ),
)

# 模型级覆盖
register_harness_profile(
    "openai:gpt-5.4",
    HarnessProfile(
        system_prompt_suffix="You are GPT-5.4. Be extremely concise.",
        excluded_tools={"execute"},
        general_purpose_subagent=GeneralPurposeSubagentProfile(
            enabled=True,
            name="general-purpose",
            system_prompt="You are a general-purpose assistant.",
        ),
    ),
)

# Anthropic profile
register_provider_profile(
    "anthropic",
    ProviderProfile(
        init_kwargs={"max_tokens": 8192},
    ),
)

register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        system_prompt_suffix="You are Claude. Be thorough but concise.",
        tool_description_overrides={
            "edit_file": "Edit files carefully. Prefer small changes.",
        },
    ),
)

# 使用时：
# agent = create_deep_agent(model="openai:gpt-5.4", ...)
# → 自动应用 openai + openai:gpt-5.4 的 profiles
```
