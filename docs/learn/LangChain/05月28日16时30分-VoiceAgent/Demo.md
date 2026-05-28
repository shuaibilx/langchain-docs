# Voice Agent — 实操 Demo

## 项目结构

```
voice-agent/
├── server.py             # WebSocket 服务端
├── client.html           # 浏览器客户端
├── stt.py                # Speech-to-Text 模块
├── tts.py                # Text-to-Speech 模块
├── agent.py              # LangChain Agent
├── requirements.txt
└── .env                  # API Keys
```

---

## Step 1: 环境准备

### requirements.txt

```txt
langchain
langchain-openai
langchain-core
langgraph
websockets
fastapi
uvicorn
assemblyai
cartesia
python-dotenv
```

### .env

```bash
OPENAI_API_KEY=sk-...
ASSEMBLYAI_API_KEY=...
CARTESIA_API_KEY=...
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
```

---

## Step 2: STT 模块

### stt.py

```python
"""Speech-to-Text — 使用 AssemblyAI 实时转录"""

import os
import json
import asyncio
import contextlib
from typing import AsyncIterator
from dataclasses import dataclass


@dataclass
class STTEvent:
    type: str  # "stt_chunk" or "stt_output"
    transcript: str


class AssemblyAISTT:
    """AssemblyAI 实时 STT 客户端。"""

    def __init__(self, api_key: str | None = None, sample_rate: int = 16000):
        self.api_key = api_key or os.getenv("ASSEMBLYAI_API_KEY")
        self.sample_rate = sample_rate
        self._ws = None

    async def _ensure_connection(self):
        if self._ws is None:
            import websockets
            url = f"wss://streaming.assemblyai.com/v3/ws?sample_rate={self.sample_rate}&format_turns=true"
            self._ws = await websockets.connect(
                url,
                additional_headers={"Authorization": self.api_key},
            )
        return self._ws

    async def send_audio(self, audio_chunk: bytes):
        ws = await self._ensure_connection()
        await ws.send(audio_chunk)

    async def receive_events(self) -> AsyncIterator[STTEvent]:
        ws = await self._ensure_connection()
        async for raw_message in ws:
            message = json.loads(raw_message)
            if message["type"] == "Turn":
                if message.get("turn_is_formatted"):
                    yield STTEvent(type="stt_output", transcript=message["transcript"])
                else:
                    yield STTEvent(type="stt_chunk", transcript=message["transcript"])

    async def close(self):
        if self._ws:
            await self._ws.close()
            self._ws = None


async def stt_stream(audio_stream: AsyncIterator[bytes]) -> AsyncIterator[STTEvent]:
    """将音频流转录为文本事件。"""
    stt = AssemblyAISTT(sample_rate=16000)

    async def send_audio():
        try:
            async for audio_chunk in audio_stream:
                await stt.send_audio(audio_chunk)
        finally:
            await stt.close()

    send_task = asyncio.create_task(send_audio())
    try:
        async for event in stt.receive_events():
            yield event
    finally:
        with contextlib.suppress(asyncio.CancelledError):
            send_task.cancel()
            await send_task
        await stt.close()
```

---

## Step 3: LangChain Agent

### agent.py

```python
"""语音代理的 LangChain Agent — 三明治店点餐"""

from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.utils.uuid import uuid7
from dataclasses import dataclass


@dataclass
class AgentEvent:
    type: str  # "agent_chunk"
    text: str


# 点餐工具
def add_to_order(item: str, quantity: int) -> str:
    """Add an item to the customer's sandwich order."""
    return f"Added {quantity}x {item} to your order."

def remove_from_order(item: str) -> str:
    """Remove an item from the order."""
    return f"Removed {item} from your order."

def confirm_order() -> str:
    """Confirm the final order and send to kitchen."""
    return "Order confirmed! Sending to kitchen now."

def get_menu() -> str:
    """Get the current menu."""
    return (
        "Menu:\n"
        "- Classic Club: $8.99\n"
        "- Turkey Avocado: $9.99\n"
        "- Veggie Delight: $7.99\n"
        "- Italian BMT: $9.49\n"
        "- Chicken Caesar Wrap: $8.49\n"
        "Drinks: Coffee $2.99, Soda $1.99, Water $0.99"
    )


def create_voice_agent():
    """创建语音代理。"""
    model = init_chat_model("gpt-4o-mini")  # 用快速模型

    system_prompt = """You are a helpful sandwich shop assistant taking voice orders.

RULES:
- Be concise and friendly
- Do NOT use emojis, special characters, or markdown
- Do NOT use bullet points or numbered lists
- Keep responses short (1-3 sentences)
- Your responses will be read by a text-to-speech engine
- Confirm items as they are added
- When the customer says they are done, confirm the full order"""

    agent = create_agent(
        model,
        tools=[add_to_order, remove_from_order, confirm_order, get_menu],
        system_prompt=system_prompt,
        checkpointer=InMemorySaver(),
    )
    return agent


async def agent_stream(event_stream, agent=None):
    """处理 STT 事件，生成代理响应。"""
    agent = agent or create_voice_agent()
    thread_id = str(uuid7())

    async for event in event_stream:
        # 透传上游事件
        yield event

        # 处理最终转录
        if event.type == "stt_output":
            stream = agent.astream(
                {"messages": [HumanMessage(content=event.transcript)]},
                {"configurable": {"thread_id": thread_id}},
                stream_mode="messages",
            )
            async for message, _ in stream:
                if hasattr(message, "text") and message.text:
                    yield AgentEvent(type="agent_chunk", text=message.text)
```

