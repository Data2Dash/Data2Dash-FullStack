// Video Generation API Service

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const VIDEO_VOICES = [
    { id: 'en-US-AndrewNeural',     label: 'Andrew (US)' },
    { id: 'en-US-AvaNeural',        label: 'Ava (US)' },
    { id: 'en-US-ChristopherNeural',label: 'Christopher (US)' },
    { id: 'en-GB-SoniaNeural',      label: 'Sonia (UK)' },
    { id: 'en-AU-WilliamNeural',    label: 'William (AU)' },
] as const;

export type VideoVoiceId = typeof VIDEO_VOICES[number]['id'];

export interface VideoGenerateRequest {
    paper_content: string;
    paper_title?: string;
    num_slides?: number;
    voice?: string;
}

export interface VideoGenerateResponse {
    task_id: string;
    status: string;
    message: string;
}

export interface VideoStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    video_url?: string;
}

export async function generateVideo(request: VideoGenerateRequest): Promise<VideoGenerateResponse> {
    const res = await fetch(`${API_BASE_URL}/api/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Failed to start video generation: ${res.statusText}`);
    return res.json();
}

export async function getVideoStatus(taskId: string): Promise<VideoStatusResponse> {
    const res = await fetch(`${API_BASE_URL}/api/video/status/${taskId}`);
    if (!res.ok) throw new Error(`Failed to get video status: ${res.statusText}`);
    return res.json();
}

export function getVideoDownloadUrl(taskId: string): string {
    return `${API_BASE_URL}/api/video/download/${taskId}`;
}

export async function pollVideoStatus(
    taskId: string,
    onProgress?: (s: VideoStatusResponse) => void,
    intervalMs = 3000,
): Promise<VideoStatusResponse> {
    return new Promise((resolve, reject) => {
        const poll = async () => {
            try {
                const status = await getVideoStatus(taskId);
                onProgress?.(status);
                if (status.status === 'completed') resolve(status);
                else if (status.status === 'failed') reject(new Error(status.message));
                else setTimeout(poll, intervalMs);
            } catch (e) { reject(e); }
        };
        poll();
    });
}
