# Interrupts 功能 Demo

## 环境准备

```bash
pip install langchain langchain-openai langgraph
```

---

## Demo 1：基础中断 — 批准/拒绝

```python
from typing import TypedDict, Optional, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    action: str
    status: Optional[str]

def approval_node(state: State) -> Command[Literal["proceed", "cancel"]]:
    is_approved = interrupt({
        "question": "批准此操作?",
        "action": state["action"]
    })
    return Command(goto="proceed" if is_approved else "cancel")

def proceed_node(state: State) -> dict:
    return {"status": "已批准"}

def cancel_node(state: State) -> dict:
    return {"status": "已拒绝"}

graph = (
    StateGraph(State)
    .add_node("approval", approval_node)
    .add_node("proceed", proceed_node)
    .add_node("cancel", cancel_node)
    .add_edge(START, "approval")
    .add_edge("proceed", END)
    .add_edge("cancel", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "approval-1"}}

# 第一次执行：命中中断
result = graph.invoke({"action": "删除数据库", "status": None}, config, version="v2")
print(f"中断: {result.interrupts}")

# 恢复：批准
result = graph.invoke(Command(resume=True), config, version="v2")
print(f"状态: {result.value['status']}")
```

---

## Demo 2：审查和编辑

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    generated_text: str

def review_node(state: State) -> dict:
    edited_content = interrupt({
        "instruction": "审查并编辑此内容",
        "content": state["generated_text"]
    })
    return {"generated_text": edited_content}

graph = (
    StateGraph(State)
    .add_node("review", review_node)
    .add_edge(START, "review")
    .add_edge("review", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "review-1"}}

# 初始执行
result = graph.invoke({"generated_text": "这是初始草稿"}, config, version="v2")
print(f"中断: {result.interrupts}")

# 恢复：提供编辑后的内容
result = graph.invoke(Command(resume="这是修改后的草稿"), config, version="v2")
print(f"最终文本: {result.value['generated_text']}")
```

---

## Demo 3：验证输入 — 循环中断

```python
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    age: Optional[int]

def get_age_node(state: State) -> dict:
    prompt = "请输入你的年龄:"

    while True:
        answer = interrupt(prompt)

        if isinstance(answer, int) and answer > 0:
            return {"age": answer}
        else:
            prompt = f"'{answer}' 不是有效年龄，请输入正数。"

graph = (
    StateGraph(State)
    .add_node("get_age", get_age_node)
    .add_edge(START, "get_age")
    .add_edge("get_age", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "form-1"}}

# 第一次：请求输入
result = graph.invoke({"age": None}, config, version="v2")
print(f"中断: {result.interrupts}")

# 无效输入
result = graph.invoke(Command(resume="abc"), config, version="v2")
print(f"再次中断: {result.interrupts}")

# 有效输入
result = graph.invoke(Command(resume=25), config, version="v2")
print(f"年龄: {result.value['age']}")
```

---

## Demo 4：多个并行中断

```python
from typing import TypedDict, Annotated
import operator
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    vals: Annotated[list[str], operator.add]

def node_a(state: State) -> dict:
    answer = interrupt("问题 A: 你喜欢什么颜色?")
    return {"vals": [f"A: {answer}"]}

def node_b(state: State) -> dict:
    answer = interrupt("问题 B: 你喜欢什么食物?")
    return {"vals": [f"B: {answer}"]}

graph = (
    StateGraph(State)
    .add_node("a", node_a)
    .add_node("b", node_b)
    .add_edge(START, "a")
    .add_edge(START, "b")
    .add_edge("a", END)
    .add_edge("b", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "parallel-1"}}

# 两个并行节点都会中断
result = graph.invoke({"vals": []}, config, version="v2")
print(f"中断: {result.interrupts}")

# 恢复所有中断
resume_map = {i.id: f"{i.value} 的回答" for i in result.interrupts}
result = graph.invoke(Command(resume=resume_map), config, version="v2")
print(f"最终: {result.value['vals']}")
```

---

## Demo 5：工具中的中断

```python
from typing import TypedDict
from langchain.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """发送邮件"""
    response = interrupt({
        "action": "send_email",
        "to": to,
        "subject": subject,
        "body": body,
        "message": "批准发送此邮件?"
    })

    if response.get("action") == "approve":
        final_to = response.get("to", to)
        final_subject = response.get("subject", subject)
        return f"邮件已发送到 {final_to}，主题: {final_subject}"
    return "邮件已取消"

