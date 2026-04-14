import os
from typing import List, Dict, Optional
from googleapiclient.discovery import build
from pydantic import BaseModel

class YouTubeVideo(BaseModel):
    """Model for YouTube video data"""
    title: str
    description: str
    thumbnail: str
    video_id: str
    link: str
    channel: str

class YouTubeAgent:
    """Agent for searching educational YouTube videos about research papers"""
    
    def __init__(self, api_key: str):
        """Initialize YouTube Agent with API key"""
        self.api_key = api_key
        self._youtube = None  # Lazy init to avoid slow network call at startup

    def _get_client(self):
        """Get or create the YouTube API client (lazy initialization)"""
        if self._youtube is None:
            self._youtube = build('youtube', 'v3', developerKey=self.api_key)
        return self._youtube
    
    def _build_search_query(self, paper_title: str, paper_abstract: str = "") -> str:
        """
        Build an optimized search query for educational content
        
        Args:
            paper_title: Title of the research paper
            paper_abstract: Abstract of the paper (optional)
        
        Returns:
            Optimized search query string
        """
        # Start with paper title
        query = paper_title
        
        # Add educational keywords to target high-quality content
        educational_keywords = [
            "tutorial",
            "lecture", 
            "conference",
            "explained",
            "NeurIPS",
            "CVPR",
            "ICML",
            "ICLR"
        ]
        
        # Append keywords to improve relevance
        query += " " + " ".join(educational_keywords[:3])  # Use first 3 to avoid too long query
        
        return query
    
    def search_videos(
        self, 
        paper_title: str, 
        paper_abstract: str = "",
        max_results: int = 6,
        max_retries: int = 3
    ) -> List[Dict]:
        """
        Search for YouTube videos related to a research paper
        
        Args:
            paper_title: Title of the research paper
            paper_abstract: Abstract of the paper (optional)
            max_results: Maximum number of videos to return (default: 6)
            max_retries: Maximum number of retry attempts (default: 3)
        
        Returns:
            List of video dictionaries with metadata
        """
        import time
        
        # Build optimized search query
        query = self._build_search_query(paper_title, paper_abstract)
        
        for attempt in range(max_retries):
            try:
                # Execute YouTube search
                request = self._get_client().search().list(
                    part="snippet",
                    q=query,
                    type="video",
                    videoDuration="medium",  # Filter for medium/long videos (educational content)
                    maxResults=max_results,
                    relevanceLanguage="en",
                    order="relevance"  # Sort by relevance
                )
                
                response = request.execute()
                
                # Parse and format results
                videos = []
                for item in response.get('items', []):
                    video_data = {
                        'title': item['snippet']['title'],
                        'description': item['snippet']['description'],
                        'thumbnail': item['snippet']['thumbnails']['high']['url'],
                        'video_id': item['id']['videoId'],
                        'link': f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                        'channel': item['snippet']['channelTitle']
                    }
                    videos.append(video_data)
                
                return videos
                
            except Exception as e:
                error_msg = str(e)
                print(f"Attempt {attempt + 1}/{max_retries} failed: {error_msg}")
                
                # Check if it's an SSL error
                if "SSL" in error_msg or "ssl" in error_msg.lower():
                    if attempt < max_retries - 1:
                        # Exponential backoff: 1s, 2s, 4s
                        wait_time = 2 ** attempt
                        print(f"SSL error detected. Retrying in {wait_time} seconds...")
                        time.sleep(wait_time)
                        
                        # Recreate the YouTube client to reset connection
                        try:
                            self._youtube = build('youtube', 'v3', developerKey=self.api_key)
                        except:
                            pass
                        continue
                    else:
                        raise Exception(f"Failed after {max_retries} attempts due to SSL errors. This may be caused by network issues, firewall, or proxy settings.")
                else:
                    # Non-SSL error, raise immediately
                    raise Exception(f"Failed to search YouTube videos: {error_msg}")
        
        # If we get here, all retries failed
        raise Exception(f"Failed to search YouTube videos after {max_retries} attempts")
    
    def get_video_details(self, video_id: str) -> Dict:
        """
        Get detailed information about a specific video
        
        Args:
            video_id: YouTube video ID
        
        Returns:
            Dictionary with detailed video information
        """
        try:
            request = self._get_client().videos().list(
                part="snippet,statistics,contentDetails",
                id=video_id
            )
            
            response = request.execute()
            
            if not response.get('items'):
                raise Exception(f"Video not found: {video_id}")
            
            item = response['items'][0]
            
            return {
                'title': item['snippet']['title'],
                'description': item['snippet']['description'],
                'thumbnail': item['snippet']['thumbnails']['high']['url'],
                'video_id': video_id,
                'link': f"https://www.youtube.com/watch?v={video_id}",
                'channel': item['snippet']['channelTitle'],
                'view_count': item['statistics'].get('viewCount', 'N/A'),
                'like_count': item['statistics'].get('likeCount', 'N/A'),
                'duration': item['contentDetails']['duration']
            }
            
        except Exception as e:
            print(f"Error getting video details: {str(e)}")
            raise Exception(f"Failed to get video details: {str(e)}")
