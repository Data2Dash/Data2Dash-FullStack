import axios from 'axios';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface WorkspaceFile {
  file_id: string;
  filename: string;
  original_name: string;
  file_type: string;
  size_bytes: number;
  storage_path: string;
  session_id: string;
  url: string;
  uploaded_at: string;
  updated_at: string;
}

export interface WorkspaceSession {
  session_id: string;
  title: string;
  session_type: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSearch {
  search_id: number;
  query_text: string;
  search_type: string;
  timestamp: string;
}

export interface WorkspaceSummary {
  workspace: {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
  };
  file_count: number;
  session_count: number;
  recent_files: WorkspaceFile[];
  recent_sessions: WorkspaceSession[];
  recent_searches: WorkspaceSearch[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── API Methods ────────────────────────────────────────────────────────────

export const workspaceApi = {
  getSummary: async (token: string): Promise<WorkspaceSummary> => {
    const response = await axios.get(`${API_BASE_URL}/api/workspace`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  getSessionMessages: async (sessionId: string, token: string) => {
    const response = await axios.get(`${API_BASE_URL}/api/workspace/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  /** Save a completed search to the backend database */
  saveSearch: async (
    token: string,
    queryText: string,
    resultCount?: number,
    searchType = 'academic',
  ): Promise<WorkspaceSearch> => {
    const response = await axios.post(
      `${API_BASE_URL}/api/workspace/searches`,
      { query_text: queryText, search_type: searchType, result_count: resultCount ?? null },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return response.data;
  },

  /** Get full search history */
  getSearches: async (token: string, limit = 50): Promise<WorkspaceSearch[]> => {
    const response = await axios.get(`${API_BASE_URL}/api/workspace/searches?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },
};