class State(TypedDict):
    result: str

def call_tool(state: State) -> dict:
    result = send_email.invoke({
        "to": "alice@example.com",
        "subject": "会议通知",
        "body": "明天下午3点开会"
    })
    return {"result": result}

graph = (
    StateGraph(State)
    .add_node("send", call_tool)
    .add_edge(START, "send")
    .add_edge("send", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "email-1"}}

# 执行到中断
result = graph.invoke({"result": ""}, config, version="v2")
print(f"中断: {result.interrupts}")

# 批准并修改主题
result = graph.invoke(
    Command(resume={"action": "approve", "subject": "修改后的主题"}),
    config,
    version="v2",
)
print(f"结果: {result.value['result']}")
```

---

## Demo 6：静态断点调试

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    value: str

def step_a(state: State) -> dict:
    print("[step_a] 执行")
    return {"value": f"{state['value']} -> A"}

def step_b(state: State) -> dict:
    print("[step_b] 执行")
    return {"value": f"{state['value']} -> B"}

def step_c(state: State) -> dict:
    print("[step_c] 执行")
    return {"value": f"{state['value']} -> C"}

graph = (
    StateGraph(State)
    .add_node("step_a", step_a)
    .add_node("step_b", step_b)
    .add_node("step_c", step_c)
    .add_edge(START, "step_a")
    .add_edge("step_a", "step_b")
    .add_edge("step_b", "step_c")
    .add_edge("step_c", END)
    .compile(
        checkpointer=InMemorySaver(),
        interrupt_before=["step_b"],  # 在 step_b 前暂停
        interrupt_after=["step_c"],   # 在 step_c 后暂停
    )
)

config = {"configurable": {"thread_id": "debug-1"}}

# 运行到第一个断点（step_b 之前）
print("=== 运行到断点 ===")
graph.invoke({"value": "开始"}, config)
print("已暂停在 step_b 之前")

# 恢复
print("\n=== 恢复执行 ===")
graph.invoke(None, config)
print("已暂停在 step_c 之后")

# 继续
print("\n=== 最终恢复 ===")
graph.invoke(None, config)
print("执行完成")
```

---

## Demo 7：流式传输 + 中断

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver
from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage

llm = ChatOpenAI(model="gpt-4o-mini")

class State(TypedDict):
    topic: str
    joke: str

def generate_joke(state: State) -> dict:
    response = llm.invoke([HumanMessage(content=f"写一个关于 {state['topic']} 的笑话")])
    return {"joke": response.content}

def review_node(state: State) -> dict:
    edited = interrupt({
        "instruction": "审查这个笑话",
        "joke": state["joke"]
    })
    return {"joke": edited}

graph = (
    StateGraph(State)
    .add_node("generate", generate_joke)
    .add_node("review", review_node)
    .add_edge(START, "generate")
    .add_edge("generate", "review")
    .add_edge("review", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "stream-1"}}

# 流式执行
print("=== 流式执行 ===")
for chunk in graph.stream(
    {"topic": "猫", "joke": ""},
    stream_mode=["updates", "messages"],
    config=config,
    version="v2",
):
    if chunk["type"] == "updates":
        if "__interrupt__" in chunk["data"]:
            print(f"\n中断: {chunk['data']['__interrupt__'][0].value}")
        else:
            for node_name, state in chunk["data"].items():
                print(f"[{node_name}] 更新: {list(state.keys())}")
    elif chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        if msg.content:
            print(msg.content, end="", flush=True)

# 恢复
print("\n\n=== 恢复 ===")
result = graph.invoke(Command(resume="这个笑话太冷了，换一个"), config, version="v2")
print(f"最终笑话: {result.value['joke']}")
```

---

## 运行说明

1. Demo 1 批准/拒绝
2. Demo 2 审查和编辑
3. Demo 3 验证输入
4. Demo 4 多个并行中断
5. Demo 5 工具中的中断
6. Demo 6 静态断点调试
7. Demo 7 流式传输 + 中断
