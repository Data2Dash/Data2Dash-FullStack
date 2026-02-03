import streamlit as st
from youtube_agent import search_youtube_videos

# --- Page Config ---
st.set_page_config(page_title="DATA2DASH - YouTube Agent", layout="wide")

# --- Header Section ---
st.title("📺 DATA2DASH: Smart YouTube Recommender")
st.markdown("""
This agent retrieves **high-quality educational videos and conference talks** (e.g., NeurIPS, CVPR) related to research papers.
""")

# --- Main Input Area ---
col1, col2 = st.columns([3, 1])
with col1:
    topic = st.text_input("Enter Research Paper Topic or Keyword", 
                          placeholder="e.g., Attention Mechanisms in Transformers")
with col2:
    search_btn = st.button("Find Videos", type="primary", use_container_width=True)

# --- Results Section ---
if search_btn and topic:
    # Check if the key is actually there
    if not st.secrets["GOOGLE_API_KEY"] or "AIza" not in st.secrets["GOOGLE_API_KEY"]:
        st.error("Please ensure you have pasted a valid API Key in the code.")
    else:
        with st.spinner(f"Searching for high-quality talks on '{topic}'..."):
            try:
                results = search_youtube_videos(topic, st.secrets["GOOGLE_API_KEY"])
                
                if not results:
                    st.warning("No videos found. Try a different keyword.")
                else:
                    st.success(f"Found {len(results)} relevant videos.")
                    
                    # Display videos in a grid
                    for vid in results:
                        with st.container():
                            c1, c2 = st.columns([1, 2])
                            
                            # Column 1: Thumbnail
                            with c1:
                                st.image(vid['thumbnail'], use_container_width=True)
                            
                            # Column 2: Details
                            with c2:
                                st.subheader(f"[{vid['title']}]({vid['link']})")
                                st.caption(f"**Channel:** {vid['channel']}")
                                st.write(vid['description'])
                                st.divider()
                                
            except Exception as e:
                st.error(f"An error occurred: {e}")

elif search_btn and not topic:
    st.warning("Please enter a topic first.")