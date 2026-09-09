// src/lib/audioWav.ts
//
// Converts the browser's MediaRecorder output (audio/webm) into a valid
// 16-bit PCM WAV blob so the backend/STT receives the format it expects.
// This is the ONLY conversion path in the app — do not duplicate it.

const WAV_HEADER_BYTES = 44;

/**
 * Single shared AudioContext reused for every conversion; decoding on a
 * persistent context is cheaper than creating one per recording.
 */
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return sharedContext;
}

/** Downmix any channel layout to mono Float32 samples. */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

/** Encode mono Float32 samples as a RIFF/WAVE blob with 16-bit PCM data. */
function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF/WAVE header (canonical 44-byte PCM layout)
  writeStr(0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES + dataSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // audio format: PCM
  view.setUint16(22, 1, true);           // channels: mono
  view.setUint32(24, sampleRate, true);  // sample rate
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Float32 [-1, 1] → Int16, clamped to avoid wraparound on clipping
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(WAV_HEADER_BYTES + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Validates that a blob is a RIFF/WAVE file with PCM (format 1) audio at
 * 16 bits per sample. Cheap header check — reads only the first 44 bytes.
 */
export async function isValidWavPcm16(blob: Blob): Promise<boolean> {
  try {
    const buf = await blob.slice(0, WAV_HEADER_BYTES).arrayBuffer();
    if (buf.byteLength < WAV_HEADER_BYTES) return false;

    const view = new DataView(buf);
    const tag = (offset: number, str: string): boolean => {
      const bytes = new Uint8Array(buf, offset, str.length);
      for (let i = 0; i < str.length; i++) {
        if (bytes[i] !== str.charCodeAt(i)) return false;
      }
      return true;
    };

    return (
      tag(0, 'RIFF') &&
      tag(8, 'WAVE') &&
      tag(12, 'fmt ') &&
      view.getUint16(20, true) === 1 &&
      view.getUint16(34, true) === 16
    );
  } catch {
    return false;
  }
}

/**
 * Decode a WebM (or any browser-recorded) audio blob and re-encode it as a
 * 16-bit PCM mono WAV. Throws when decoding fails so callers can surface the
 * error instead of uploading a mislabeled blob.
 */
export async function webmBlobToWav(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const context = getAudioContext();
  const decoded = await context.decodeAudioData(arrayBuffer);
  const wav = encodeWavPcm16(downmixToMono(decoded), decoded.sampleRate);

  if (!(await isValidWavPcm16(wav))) {
    throw new Error('Encoded audio failed 16-bit PCM WAV validation');
  }

  console.info(
    `[STT] WebM (${webmBlob.size} bytes) converted to valid 16-bit PCM WAV ` +
    `(${wav.size} bytes, ${decoded.sampleRate} Hz mono)`
  );

  return wav;
}
