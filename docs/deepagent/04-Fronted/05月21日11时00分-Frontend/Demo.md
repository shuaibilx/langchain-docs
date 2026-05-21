# Frontend - Demo

## Demo 1: 基础 useStream 连接

```tsx
import { useStream } from "@langchain/react";

function App() {
  const stream = useStream<typeof agent>({
    apiUrl: "http://localhost:2024",
    assistantId: "agent",
  });

  return (
    <div>
      {stream.messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

## Demo 2: Subagent 消息过滤

```tsx
import { useStream } from "@langchain/react";

function DeepAgentChat() {
  const stream = useStream<typeof myAgent>({
    apiUrl: "http://localhost:2024",
    assistantId: "deep_agent_subagent_cards",
    filterSubagentMessages: true,
  });

  return (
    <div>
      {stream.messages.map((msg) => (
        <MessageWithSubagents
          key={msg.id}
          message={msg}
          subagents={stream.getSubagentsByMessage(msg.id)}
        />
      ))}
    </div>
  );
}
```

## Demo 3: SubagentStreamInterface 使用

```tsx
interface SubagentStreamInterface {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  messages: BaseMessage[];
  result: string | undefined;
  toolCall: {
    id: string;
    name: string;
    args: { description: string; subagent_type: string; [key: string]: unknown };
  };
  startedAt: number | undefined;
  completedAt: number | undefined;
}

