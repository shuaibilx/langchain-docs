# Graph Execution - Demo

## Demo 1: 定义 Pipeline 节点映射

```ts
const PIPELINE_NODES = [
  { name: "classify", stateKey: "classification", label: "Classify" },
  { name: "do_research", stateKey: "research", label: "Research" },
  { name: "analyze", stateKey: "analysis", label: "Analyze" },
  { name: "synthesize", stateKey: "synthesis", label: "Synthesize" },
];

const PIPELINE_NODE_NAMES = new Set(PIPELINE_NODES.map((n) => n.name));
```

## Demo 2: 定义 TypeScript 状态接口

```ts
import type { BaseMessage } from "@langchain/core/messages";

interface AgentState {
  messages: BaseMessage[];
  classification: string;
  research: string;
  analysis: string;
  synthesis: string;
}
```

## Demo 3: 设置 useStream

```tsx
import { useStream } from "@langchain/react";

const AGENT_URL = "http://localhost:2024";

export function PipelineChat() {
  const stream = useStream<AgentState>({
    apiUrl: AGENT_URL,
    assistantId: "graph_execution_cards",
  });

  return (
    <div>
      <PipelineProgress nodes={PIPELINE_NODES} values={stream.values} />
      <NodeCardList
        nodes={PIPELINE_NODES}
        messages={stream.messages}
        values={stream.values}
        getMetadata={stream.getMessagesMetadata}
      />
    </div>
  );
}
```

## Demo 4: 流式 Token 路由到节点

```ts
import type { BaseMessage } from "@langchain/core/messages";

interface MessageMetadata {
  streamMetadata?: {
    langgraph_node?: string;
  };
}

function getStreamingContent(
  messages: BaseMessage[],
  getMetadata: (msg: BaseMessage) => MessageMetadata | undefined
): Record<string, string> {
  const content: Record<string, string> = {};

  for (const message of messages) {
    if (message.type !== "ai") continue;

    const metadata = getMetadata(message);
    const node = metadata?.streamMetadata?.langgraph_node;

    if (node && PIPELINE_NODE_NAMES.has(node)) {
      content[node] = typeof message.content === "string"
        ? message.content
        : "";
    }
  }

  return content;
}
```

## Demo 5: 确定节点状态

```ts
type NodeStatus = "idle" | "streaming" | "complete";

function getNodeStatus(
  node: { name: string; stateKey: string },
  streamingContent: Record<string, string>,
  values: Record<string, unknown> | undefined
): NodeStatus {
  if (values?.[node.stateKey]) return "complete";
  if (streamingContent[node.name]) return "streaming";
  return "idle";
}
```

## Demo 6: Pipeline 进度条组件

```tsx
function PipelineProgress({
  nodes,
  values,
  streamingContent,
}: {
  nodes: typeof PIPELINE_NODES;
  values: Record<string, unknown> | undefined;
  streamingContent: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-1">
      {nodes.map((node, i) => {
        const status = getNodeStatus(node, streamingContent, values);
        const colors = {
          idle: "bg-gray-200 text-gray-500",
          streaming: "bg-blue-400 text-white animate-pulse",
          complete: "bg-green-500 text-white",
        };

        return (
          <div key={node.name} className="flex items-center">
            <div
              className={`rounded-full px-3 py-1 text-xs font-medium ${colors[status]}`}
            >
              {node.label}
            </div>
            {i < nodes.length - 1 && (
              <div
                className={`mx-1 h-0.5 w-6 ${
                  status === "complete" ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

## Demo 7: 可折叠 NodeCard 组件

```tsx
import { useState } from "react";

function NodeCard({
  node,
  status,
  streamingContent,
  completedContent,
}: {
  node: { name: string; stateKey: string; label: string };
  status: NodeStatus;
  streamingContent: string | undefined;
  completedContent: unknown;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const displayContent =
    status === "complete"
      ? formatContent(completedContent)
      : streamingContent ?? "";

  const statusBadge = {
    idle: { text: "Waiting", className: "bg-gray-100 text-gray-600" },
    streaming: {
      text: "Running",
      className: "bg-blue-100 text-blue-700 animate-pulse",
    },
    complete: { text: "Done", className: "bg-green-100 text-green-700" },
  };

  const badge = statusBadge[status];

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{node.label}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.text}
          </span>
        </div>
        <span>{collapsed ? "▼" : "▲"}</span>
      </button>

      {!collapsed && displayContent && (
        <div className="border-t px-4 py-3">
          <div className="prose prose-sm max-w-none">
            {displayContent}
            {status === "streaming" && (
              <span className="inline-block h-4 w-1 animate-pulse bg-blue-500" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}
```

## Demo 8: 完整 NodeCardList 组件

```tsx
function NodeCardList({
  nodes,
  messages,
  values,
  getMetadata,
}: {
  nodes: typeof PIPELINE_NODES;
  messages: BaseMessage[];
  values: Record<string, unknown> | undefined;
  getMetadata: (msg: BaseMessage) => MessageMetadata | undefined;
}) {
  const streamingContent = getStreamingContent(messages, getMetadata);

  return (
    <div className="space-y-3">
      {nodes.map((node) => {
        const status = getNodeStatus(node, streamingContent, values);
        return (
          <NodeCard
            key={node.name}
            node={node}
            status={status}
            streamingContent={streamingContent[node.name]}
            completedContent={values?.[node.stateKey]}
          />
        );
      })}
    </div>
  );
}
```

## Demo 9: 动态 Pipeline（过滤活跃节点）

```ts
function getActiveNodes(
  streamingContent: Record<string, string>,
  values: Record<string, unknown> | undefined,
  currentNode?: string
) {
  return PIPELINE_NODES.filter(
    (node) =>
      streamingContent[node.name] ||
      values?.[node.stateKey] ||
      node.name === currentNode
  );
}

// 使用
const activeNodes = getActiveNodes(streamingContent, stream.values);
```

## Demo 10: 完整应用

```tsx
import { useStream } from "@langchain/react";
import type { BaseMessage } from "@langchain/core/messages";

const PIPELINE_NODES = [
  { name: "classify", stateKey: "classification", label: "Classify" },
  { name: "do_research", stateKey: "research", label: "Research" },
  { name: "analyze", stateKey: "analysis", label: "Analyze" },
  { name: "synthesize", stateKey: "synthesis", label: "Synthesize" },
];

const PIPELINE_NODE_NAMES = new Set(PIPELINE_NODES.map((n) => n.name));

const AGENT_URL = "http://localhost:2024";

export function GraphExecutionApp() {
  const stream = useStream({
    apiUrl: AGENT_URL,
    assistantId: "graph_execution_cards",
  });

  const streamingContent = getStreamingContent(
    stream.messages,
    stream.getMessagesMetadata
  );

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Research Pipeline</h1>

      {/* 进度条 */}
      <PipelineProgress
        nodes={PIPELINE_NODES}
        values={stream.values}
        streamingContent={streamingContent}
      />

      {/* 节点卡片 */}
      <div className="mt-4 space-y-3">
        {PIPELINE_NODES.map((node) => {
          const status = getNodeStatus(node, streamingContent, stream.values);
          return (
            <NodeCard
              key={node.name}
              node={node}
              status={status}
              streamingContent={streamingContent[node.name]}
              completedContent={stream.values?.[node.stateKey]}
            />
          );
        })}
      </div>

      {/* 输入 */}
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.target.message;
          stream.submit({
            messages: [{ role: "user", content: input.value }],
          });
          input.value = "";
        }}
      >
        <input
          name="message"
          className="flex-1 border rounded-lg px-4 py-2"
          placeholder="Ask a research question..."
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```
