import math
import ollama
from backend.config import settings

EMBED_MODEL = settings.ollama_embed_model   # nomic-embed-text
EMBED_DIMS = settings.ollama_embed_dims     # 768


def embed_text(text: str) -> list[float]:
    """Return 768-dim embedding vector via nomic-embed-text."""
    text = text[:8000] if len(text) > 8000 else text
    response = ollama.embeddings(model=EMBED_MODEL, prompt=text)
    return response["embedding"]


def embed_batch(texts: list[str]) -> list[list[float]]:
    return [embed_text(t) for t in texts]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a * a for a in vec_a))
    mag_b = math.sqrt(sum(b * b for b in vec_b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def vec_to_str(vec: list[float]) -> str:
    """Convert float list to pgvector string format '[0.1,0.2,...]'."""
    return "[" + ",".join(str(x) for x in vec) + "]"
