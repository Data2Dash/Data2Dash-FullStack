export interface CitationPaper {
  id: string;
  title: string;
  authors: string[];
  year: string;
  url: string;
  doi: string;
}

export interface CitationFormatResponse {
  apa: string;
  mla: string;
  chicago: string;
  bibtex: string;
  source: string;
}

const API_BASE_URL = 'http://localhost:8000/api/citation';

export async function searchCitations(sentence: string): Promise<CitationPaper[]> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sentence }),
  });
  if (!response.ok) {
    throw new Error('Failed to search citations');
  }
  const data = await response.json();
  return data.papers || [];
}

export async function formatCitation(paper: CitationPaper): Promise<CitationFormatResponse> {
  const response = await fetch(`${API_BASE_URL}/format`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      url: paper.url,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to format citation');
  }
  return await response.json();
}
