import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface YouTubeVideo {
    title: string;
    description: string;
    thumbnail: string;
    video_id: string;
    link: string;
    channel: string;
}

export interface YouTubeSearchResponse {
    videos: YouTubeVideo[];
    query_used: string;
}

export interface YouTubeSearchRequest {
    paper_title: string;
    paper_abstract?: string;
    max_results?: number;
}

/**
 * Search for YouTube videos related to a research paper
 */
export async function searchYouTubeVideos(
    paperTitle: string,
    paperAbstract: string = '',
    maxResults: number = 6
): Promise<YouTubeSearchResponse> {
    try {
        const response = await axios.post<YouTubeSearchResponse>(
            `${API_BASE_URL}/api/youtube/search`,
            {
                paper_title: paperTitle,
                paper_abstract: paperAbstract,
                max_results: maxResults,
            }
        );

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.detail || 'Failed to search YouTube videos');
        }
        throw error;
    }
}

/**
 * Get the YouTube embed URL for a video
 */
export function getYouTubeEmbedUrl(videoId: string): string {
    return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Get the YouTube watch URL for a video
 */
export function getYouTubeWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}
