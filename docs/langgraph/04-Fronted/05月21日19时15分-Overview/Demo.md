# Overview - Demo

## Demo 1: 定义图状态

```python
from langgraph.graph import StateGraph, MessagesState, START, END

class State(MessagesState):
    classification: str
    research: str
    analysis: str

graph = StateGraph(State)
graph.add_node("classify", classify_node)
graph.add_node("research", research_node)
graph.add_node("analyze", analyze_node)
graph.add_edge(START, "classify")
graph.add_edge("classify", "research")
graph.add_edge("research", "analyze")
graph.add_edge("analyze", END)

app = graph.compile()
```

## Demo 2: React useStream 基础用法

```tsx
import { useStream } from "@langchain/react";

function Pipeline() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  const classification = stream.values?.classification;
  const research = stream.values?.research;
  const analysis = stream.values?.analysis;

  return (
    <div>
      <p>Classification: {classification}</p>
      <p>Research: {research}</p>
      <p>Analysis: {analysis}</p>
    </div>
  );
}
```

## Demo 3: Vue useStream

```vue
<script setup lang="ts">
import { useStream } from "@langchain/vue";

const stream = useStream<typeof graph>({
  apiUrl: "http://localhost:2024",
  assistantId: "pipeline",
});
</script>

<template>
  <div>
    <p>Classification: {{ stream.values.value?.classification }}</p>
    <p>Research: {{ stream.values.value?.research }}</p>
    <p>Analysis: {{ stream.values.value?.analysis }}</p>
  </div>
</template>
```

## Demo 4: Svelte useStream

```svelte
<script lang="ts">
  import { useStream } from "@langchain/svelte";

  const { messages, values, getMessagesMetadata, submit } = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });
</script>

<div>
  <p>Classification: {$values?.classification}</p>
  <p>Research: {$values?.research}</p>
  <p>Analysis: {$values?.analysis}</p>
</div>
```

## Demo 5: Angular useStream

```ts
import { Component } from "@angular/core";
import { useStream } from "@langchain/angular";

@Component({
  selector: "app-pipeline",
  template: `
    <div>
      <p>Classification: {{ stream.values()?.classification }}</p>
      <p>Research: {{ stream.values()?.research }}</p>
      <p>Analysis: {{ stream.values()?.analysis }}</p>
    </div>
  `,
})
export class PipelineComponent {
  stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });
}
```

## Demo 6: 提交消息

```tsx
function ChatInput() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  const handleSubmit = (message: string) => {
    stream.submit({ messages: [{ role: "user", content: message }] });
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(e.target.message.value);
    }}>
      <input name="message" placeholder="Ask something..." />
      <button type="submit">Send</button>
    </form>
  );
}
```

## Demo 7: 获取流式元数据

```tsx
function StreamingContent() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  // 获取每条消息的元数据
  const messagesWithNodes = stream.messages.map((msg) => {
    const metadata = stream.getMessagesMetadata(msg);
    const node = metadata?.streamMetadata?.langgraph_node;
    return { message: msg, node };
  });

  return (
    <div>
      {messagesWithNodes.map(({ message, node }, i) => (
        <div key={i}>
          <span className="badge">{node}</span>
          <p>{message.content}</p>
        </div>
      ))}
    </div>
  );
}
```

## Demo 8: 完整 Pipeline 组件

```tsx
import { useStream } from "@langchain/react";

const PIPELINE_NODES = [
  { name: "classify", stateKey: "classification", label: "Classify" },
  { name: "research", stateKey: "research", label: "Research" },
  { name: "analyze", stateKey: "analysis", label: "Analyze" },
];

function PipelineApp() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  return (
    <div>
      {/* 进度条 */}
      <div className="flex gap-2">
        {PIPELINE_NODES.map((node) => (
          <div
            key={node.name}
            className={`px-3 py-1 rounded ${
              stream.values?.[node.stateKey]
                ? "bg-green-500 text-white"
                : "bg-gray-200"
            }`}
          >
            {node.label}
          </div>
        ))}
      </div>

      {/* 节点输出卡片 */}
      {PIPELINE_NODES.map((node) => (
        <div key={node.name} className="border rounded p-4 mt-3">
          <h3>{node.label}</h3>
          <p>{stream.values?.[node.stateKey] ?? "Waiting..."}</p>
        </div>
      ))}

      {/* 输入 */}
      <form onSubmit={(e) => {
        e.preventDefault();
        stream.submit({ messages: [{ role: "user", content: e.target.message.value }] });
      }}>
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```
