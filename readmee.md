# DATA2DASH - AI-Powered Research Platform

This project is a graduation project platform designed to assist researchers and paper writers with AI-powered tools.

## Project Overview

DATA2DASH is an interactive hub with multiple pages:
1. **Home**: Landing page with project overview.
2. **Web Paper Search & Analysis**: Search papers, chat with them, analyze diagrams, and generate reports.
3. **PDF Upload & Multi-Document Chat**: Upload personal PDFs for cross-document analysis.
4. **Citation Helper**: Generate citations automatically from manuscript text with support for multiple citations, reference list management, and downloadable bibliographies.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Routing**: React Router DOM
- **Styling**: Tailwind CSS, clsx
- **Icons**: Lucide React
- **Animations**: Framer Motion

## Key Components

- `src/pages/`: Page components (HomePage, SearchPage, UploadPage, CitationPage).
- `src/components/sections/`: Feature-specific sections.
- `src/components/layout/`: Navbar and Footer.
- `src/components/ui/`: Reusable UI components.

## Design System

- **Theme**: Modern Science/Tech (Slate/Indigo/Purple).
- **Effects**: Glassmorphism, Mesh Gradients, Floating Animations.
- **Typography**: Inter (Sans) + Serif for academic content.
- **Navigation**: Adaptive navbar with transparent/solid states for optimal visibility.

## Development

- Run `npm run dev` to start the development server.
- Run `npm run build` to build for production.

## Backend Setup (Python)

The project includes a Python backend for AI agents (Search and PDF Analysis).

1. Navigate to `backend_python/`.
2. Install dependencies: `pip install -r requirements.txt`.
3. Set `GROQ_API_KEY` environment variable.
4. Run the server: `python main.py`.
   - The server runs on `http://localhost:8000`.
   - API Docs available at `http://localhost:8000/docs`.
   - New endpoint: `/api/papers/search` for structured paper search.

## Future Improvements

- Integrate real backend for paper search (arXiv API, etc.).
- Implement actual AI processing for chat and analysis.
- Add user authentication and database for saving research history.
