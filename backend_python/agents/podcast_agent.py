import os
import re
import asyncio
import json
from io import BytesIO
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from langchain_community.document_loaders import PyPDFLoader
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydub import AudioSegment
import edge_tts
import static_ffmpeg

# --- Structured Data Models ---
class PodcastLine(BaseModel):
    speaker: str = Field(description="Must be Alex or Jordan")
    text: str = Field(description="The dialogue text")

class PodcastScript(BaseModel):
    lines: List[PodcastLine]

class PodcastAgent:
    def __init__(self, groq_api_key: str):
        """Initialize the Podcast Agent with Groq API key"""
        static_ffmpeg.add_paths()  # Lazy init: download ffmpeg only when agent is first used
        self.groq_api_key = groq_api_key
        self.llm = ChatGroq(
            groq_api_key=groq_api_key,
            model_name="llama-3.3-70b-versatile",
            temperature=0.7
        )

        # Voice mappings - Microsoft Edge TTS voices (FREE and high quality!)
        self.default_voices = {
            "Alex": "en-US-GuyNeural",      # Male, natural and friendly
            "Jordan": "en-US-JennyNeural"   # Female, warm and professional
        }

        # Length configurations
        self.length_configs = {
            "Short": {
                "char_limit": 10000,
                "instruction": "Write a concise 8-line script focusing only on the main takeaway.",
                "duration": "~2 minutes"
            },
            "Medium": {
                "char_limit": 20000,
                "instruction": "Write a detailed 18-line script exploring 3-4 key points with examples.",
                "duration": "~5 minutes"
            },
            "Long": {
                "char_limit": 35000,
                "instruction": "Write an extensive 30-line script. Deep dive into every detail, discuss implications, use analogies, and have a long debate.",
                "duration": "~10 minutes"
            }
        }

    async def _generate_voice_with_retry(self, text: str, voice: str, max_retries: int = 3) -> bytes:
        """Generate voice audio from text using Edge TTS with retry logic"""
        # Clean text from any markdown or special characters
        clean_text = re.sub(r'\[.*?\]', '', text)

        for attempt in range(max_retries):
            try:
                # Create communicate object with timeout
                communicate = edge_tts.Communicate(clean_text, voice)
                audio_data = b""

                # Stream audio with timeout protection
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_data += chunk["data"]

                if audio_data:
                    return audio_data
                else:
                    raise Exception("No audio data received")

            except asyncio.TimeoutError:
                print(f"Timeout on attempt {attempt + 1}/{max_retries} for text: {clean_text[:50]}...")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    raise Exception(f"Failed to generate audio after {max_retries} attempts (timeout)")

            except Exception as e:
                print(f"Error on attempt {attempt + 1}/{max_retries}: {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    raise Exception(f"Failed to generate audio after {max_retries} attempts: {str(e)}")

        raise Exception("Failed to generate audio")

    def _generate_script(self, content: str, length: str = "Medium") -> PodcastScript:
        """Generate podcast script from paper content using LLM"""
        config = self.length_configs.get(length, self.length_configs["Medium"])

        # Truncate content based on length
        truncated_content = content[:config["char_limit"]]

        # Create system message - use string concatenation to avoid f-string issues with braces
        system_message = (
            "You are a professional podcast producer. Create an engaging conversation between two hosts, Alex and Jordan, discussing a research paper.\n\n"
            + config["instruction"] + "\n\n"
            "Make the conversation:\n"
            "- Natural and engaging\n"
            "- Educational but accessible\n"
            "- Include questions and answers between hosts\n"
            "- Use analogies to explain complex concepts\n"
            "- Show enthusiasm about interesting findings\n\n"
            "IMPORTANT: You must respond with ONLY a valid JSON object in this exact format:\n"
            "{{\n"
            '  "lines": [\n'
            '    {{"speaker": "Alex", "text": "Welcome to the podcast..."}},\n'
            '    {{"speaker": "Jordan", "text": "Thanks Alex..."}}\n'
            "  ]\n"
            "}}\n\n"
            'Each speaker must be either "Alex" or "Jordan". Do not include any other text outside the JSON.'
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_message),
            ("human", "Research Paper Content:\n\n{content}\n\nCreate an engaging podcast script about this paper in JSON format.")
        ])

        # Generate script
        try:
            chain = prompt | self.llm
            response = chain.invoke({"content": truncated_content})

            # Parse the response content
            response_text = response.content if hasattr(response, 'content') else str(response)

            # Clean up response to extract JSON
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            # Parse JSON
            script_data = json.loads(response_text)
            script_object = PodcastScript(**script_data)

            return script_object
        except Exception as e:
            print(f"Error parsing script: {e}")
            print(f"Response: {response_text[:500] if 'response_text' in locals() else 'No response'}")
            raise Exception(f"Failed to generate valid podcast script: {str(e)}")

    async def _synthesize_audio(
        self,
        script: PodcastScript,
        voices: Optional[Dict[str, str]] = None,
        progress_callback = None
    ) -> AudioSegment:
        """Synthesize audio from script using TTS"""
        if voices is None:
            voices = self.default_voices

        final_audio = AudioSegment.empty()
        total_lines = len(script.lines)

        for i, line in enumerate(script.lines):
            # Determine voice
            voice = voices.get("Alex") if "Alex" in line.speaker else voices.get("Jordan")
            if not voice:
                voice = self.default_voices["Alex"] if "Alex" in line.speaker else self.default_voices["Jordan"]

            # Generate audio for this line with retry
            audio_bytes = await self._generate_voice_with_retry(line.text, voice)

            # Convert to AudioSegment
            seg = AudioSegment.from_file(BytesIO(audio_bytes), format="mp3")

            # Add to final audio with pause
            final_audio += seg + AudioSegment.silent(duration=700)

            # Progress callback - calculate progress percentage
            if progress_callback:
                progress_pct = 30 + int((i + 1) / total_lines * 60)  # 30-90% range for audio synthesis
                progress_callback(f"Synthesizing audio ({i + 1}/{total_lines} lines)...", progress_pct)

        return final_audio

    def _mix_audio(
        self,
        voice_audio: AudioSegment,
        add_music: bool = True,
        bg_music_path: str = "bg.mp3"
    ) -> AudioSegment:
        """Mix voice audio with background music"""
        if not add_music or not os.path.exists(bg_music_path):
            return voice_audio.fade_in(1000).fade_out(3000)

        try:
            # Load background music
            bg = AudioSegment.from_file(bg_music_path)

            # Loop background music to match voice length
            loop_count = (len(voice_audio) // len(bg)) + 1
            bg_final = (bg * loop_count)[:len(voice_audio)]

            # Reduce background music volume (28 dB reduction)
            bg_final = bg_final - 28

            # Mix audio
            final_audio = voice_audio.overlay(bg_final)

            # Add fade in/out
            final_audio = final_audio.fade_in(1000).fade_out(3000)

            return final_audio
        except Exception as e:
            print(f"Warning: Could not mix background music: {e}")
            return voice_audio.fade_in(1000).fade_out(3000)

    async def generate_podcast(
        self,
        paper_content: str,
        length: str = "Medium",
        voices: Optional[Dict[str, str]] = None,
        add_music: bool = True,
        progress_callback = None
    ) -> bytes:
        """
        Generate a complete podcast from paper content

        Args:
            paper_content: The text content of the research paper
            length: Podcast length - "Short", "Medium", or "Long"
            voices: Dictionary mapping speaker names to voice names
            add_music: Whether to add background music
            progress_callback: Optional callback function for progress updates

        Returns:
            bytes: MP3 audio data
        """
        try:
            # Step 1: Generate script
            if progress_callback:
                progress_callback("Generating script...", 0)

            script = self._generate_script(paper_content, length)

            # Step 2: Synthesize audio
            if progress_callback:
                progress_callback("Synthesizing audio...", 30)

            voice_audio = await self._synthesize_audio(script, voices, progress_callback)

            # Step 3: Mix with background music
            if progress_callback:
                progress_callback("Mixing audio...", 90)

            final_audio = self._mix_audio(voice_audio, add_music)

            # Step 4: Export to bytes
            if progress_callback:
                progress_callback("Finalizing...", 95)

            output_buffer = BytesIO()
            final_audio.export(output_buffer, format="mp3")

            if progress_callback:
                progress_callback("Complete!", 100)

            return output_buffer.getvalue()

        except Exception as e:
            raise Exception(f"Error generating podcast: {str(e)}")

    async def generate_podcast_from_pdf(
        self,
        pdf_path: str,
        length: str = "Medium",
        voices: Optional[Dict[str, str]] = None,
        add_music: bool = True,
        progress_callback = None
    ) -> bytes:
        """
        Generate podcast directly from a PDF file

        Args:
            pdf_path: Path to the PDF file
            length: Podcast length - "Short", "Medium", or "Long"
            voices: Dictionary mapping speaker names to voice names
            add_music: Whether to add background music
            progress_callback: Optional callback function for progress updates

        Returns:
            bytes: MP3 audio data
        """
        try:
            # Load and extract PDF content
            if progress_callback:
                progress_callback("Loading PDF...", 0)

            loader = PyPDFLoader(pdf_path)
            docs = loader.load()
            full_text = " ".join([d.page_content for d in docs])

            # Generate podcast from text
            return await self.generate_podcast(
                paper_content=full_text,
                length=length,
                voices=voices,
                add_music=add_music,
                progress_callback=progress_callback
            )

        except Exception as e:
            raise Exception(f"Error generating podcast from PDF: {str(e)}")
