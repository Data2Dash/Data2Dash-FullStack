import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/authStore';

export function getApiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  const token = useAuthStore.getState().token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const groqKey = useSettingsStore.getState().groqApiKey;
  if (groqKey) {
    headers['x-groq-api-key'] = groqKey;
  }

  return headers;
}