---

## Step 4: TTS 模块

### tts.py

```python
"""Text-to-Speech — 使用 Cartesia 合成语音"""

import os
import json
import time
import base64
import asyncio
from typing import AsyncIterator, Optional
from dataclasses import dataclass


@dataclass
class TTSEvent:
    type: str  # "tts_chunk"
    audio: bytes


class CartesiaTTS:
    """Cartesia TTS 客户端。"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        voice_id: str = "f6ff7c0c-e396-40a9-a70b-f7607edb6937",
        model_id: str = "sonic-3",
        sample_rate: int = 24000,
    ):
        self.api_key = api_key or os.getenv("CARTESIA_API_KEY")
        self.voice_id = voice_id
        self.model_id = model_id
        self.sample_rate = sample_rate
        self._ws = None
        self._context_counter = 0

    def _generate_context_id(self) -> str:
        timestamp = int(time.time() * 1000)
        counter = self._context_counter
        self._context_counter += 1
        return f"ctx_{timestamp}_{counter}"

    async def _ensure_connection(self):
        if self._ws is None:
            import websockets
            url = f"wss://api.cartesia.ai/tts/websocket?api_key={self.api_key}"
            self._ws = await websockets.connect(url)
        return self._ws

    async def send_text(self, text: str | None):
        if not text or not text.strip():
            return
        ws = await self._ensure_connection()
        payload = {
            "model_id": self.model_id,
            "transcript": text,
            "voice": {"mode": "id", "id": self.voice_id},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": self.sample_rate,
            },
            "context_id": self._generate_context_id(),
        }
        await ws.send(json.dumps(payload))

    async def receive_events(self) -> AsyncIterator[TTSEvent]:
        ws = await self._ensure_connection()
        async for raw_message in ws:
            message = json.loads(raw_message)
            if "data" in message and message["data"]:
                audio_chunk = base64.b64decode(message["data"])
                if audio_chunk:
                    yield TTSEvent(type="tts_chunk", audio=audio_chunk)

    async def close(self):
        if self._ws:
            await self._ws.close()
            self._ws = None


async def merge_async_iters(*iters):
    """合并多个异步迭代器，并发产出。"""
    queue = asyncio.Queue()
    done = set()

    async def drain(it, idx):
        try:
            async for item in it:
                await queue.put((idx, item))
        finally:
            done.add(idx)
            if len(done) == len(iters):
                await queue.put(None)

    tasks = [asyncio.create_task(drain(it, i)) for i, it in enumerate(iters)]
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item[1]
    finally:
        for t in tasks:
            t.cancel()


async def tts_stream(event_stream: AsyncIterator) -> AsyncIterator[TTSEvent]:
    """将代理文本事件转为合成音频。"""
    tts = CartesiaTTS()

    async def process_upstream():
        async for event in event_stream:
            yield event
            if hasattr(event, "type") and event.type == "agent_chunk":
                await tts.send_text(event.text)

    try:
        async for event in merge_async_iters(process_upstream(), tts.receive_events()):
            yield event
    finally:
        await tts.close()
```

---

## Step 5: WebSocket 服务端

### server.py