function SubagentCard({ subagent }: { subagent: SubagentStreamInterface }) {
  const [expanded, setExpanded] = useState(true);
  const title = subagent.toolCall?.args?.subagent_type ?? `Agent ${subagent.id}`;
  const description = subagent.toolCall?.args?.description ?? "";
  const lastAIMessage = subagent.messages.filter(AIMessage.isInstance).at(-1);
  const displayContent = subagent.status === "complete"
    ? subagent.result
    : typeof lastAIMessage?.content === "string" ? lastAIMessage.content : "";
  const elapsed = getElapsedTime(subagent.startedAt, subagent.completedAt);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <StatusIcon status={subagent.status} />
          <div>
            <h4 className="font-semibold capitalize">{title}</h4>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {elapsed && <span className="text-xs text-gray-400">{elapsed}</span>}
          <StatusBadge status={subagent.status} />
        </div>
      </button>
      {expanded && displayContent && (
        <div className="border-t px-4 py-3">
          <div className="prose prose-sm max-w-none line-clamp-6">
            {displayContent}
            {subagent.status === "running" && <span className="inline-block h-4 w-1 animate-pulse bg-blue-500" />}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Demo 4: 状态图标和进度条

```tsx
function StatusIcon({ status }: { status: SubagentStreamInterface["status"] }) {
  switch (status) {
    case "pending": return <span className="text-gray-400">○</span>;
    case "running": return <span className="animate-spin text-blue-500">◉</span>;
    case "complete": return <span className="text-green-500">✓</span>;
    case "error": return <span className="text-red-500">✕</span>;
  }
}

function StatusBadge({ status }: { status: SubagentStreamInterface["status"] }) {
  const styles = {
    pending: "bg-gray-100 text-gray-600",
    running: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function SubagentProgress({ subagents }: { subagents: SubagentStreamInterface[] }) {
  const completed = subagents.filter((s) => s.status === "complete").length;
  const total = subagents.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Subagent progress</span>
        <span>{completed}/{total} complete</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
```

## Demo 5: 消息与 Subagent 卡片组合

```tsx
function MessageWithSubagents({
  message,
  subagents,
}: {
  message: BaseMessage;
  subagents: SubagentStreamInterface[];
}) {
  if (message.type === "human") return <HumanMessage content={message.content} />;

  return (
    <div className="space-y-3">
      {message.content && <div className="prose prose-sm max-w-none">{message.content}</div>}
      {subagents.length > 0 && (
        <div className="ml-4 space-y-3 border-l-2 border-blue-200 pl-4">
          <SubagentProgress subagents={subagents} />
          {subagents.map((subagent) => (
            <SubagentCard key={subagent.id} subagent={subagent} />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Demo 6: 综合指示器 + 全局 subagent 访问

```tsx
function SynthesisIndicator({
  subagents,
  isLoading,
}: {
  subagents: SubagentStreamInterface[];
  isLoading: boolean;
}) {
  const allComplete =
    subagents.length > 0 &&
    subagents.every((s) => s.status === "complete" || s.status === "error");
  if (!allComplete || !isLoading) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-4 py-2 text-sm text-purple-700">
      <span className="animate-spin">⟳</span>
      Synthesizing results from {subagents.length} subagent
      {subagents.length !== 1 ? "s" : ""}...
    </div>
  );
}

// 全局访问
const allSubagents = [...stream.subagents.values()];
const running = allSubagents.filter((s) => s.status === "running");
const completed = allSubagents.filter((s) => s.status === "complete");
const errors = allSubagents.filter((s) => s.status === "error");
```

## Demo 7: Todo List 完整实现

```tsx
import { useStream } from "@langchain/react";

interface Todo {
  status: "pending" | "in_progress" | "completed";
  content: string;
}

function TodoAgent() {
  const stream = useStream<typeof myAgent>({
    apiUrl: "http://localhost:2024",
    assistantId: "deep_agent_todo_list",
  });

  const todos = stream.values?.todos ?? [];

  return (
    <div>
      {todos.length > 0 && (
        <div className="border-b bg-gray-50 p-4">
          <TodoList todos={todos} />
        </div>
      )}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {stream.messages.map((msg) => <Message key={msg.id} message={msg} />)}
        </div>
      </main>
    </div>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  const completed = todos.filter((t) => t.status === "completed").length;
  const percentage = todos.length ? Math.round((completed / todos.length) * 100) : 0;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent Progress</h2>
        <span className="text-sm text-gray-500">{completed}/{todos.length} tasks</span>
      </div>
      <ProgressBar percentage={percentage} />
      <ul className="mt-4 space-y-2">
        {todos.map((todo, i) => <TodoItem key={i} todo={todo} />)}
      </ul>
    </div>
  );
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Progress</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  const config = {
    pending: { icon: "○", textClass: "text-gray-600", bgClass: "bg-gray-50", iconClass: "text-gray-400" },
    in_progress: { icon: "◉", textClass: "text-amber-800", bgClass: "bg-amber-50 border-amber-200", iconClass: "text-amber-500 animate-pulse" },
    completed: { icon: "✓", textClass: "text-green-800 line-through", bgClass: "bg-green-50 border-green-200", iconClass: "text-green-500" },
  };
  const style = config[todo.status];

  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2 transition-all duration-300 ease-in-out ${style.bgClass}`}>
      <span className={`mt-0.5 text-lg leading-none transition-colors duration-300 ${style.iconClass}`}>{style.icon}</span>
      <span className={`text-sm transition-all duration-300 ${style.textClass}`}>{todo.content}</span>
    </li>
  );
}
```

## Demo 8: Sandbox Agent 设置

```python
from deepagents import create_deep_agent
from deepagents.sandbox import LangSmithSandbox
from langgraph.config import get_config


def get_or_create_sandbox_for_thread(thread_id: str) -> LangSmithSandbox:
    """Look up or create sandbox based on thread_id."""
    # 实际实现中会查询数据库或缓存
    return LangSmithSandbox.create(templateName="node-starter")


sandbox = LangSmithSandbox(
    resolve=lambda: get_or_create_sandbox_for_thread(
        get_config()["configurable"]["thread_id"]
    ),
)

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    backend=sandbox,
    system_prompt="You are a coding assistant. Read, write, and execute code in the sandbox.",
)
```

## Demo 9: Sandbox API 服务器

```python
# src/api/server.py
from fastapi import FastAPI, Query, Path
from utils import get_or_create_sandbox_for_thread

app = FastAPI()


@app.get("/api/sandbox/{thread_id}/tree")
async def list_tree(
    thread_id: str = Path(...),
    path: str = Query("/app"),
):
    sandbox = await get_or_create_sandbox_for_thread(thread_id)
    result = await sandbox.aexecute(
        f"find {path} -printf '%y\\t%s\\t%p\\n' 2>/dev/null | sort"
    )
    entries = []
    for line in result.output.strip().split("\n"):
        if not line:
            continue
        type_char, size_str, full_path = line.split("\t")
        entries.append({
            "name": full_path.split("/")[-1],
            "type": "directory" if type_char == "d" else "file",
            "path": full_path,
            "size": int(size_str),
        })
    return {"path": path, "entries": entries, "sandbox_id": sandbox.id}


@app.get("/api/sandbox/{thread_id}/file")
async def read_file(
    thread_id: str = Path(...),
    path: str = Query(...),
):
    sandbox = await get_or_create_sandbox_for_thread(thread_id)
    results = await sandbox.adownload_files([path])
    return {"path": path, "content": results[0].content.decode()}
```

## Demo 10: langgraph.json 配置

```json
{
  "graphs": {
    "coding_agent": "./src/agents/my_agent.py:agent"
  },
  "env": ".env",
  "http": {
    "app": "./src/api/server.py:app"
  }
}
```

## Demo 11: Sandbox 前端 - Thread 创建和文件同步

```tsx
import { useStream } from "@langchain/react";
import { ToolMessage, AIMessage } from "langchain";
import { useState, useCallback, useEffect, useRef } from "react";

const AGENT_URL = "http://localhost:2024";
const THREAD_KEY = "sandbox-thread-id";
const FILE_MUTATING_TOOLS = new Set(["write_file", "edit_file", "execute"]);

function IDEPreview() {
  const [threadId, setThreadId] = useState<string | null>(
    () => sessionStorage.getItem(THREAD_KEY)
  );

  const updateThreadId = useCallback((id: string | null) => {
    setThreadId(id);
    if (id) sessionStorage.setItem(THREAD_KEY, id);
    else sessionStorage.removeItem(THREAD_KEY);
  }, []);

  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "coding_agent",
    threadId,
    onThreadId: updateThreadId,
  });

  // 创建 thread
  useEffect(() => {
    if (threadId) return;
    stream.client.threads.create().then((t) => updateThreadId(t.thread_id));
  }, [stream.client, threadId, updateThreadId]);

  // 实时文件同步
  const processedIds = useRef(new Set<string>());

  useEffect(() => {
    const toolCallMap = new Map();
    for (const msg of stream.messages) {
      if (!AIMessage.isInstance(msg)) continue;
      for (const tc of msg.tool_calls ?? []) {
        if (tc.id && FILE_MUTATING_TOOLS.has(tc.name)) {
          toolCallMap.set(tc.id, { name: tc.name, args: tc.args });
        }
      }
    }

    for (const msg of stream.messages) {
      if (!ToolMessage.isInstance(msg)) continue;
      const id = msg.id ?? msg.tool_call_id;
      if (!id || processedIds.current.has(id)) continue;
      const call = toolCallMap.get(msg.tool_call_id);
      if (!call) continue;
      processedIds.current.add(id);

      if (call.name === "write_file" || call.name === "edit_file") {
        refreshSingleFile(call.args.path);
      } else if (call.name === "execute") {
        refreshAllFiles();
      }
    }
  }, [stream.messages]);

  // 新 thread
  function handleNewThread() {
    stream.switchThread(null);
    updateThreadId(null);
  }

  // 文件树
  const { tree, files } = useSandboxFiles(threadId);

  return (
    <div className="flex h-screen">
      <div className="w-52 shrink-0">
        <FileTree tree={tree} files={files} />
      </div>
      <CodePanel files={files} />
      <div className="w-80 shrink-0">
        <ChatPanel stream={stream} />
      </div>
    </div>
  );
}

async function fetchTree(threadId: string) {
  const res = await fetch(
    `${AGENT_URL}/api/sandbox/${encodeURIComponent(threadId)}/tree?filePath=/app`
  );
  const data = await res.json();
  return data.entries.filter((e: any) => !e.path.includes("node_modules"));
}

async function fetchFile(threadId: string, path: string) {
  const res = await fetch(
    `${AGENT_URL}/api/sandbox/${encodeURIComponent(threadId)}/file?filePath=${encodeURIComponent(path)}`
  );
  const data = await res.json();
  return data.content ?? null;
}
```

## Demo 12: Diff 显示

```tsx
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";

function DiffPanel({
  original,
  current,
  fileName,
}: {
  original: string;
  current: string;
  fileName: string;
}) {
  const diff = parseDiffFromFile(
    { name: fileName, contents: original },
    { name: fileName, contents: current }
  );

  return (
    <FileDiff
      fileDiff={diff}
      options={{
        theme: "github-dark",
        diffStyle: "unified",
        diffIndicators: "bars",
      }}
    />
  );
}

// 更改文件检测
function detectChanges(
  current: Record<string, string>,
  original: Record<string, string>
): Set<string> {
  const changed = new Set<string>();
  for (const [path, content] of Object.entries(current)) {
    if (original[path] !== content) changed.add(path);
  }
  for (const path of Object.keys(original)) {
    if (!(path in current)) changed.add(path);
  }
  return changed;
}
```
