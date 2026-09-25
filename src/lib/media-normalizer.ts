const MAX_IMAGE_SOURCE = 24 * 1024 * 1024;
const MAX_IMAGE_OUTPUT = 2 * 1024 * 1024;
const MAX_AUDIO_SOURCE = 32 * 1024 * 1024;
const MAX_AUDIO_OUTPUT = 18 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 20 * 60;

export type NormalizedMedia = { blob: Blob; name: string; mimeType: string };

function imageBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("This image could not be optimized.")), mimeType, quality,
  ));
}

async function normalizeImage(file: File): Promise<NormalizedMedia> {
  if (file.size > MAX_IMAGE_SOURCE) throw new Error("Images must be smaller than 24 MB before optimization.");
  if (!window.createImageBitmap) throw new Error("This browser cannot resize images. Try a smaller image.");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This image could not be optimized.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await imageBlob(canvas, "image/webp", 0.78).catch(() => null);
    const mimeType = webp?.type === "image/webp" ? "image/webp" : "image/jpeg";
    let blob = webp?.type === mimeType ? webp : await imageBlob(canvas, mimeType, 0.78);
    for (const quality of [0.68, 0.58, 0.48]) {
      if (blob.size <= MAX_IMAGE_OUTPUT) break;
      blob = await imageBlob(canvas, mimeType, quality);
    }
    if (blob.size > MAX_IMAGE_OUTPUT) throw new Error("This image is still over 2 MB after optimization.");
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob, name: `${base}.${mimeType === "image/webp" ? "webp" : "jpg"}`, mimeType };
  } finally {
    bitmap.close();
  }
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function normalizeWav(file: File): Promise<NormalizedMedia> {
  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot optimize WAV audio. Use MP3, M4A, Ogg or Opus instead.");
  const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser cannot optimize WAV audio. Use MP3, M4A, Ogg or Opus instead.");

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error("This browser cannot optimize WAV audio. Use MP3, M4A, Ogg or Opus instead.");
  const context = new AudioContextConstructor();
  let recorder: MediaRecorder | null = null;
  try {
    const recorderReady = context.resume();
    const audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
    await recorderReady;
    if (!Number.isFinite(audioBuffer.duration) || audioBuffer.duration > MAX_AUDIO_SECONDS) {
      throw new Error("Audio must be 20 minutes or shorter to keep storage manageable.");
    }
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 1;
    destination.channelCountMode = "explicit";
    source.connect(destination);
    recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<Blob>((resolve, reject) => {
      if (!recorder) return reject(new Error("This audio could not be optimized."));
      recorder.onerror = () => reject(new Error("This audio could not be optimized."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || mimeType }));
    });
    recorder.start(1000);
    const finished = new Promise<void>((resolve) => { source.onended = () => resolve(); });
    source.start();
    await finished;
    recorder.stop();
    const blob = await stopped;
    if (!blob.size || blob.size > MAX_AUDIO_OUTPUT) throw new Error("The optimized audio exceeds the 18 MB limit.");
    const base = file.name.replace(/\.[^.]+$/, "") || "audio";
    return { blob, name: `${base}.${blob.type.includes("ogg") ? "ogg" : "webm"}`, mimeType: blob.type || mimeType };
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    await context.close();
  }
}

export async function normalizeMedia(file: File): Promise<NormalizedMedia> {
  const extension = extensionOf(file.name);
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension)) return normalizeImage(file);
  const wav = file.type === "audio/wav" || file.type === "audio/x-wav" || ["wav", "wave"].includes(extension);
  const audio = file.type.startsWith("audio/") || ["mp3", "m4a", "aac", "ogg", "oga", "opus", "webm"].includes(extension);
  if (!audio) throw new Error("Choose a JPEG, PNG or WebP image, or an audio file.");
  if (file.size > MAX_AUDIO_SOURCE) throw new Error("Audio files must be smaller than 32 MB before optimization.");
  if (wav) return normalizeWav(file);
  if (file.size > MAX_AUDIO_OUTPUT) throw new Error("Compressed audio must be 18 MB or smaller.");
  const inferredType = file.type || (extension === "mp3" ? "audio/mpeg" : extension === "m4a" ? "audio/mp4" : `audio/${extension}`);
  return { blob: file, name: file.name, mimeType: inferredType };
}
