# Skills 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础技能加载

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 技能库
SKILLS = {
    "write_sql": """你是 SQL 专家。
规则：
- 使用标准 SQL 语法
- 添加注释说明
- 优化查询性能""",
    "review_legal_doc": """你是法律文档审查专家。
规则：
- 检查关键条款
- 标注风险点
- 给出修改建议""",
    "translate_tech": """你是技术文档翻译专家。
规则：
- 技术术语不翻译
- 保持代码块原样
- 使用简洁专业的语言""",
}

@tool
def load_skill(skill_name: str) -> str:
    """加载专门化的技能提示。
    可用: write_sql, review_legal_doc, translate_tech
    """
    return SKILLS.get(skill_name, f"未知技能: {skill_name}")

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[load_skill],
    system_prompt="你是助手。使用 load_skill 加载专门技能来完成任务。"
)

# 先加载技能，再执行任务
r = agent.invoke({"messages": [{"role": "user", "content": "先加载 write_sql 技能，然后帮我写一个查询用户订单的 SQL"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 2：渐进式披露

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 技能目录（简要描述）
SKILL_REGISTRY = {
    "python_expert": {"desc": "Python 编程专家", "prompt": "你是 Python 专家..."},
    "data_analyst": {"desc": "数据分析专家", "prompt": "你是数据分析专家..."},
    "web_designer": {"desc": "网页设计专家", "prompt": "你是网页设计专家..."},
}

@tool
def list_skills() -> str:
    """列出所有可用技能。"""
    return "\n".join(f"- {name}: {info['desc']}" for name, info in SKILL_REGISTRY.items())

@tool
def load_skill(skill_name: str) -> str:
    """加载指定技能。"""
    skill = SKILL_REGISTRY.get(skill_name)
    return skill["prompt"] if skill else f"未知技能: {skill_name}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[list_skills, load_skill],
    system_prompt="先用 list_skills 查看可用技能，再用 load_skill 加载需要的技能。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "我需要数据分析方面的帮助"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 3：带资源引用的技能

```python
from langchain.tools import tool
from langchain.agents import create_agent

SKILLS = {
    "code_review": {
        "prompt": """你是代码审查专家。
参考规范文件: coding_standards.md
检查项：
1. 命名规范
2. 代码结构
3. 错误处理
4. 性能优化""",
    },
    "api_design": {
        "prompt": """你是 API 设计专家。
参考规范文件: api_guidelines.md
设计原则：
1. RESTful 风格
2. 一致的命名
3. 恰当的状态码""",
    },
}

@tool
def load_skill(skill_name: str) -> str:
    """加载技能。可用: code_review, api_design"""
    skill = SKILLS.get(skill_name)
    return skill["prompt"] if skill else f"未知技能: {skill_name}"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[load_skill],
    system_prompt="使用 load_skill 加载技能来完成任务。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "加载 code_review 技能，审查这段代码: def add(a,b): return a+b"}]})
print(f"回复: {r['messages'][-1].content[:100]}")
```

---

## Demo 4：技能 + 动态工具注册

```python
from langchain.tools import tool
from langchain.agents import create_agent

# 技能定义（包含额外工具）
SKILL_TOOLS = {
    "database_admin": {
        "prompt": "你是数据库管理员。",
        "tools": ["backup_db", "restore_db", "migrate_db"]
    }
}

@tool
def backup_db(db_name: str) -> str:
    """备份数据库。"""
    return f"已备份: {db_name}"

@tool
def restore_db(db_name: str) -> str:
    """恢复数据库。"""
    return f"已恢复: {db_name}"

@tool
def load_skill(skill_name: str) -> str:
    """加载技能。可用: database_admin"""
    skill = SKILL_TOOLS.get(skill_name)
    return f"已加载技能: {skill_name}\n附加工具: {skill['tools']}" if skill else "未知技能"

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[load_skill, backup_db, restore_db],
    system_prompt="使用 load_skill 加载技能。加载 database_admin 后可使用 backup_db 和 restore_db。"
)

r = agent.invoke({"messages": [{"role": "user", "content": "加载数据库管理技能，然后备份 mydb"}]})
print(f"回复: {r['messages'][-1].content[:80]}")
```

---

## 运行说明

1. Demo 1 基础技能加载
2. Demo 2 渐进式披露
3. Demo 3 带资源引用的技能
4. Demo 4 技能 + 动态工具注册
