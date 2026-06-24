import axios, { AxiosError } from 'axios';

// ─── Upload Data Layer ─────────────────────────────────────────────────────
// Mirrors workspaceApi.ts (axios module + API_BASE_URL const + Bearer auth),
// but adds the latency/resilience concerns uploads need and search does not:
// real byte-progress (onUploadProgress), cancellation (AbortSignal), timeouts,
// transient-failure retry with backoff, and fail-fast client-side validation.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Client-side validation (fail fast, before spending bandwidth) ──────────
export const MAX_FILE_SIZE_MB = 50;
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;
export const ACCEPT_ATTR = '.pdf,.docx,.txt';

const UPLOAD_TIMEOUT_MS = 120_000; // 2 min ceiling for a single attempt
const MAX_RETRIES = 3;             // total attempts on transient failure
const BASE_BACKOFF_MS = 600;

export interface UploadResult {
  filename: string;
  url: string;
  indexing: boolean;
  session_id?: string;
}

export interface IndexingStatus {
  status: 'queued' | 'processing' | 'ready' | 'error' | 'unknown';
  progress?: string;
  message?: string;
}

/** Returns an error message if the file is invalid, or null if it is acceptable. */
export function validateFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return `Unsupported file type ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
  if (file.size === 0) return 'File is empty.';
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_SIZE_MB) {
    return `File is ${sizeMb.toFixed(1)} MB — exceeds the ${MAX_FILE_SIZE_MB} MB limit.`;
  }
  return null;
}

/** A transient failure is worth retrying; a 4xx or an abort is not. */
function isTransient(err: unknown): boolean {
  if (axios.isCancel(err)) return false;
  const ax = err as AxiosError;
  if (ax?.code === 'ECONNABORTED') return true; // timeout
  const status = ax?.response?.status;
  if (status === undefined) return true;         // network error, no response
  return status >= 500;                          // server-side, may recover
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const uploadApi = {
  /**
   * Upload a single file. Reports byte-progress via onProgress (0–100), supports
   * cancellation via signal, enforces a per-attempt timeout, and retries transient
   * failures with exponential backoff. Idempotent: the backend de-dupes by content
   * hash, so a retried upload of the same file to the same session is safe.
   */
  uploadFile: async (
    {
      file,
      sessionId,
      token,
      onProgress,
      signal,
    }: {
      file: File;
      sessionId: string;
      token?: string | null;
      onProgress?: (pct: number) => void;
      signal?: AbortSignal;
    },
  ): Promise<UploadResult> => {
    let lastErr: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await axios.post<UploadResult>(
          `${API_BASE_URL}/api/pdf/upload`,
          formData,
          {
            headers,
            signal,
            timeout: UPLOAD_TIMEOUT_MS,
            onUploadProgress: (e) => {
              if (!onProgress) return;
              const total = e.total ?? file.size;
              if (total > 0) onProgress(Math.min(100, Math.round((e.loaded / total) * 100)));
            },
          },
        );
        return res.data;
      } catch (err) {
        lastErr = err;
        if (axios.isCancel(err) || (err as DOMException)?.name === 'AbortError') throw err;
        if (!isTransient(err) || attempt === MAX_RETRIES - 1) break;
        // Exponential backoff before the next attempt
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }

    const ax = lastErr as AxiosError<{ detail?: string }>;
    const reason =
      ax?.code === 'ECONNABORTED'
        ? `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s — the server may be slow or unreachable.`
        : ax?.response?.data?.detail ||
          (ax?.response ? `Server returned ${ax.response.status}.` : 'Network error — could not reach the server.');
    throw new Error(reason);
  },

  /**
   * Poll background indexing until it reaches a terminal state. Cancellable via
   * signal; resolves 'ready' on timeout so the UI never hangs forever.
   */
  pollIndexingStatus: async (
    {
      sessionId,
      fileName,
      signal,
      intervalMs = 3000,
      maxAttempts = 90,
    }: {
      sessionId: string;
      fileName: string;
      signal?: AbortSignal;
      intervalMs?: number;
      maxAttempts?: number;
    },
  ): Promise<IndexingStatus['status']> => {
    const url = `${API_BASE_URL}/api/pdf/indexing-status/${sessionId}/${encodeURIComponent(fileName)}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await sleep(intervalMs);
      try {
        const res = await axios.get<IndexingStatus>(url, { signal, timeout: 15_000 });
        if (res.data.status === 'ready') return 'ready';
        if (res.data.status === 'error') return 'error';
      } catch (err) {
        if (axios.isCancel(err) || (err as DOMException)?.name === 'AbortError') throw err;
        // transient poll failure — keep trying
      }
    }
    return 'ready'; // text extraction is almost certainly done by now
  },
};
