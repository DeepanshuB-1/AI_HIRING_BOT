import fitz  # PyMuPDF
from docx import Document as DocxDocument
from pathlib import Path


def extract_resume_text(file_path: str) -> str:
    """Layer 1 — extract raw text from PDF, DOCX, or plain text resume."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        doc = fitz.open(file_path)
        return "\n".join(page.get_text() for page in doc)

    elif suffix == ".docx":
        doc = DocxDocument(file_path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    elif suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8")

    else:
        raise ValueError(f"Unsupported resume format: {suffix}. Use PDF, DOCX, or TXT.")
