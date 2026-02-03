import os
from googleapiclient.discovery import build

# 1. Define the YouTube Search Function
def search_youtube_videos(query, api_key, max_results=5):
    """
    Searches YouTube for educational content and conference talks.
    """
    youtube = build('youtube', 'v3', developerKey=api_key)
    
    # We append terms to the query to target the "high-quality" requirement from your PDF
    refined_query = f"{query} tutorial conference lecture NeurIPS CVPR"
    
    request = youtube.search().list(
        part="snippet",
        q=refined_query,
        type="video",
        videoDuration="medium",  # Filter for medium/long content (likely educational)
        maxResults=max_results,
        relevanceLanguage="en"
    )
    
    response = request.execute()
    
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

# 2. (Optional) Wrap in a LangChain Tool if you plan to plug this into a larger graph later
from langchain_core.tools import Tool

def get_youtube_tool(api_key):
    return Tool(
        name="YouTube_Educational_Search",
        func=lambda q: search_youtube_videos(q, api_key),
        description="Useful for finding educational videos and conference talks for a research topic."
    )