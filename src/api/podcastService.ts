// Podcast API Service

const API_BASE_URL = 'http://localhost:8000';

export interface PodcastGenerateRequest {
    paper_content: string;
    length: 'Short' | 'Medium' | 'Long';
    voices?: {
        Alex?: string;
        Jordan?: string;
    };
    add_music?: boolean;
}

export interface PodcastGenerateResponse {
    task_id: string;
    status: string;
    message: string;
}

export interface PodcastStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    audio_url?: string;
}

/**
 * Start podcast generation
 */
export async function generatePodcast(
    request: PodcastGenerateRequest
): Promise<PodcastGenerateResponse> {
    const response = await fetch(`${API_BASE_URL}/api/podcast/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error(`Failed to start podcast generation: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get podcast generation status
 */
export async function getPodcastStatus(
    taskId: string
): Promise<PodcastStatusResponse> {
    const response = await fetch(`${API_BASE_URL}/api/podcast/status/${taskId}`);

    if (!response.ok) {
        throw new Error(`Failed to get podcast status: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Download podcast audio
 */
export async function downloadPodcast(taskId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/api/podcast/download/${taskId}`);

    if (!response.ok) {
        throw new Error(`Failed to download podcast: ${response.statusText}`);
    }

    return response.blob();
}

/**
 * Poll for podcast completion
 */
export async function pollPodcastStatus(
    taskId: string,
    onProgress?: (status: PodcastStatusResponse) => void,
    pollInterval: number = 2000
): Promise<PodcastStatusResponse> {
    return new Promise((resolve, reject) => {
        const poll = async () => {
            try {
                const status = await getPodcastStatus(taskId);

                // Call progress callback
                if (onProgress) {
                    onProgress(status);
                }

                // Check if completed or failed
                if (status.status === 'completed') {
                    resolve(status);
                } else if (status.status === 'failed') {
                    reject(new Error(status.message));
                } else {
                    // Continue polling
                    setTimeout(poll, pollInterval);
                }
            } catch (error) {
                reject(error);
            }
        };

        poll();
    });
}

/**
 * Get podcast audio URL
 */
export function getPodcastAudioUrl(taskId: string): string {
    return `${API_BASE_URL}/api/podcast/download/${taskId}`;
}