```python
"""Voice Agent WebSocket Server"""

import asyncio
from fastapi import FastAPI, WebSocket
from langchain_core.runnables import RunnableGenerator

from stt import stt_stream
from agent import agent_stream
from tts import tts_stream

app = FastAPI()

# 组装管道
pipeline = (
    RunnableGenerator(stt_stream)
    | RunnableGenerator(agent_stream)
    | RunnableGenerator(tts_stream)
)


@app.websocket("/ws")
async def voice_agent_ws(websocket: WebSocket):
    await websocket.accept()
    print("Client connected")

    async def audio_stream():
        while True:
            try:
                data = await websocket.receive_bytes()
                yield data
            except Exception:
                break

    try:
        output_stream = pipeline.atransform(audio_stream())
        async for event in output_stream:
            if hasattr(event, "type") and event.type == "tts_chunk":
                await websocket.send_bytes(event.audio)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Client disconnected")


@app.get("/")
async def root():
    return {"message": "Voice Agent WebSocket Server. Connect to /ws"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## Step 6: 浏览器客户端

### client.html

```html
<!DOCTYPE html>
<html>
<head>
    <title>Voice Agent - Sandwich Shop</title>
    <style>
        body { font-family: sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
        #status { color: #666; margin: 20px 0; }
        #talk-btn {
            width: 120px; height: 120px; border-radius: 50%;
            background: #0D7377; color: white; border: none;
            font-size: 18px; cursor: pointer;
        }
        #talk-btn:active { background: #0A5C5F; }
        #log { text-align: left; margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
        .msg { margin: 8px 0; padding: 8px; border-radius: 4px; }
        .user { background: #E3F2FD; }
        .agent { background: #E8F5E9; }
    </style>
</head>
<body>
    <h1>Sandwich Shop Voice Agent</h1>
    <p>Hold the button and speak to order</p>
    <button id="talk-btn">Hold to Talk</button>
    <div id="status">Click and hold to start</div>
    <div id="log"></div>

    <script>
        const btn = document.getElementById('talk-btn');
        const status = document.getElementById('status');
        const log = document.getElementById('log');
        let ws, mediaRecorder, audioContext;

        btn.addEventListener('mousedown', startRecording);
        btn.addEventListener('mouseup', stopRecording);
        btn.addEventListener('touchstart', startRecording);
        btn.addEventListener('touchend', stopRecording);

        async function startRecording() {
            status.textContent = 'Listening...';
            btn.style.background = '#e74c3c';

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new AudioContext({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            ws = new WebSocket(`ws://${location.hostname}:8000/ws`);
            ws.binaryType = 'arraybuffer';

            ws.onmessage = (e) => {
                const audioData = e.data;
                playAudio(audioData);
            };

            processor.onaudioprocess = (e) => {
                const data = e.inputBuffer.getChannelData(0);
                const pcm = float32ToInt16(data);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(pcm.buffer);
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            btn._stream = stream;
            btn._processor = processor;
            btn._source = source;
        }

        function stopRecording() {
            status.textContent = 'Processing...';
            btn.style.background = '#0D7377';

            if (btn._processor) btn._processor.disconnect();
            if (btn._source) btn._source.disconnect();
            if (btn._stream) btn._stream.getTracks().forEach(t => t.stop());
            if (ws) ws.close();
        }

        function float32ToInt16(float32Array) {
            const int16Array = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) {
                const s = Math.max(-1, Math.min(1, float32Array[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            return int16Array;
        }

        function playAudio(arrayBuffer) {
            const audioCtx = new AudioContext({ sampleRate: 24000 });
            const int16 = new Int16Array(arrayBuffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768;
            }
            const buffer = audioCtx.createBuffer(1, float32.length, 24000);
            buffer.getChannelData(0).set(float32);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start();
        }
    </script>
</body>
</html>
```

---

## Step 7: 运行

```bash
# 1. 启动服务端
python server.py

# 2. 打开浏览器
# http://localhost:8000

# 3. 按住按钮说话
# "I'd like a classic club sandwich and a coffee"
```

---

## 替换组件

### 用 OpenAI Whisper 替换 AssemblyAI

```python
import openai

async def whisper_stt(audio_bytes: bytes) -> str:
    """使用 OpenAI Whisper 转录。"""
    client = openai.OpenAI()
    # 需要将音频转为文件格式
    import io
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.wav"
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
    )
    return transcript.text
```

### 用 ElevenLabs 替换 Cartesia

```python
import elevenlabs

def elevenlabs_tts(text: str) -> bytes:
    """使用 ElevenLabs 合成语音。"""
    client = elevenlabs.ElevenLabs()
    audio = client.generate(
        text=text,
        voice="Rachel",
        model="eleven_multilingual_v2",
    )
    return audio
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| WebSocket 连接失败 | 服务端未启动 | 先运行 `python server.py` |
| 麦克风无权限 | 浏览器安全限制 | 使用 HTTPS 或 localhost |
| 音频播放无声 | 采样率不匹配 | 确保 TTS 和 AudioContext 采样率一致 |
| 延迟过高 | 模型太慢 | 用 gpt-4o-mini 或 gemini-flash |
| STT 识别不准 | 口音或噪声 | 调整 AssemblyAI 语言设置 |
| TTS 语音不自然 | voice_id 不合适 | 在 Cartesia 控制台试听选择 |
