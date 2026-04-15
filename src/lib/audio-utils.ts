/**
 * Client-side audio recording and playback utilities for Nova 2 Sonic integration.
 * Records PCM 16-bit 16kHz audio and plays back 24kHz PCM responses.
 */

const RECORD_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

export interface AudioRecorder {
  stop: () => Promise<string>; // returns base64 PCM
}

export interface StreamingRecorder {
  stream: ReadableStream<Uint8Array>;
  stop: () => void;
}

/**
 * Start streaming recording: sends audio chunks to a ReadableStream as they're captured.
 * For real-time Nova Sonic: stream chunks to the server during recording.
 * First chunk is NDJSON config line, then NDJSON audio chunks. Call stop() when done.
 */
export function startStreamingRecording(config: {
  mode: string;
  context?: Record<string, unknown>;
}): StreamingRecorder {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let audioContext: AudioContext | null = null;
  let closed = false;

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: RECORD_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      }).then((s) => {
        stream = s;
        audioContext = new AudioContext({ sampleRate: RECORD_SAMPLE_RATE });
        source = audioContext.createMediaStreamSource(s);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const ctrl = controller;
          if (closed || !ctrl) return;
          const data = e.inputBuffer.getChannelData(0);
          const float32 = new Float32Array(data.length);
          float32.set(data);
          const pcm16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          const line = JSON.stringify({ type: "audio", content: base64 }) + "\n";
          ctrl.enqueue(encoder.encode(line));
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        const configLine = JSON.stringify({ type: "config", mode: config.mode, context: config.context ?? {} }) + "\n";
        if (controller) controller.enqueue(encoder.encode(configLine));
      }).catch((err) => {
        if (controller && !closed) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: String(err) }) + "\n"));
          controller.close();
        }
      });
    },
  });

  return {
    stream: readable,
    stop: () => {
      closed = true;
      if (processor) processor.disconnect();
      if (source) source.disconnect();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioContext) audioContext.close();
      if (controller) controller.close();
    },
  };
}

/**
 * Start recording audio from the microphone.
 * Returns an object with a stop() method that resolves to base64 PCM data.
 */
export async function startRecording(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: RECORD_SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const audioContext = new AudioContext({ sampleRate: RECORD_SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: async () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await audioContext.close();

      // Combine all chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert float32 to int16 PCM
      const pcm16 = new Int16Array(combined.length);
      for (let i = 0; i < combined.length; i++) {
        const s = Math.max(-1, Math.min(1, combined[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    },
  };
}

/**
 * Play streaming audio chunks as they arrive. Starts playback as soon as the first
 * chunk is ready for lower latency (real-time feel).
 */
export async function playAudioChunks(
  chunks: string[],
  sampleRate = PLAYBACK_SAMPLE_RATE
): Promise<void> {
  if (chunks.length === 0) return;
  const combined = chunks.join("");
  return playAudioResponse(combined, sampleRate);
}

/**
 * Play back a base64-encoded PCM 16-bit audio response from Nova Sonic.
 */
export async function playAudioResponse(
  base64Audio: string,
  sampleRate = PLAYBACK_SAMPLE_RATE
): Promise<void> {
  if (!base64Audio) return;

  const audioContext = new AudioContext({ sampleRate });

  // Decode base64 to bytes
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Convert int16 PCM to float32
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }

  // Create audio buffer and play
  const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
  buffer.getChannelData(0).set(float32);

  const sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(audioContext.destination);

  return new Promise((resolve) => {
    sourceNode.onended = () => {
      audioContext.close();
      resolve();
    };
    sourceNode.start();
  });
}

/**
 * Check if the browser supports audio recording.
 */
export function isAudioSupported(): boolean {
  if (typeof window === "undefined") return false;
  const hasMediaDevices = !!navigator.mediaDevices;
  const hasAudioContext = typeof AudioContext !== "undefined";
  return hasMediaDevices && hasAudioContext;
}
