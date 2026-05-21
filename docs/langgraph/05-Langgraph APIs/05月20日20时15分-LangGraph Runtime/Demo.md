# LangGraph 运行时 - Demo

## Demo 1: 单节点 Pregel

```python
from langgraph.channels import EphemeralValue
from langgraph.pregel import Pregel, NodeBuilder

node1 = (
    NodeBuilder().subscribe_only("a")
    .do(lambda x: x + x)
    .write_to("b")
)

app = Pregel(
    nodes={"node1": node1},
    channels={
        "a": EphemeralValue(str),
        "b": EphemeralValue(str),
    },
    input_channels=["a"],
    output_channels=["b"],
)

result = app.invoke({"a": "foo"})
print(result)  # {'b': 'foofoo'}
```

## Demo 2: 多节点串联

```python
from langgraph.channels import LastValue, EphemeralValue
from langgraph.pregel import Pregel, NodeBuilder

node1 = (
    NodeBuilder().subscribe_only("a")
    .do(lambda x: x + x)
    .write_to("b")
)

node2 = (
    NodeBuilder().subscribe_only("b")
    .do(lambda x: x + x)
    .write_to("c")
)

app = Pregel(
    nodes={"node1": node1, "node2": node2},
    channels={
        "a": EphemeralValue(str),
        "b": LastValue(str),
        "c": EphemeralValue(str),
    },
    input_channels=["a"],
    output_channels=["b", "c"],
)

result = app.invoke({"a": "foo"})
print(result)  # {'b': 'foofoo', 'c': 'foofoofoofoo'}
```

## Demo 3: Topic channel 累积

```python
from langgraph.channels import EphemeralValue, Topic
from langgraph.pregel import Pregel, NodeBuilder

node1 = (
    NodeBuilder().subscribe_only("a")
    .do(lambda x: x + x)
    .write_to("b", "c")
)

node2 = (
    NodeBuilder().subscribe_to("b")
    .do(lambda x: x["b"] + x["b"])
    .write_to("c")
)

app = Pregel(
    nodes={"node1": node1, "node2": node2},
    channels={
        "a": EphemeralValue(str),
        "b": EphemeralValue(str),
        "c": Topic(str, accumulate=True),
    },
    input_channels=["a"],
    output_channels=["c"],
)

result = app.invoke({"a": "foo"})
print(result)  # {'c': ['foofoo', 'foofoofoofoo']}
```

## Demo 4: BinaryOperatorAggregate

```python
from langgraph.channels import EphemeralValue, BinaryOperatorAggregate
from langgraph.pregel import Pregel, NodeBuilder

node1 = (
    NodeBuilder().subscribe_only("a")
    .do(lambda x: x + x)
    .write_to("b", "c")
)

node2 = (
    NodeBuilder().subscribe_only("b")
    .do(lambda x: x + x)
    .write_to("c")
)

def reducer(current, update):
    if current:
        return current + " | " + update
    else:
        return update

app = Pregel(
    nodes={"node1": node1, "node2": node2},
    channels={
        "a": EphemeralValue(str),
        "b": EphemeralValue(str),
        "c": BinaryOperatorAggregate(str, operator=reducer),
    },
    input_channels=["a"],
    output_channels=["c"],
)

result = app.invoke({"a": "foo"})
print(result)  # {'c': 'foofoo | foofoofoofoo'}
```

## Demo 5: 循环图

```python
from langgraph.channels import EphemeralValue
from langgraph.pregel import Pregel, NodeBuilder, ChannelWriteEntry

example_node = (
    NodeBuilder().subscribe_only("value")
    .do(lambda x: x + x if len(x) < 10 else None)
    .write_to(ChannelWriteEntry("value", skip_none=True))
)

app = Pregel(
    nodes={"example_node": example_node},
    channels={
        "value": EphemeralValue(str),
    },
    input_channels=["value"],
    output_channels=["value"],
)

result = app.invoke({"value": "a"})
print(result)  # {'value': 'aaaaaaaaaaaaaaaa'}
```

## Demo 6: DeltaChannel

```python
from typing import Annotated, Sequence
from typing_extensions import TypedDict
from langgraph.channels import DeltaChannel


def list_reducer(state: list[str], writes: Sequence[list[str]]) -> list[str]:
    result = list(state)
    for write in writes:
        result.extend(write)
    return result


class State(TypedDict):
    messages: Annotated[list[str], DeltaChannel(list_reducer, snapshot_frequency=5)]
```

## Demo 7: 检查 StateGraph 编译后的内部结构

```python
from typing import TypedDict
from langgraph.constants import START
from langgraph.graph import StateGraph

class Essay(TypedDict):
    topic: str
    content: str | None
    score: float | None

def write_essay(essay: Essay):
    return {"content": f"Essay about {essay['topic']}"}

def score_essay(essay: Essay):
    return {"score": 10}

builder = StateGraph(Essay)
builder.add_node(write_essay)
builder.add_node(score_essay)
builder.add_edge(START, "write_essay")
builder.add_edge("write_essay", "score_essay")

graph = builder.compile()

# 查看内部 nodes
print("Nodes:", list(graph.nodes.keys()))
# ['__start__', 'write_essay', 'score_essay']

# 查看内部 channels
print("Channels:", list(graph.channels.keys()))
# ['topic', 'content', 'score', '__start__', 'write_essay', 'score_essay', ...]

# 执行
result = graph.invoke({"topic": "AI"})
print(result)  # {'topic': 'AI', 'content': 'Essay about AI', 'score': 10}
```

## Demo 8: 检查 Entrypoint 编译后的内部结构

```python
from typing import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint

class Essay(TypedDict):
    topic: str
    content: str | None

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def write_essay(essay: Essay):
    return {"content": f"Essay about {essay['topic']}"}

print("Nodes:", write_essay.nodes)
# {'write_essay': <PregelNode>}

print("Channels:", write_essay.channels)
# {'__start__': <EphemeralValue>, '__end__': <LastValue>, '__previous__': <LastValue>}
```
