"""
Gemini PR Code Reviewer
-----------------------
Este script extrae el diff de un Pull Request, lo envía a Gemini para análisis
de bugs y vulnerabilidades, y publica los resultados como comentarios en el PR.
"""

import os
import sys
from github import Auth, Github
from google import genai

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
PR_NUMBER = os.environ.get("PR_NUMBER")
REPO_NAME = os.environ.get("REPO_NAME")

# Preferencias de modelo en orden. Se usará el primero que esté disponible.
MODEL_PREFERENCES = [
    "gemini-3.6-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
]

# Extensiones de archivo a revisar (omite binarios, locks, etc.)
REVIEWABLE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".kt", ".go", ".rs", ".c", ".cpp", ".h",
    ".cs", ".php", ".rb", ".swift", ".sh",
    ".yaml", ".yml", ".json", ".xml", ".sql",
    ".html", ".css", ".scss",
}

SYSTEM_PROMPT = """Eres un desarrollador senior con más de 15 años de experiencia en seguridad,
calidad de código y buenas prácticas de ingeniería de software.

Tu tarea es revisar el siguiente diff de un Pull Request y reportar:
1. **Bugs** – errores lógicos, condiciones de carrera, manejo incorrecto de errores, etc.
2. **Vulnerabilidades de seguridad** – inyecciones, datos expuestos, autenticación débil, etc.
3. **Code smells y malas prácticas** – código duplicado, funciones demasiado largas, nombres confusos, etc.
4. **Sugerencias de mejora** – optimizaciones, patrones recomendados, etc.

Formato de respuesta:
- Usa Markdown con encabezados claros.
- Para cada hallazgo indica: **archivo**, **línea aproximada**, **descripción** y **sugerencia de corrección**.
- Si no encuentras problemas en un archivo, indícalo brevemente.
- Sé conciso pero preciso. No repitas el código completo, solo las líneas relevantes.
- Responde siempre en el mismo idioma en que está escrito el código o sus comentarios.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_env() -> None:
    """Valida que todas las variables de entorno necesarias estén definidas."""
    missing = [
        var for var, val in {
            "GITHUB_TOKEN": GITHUB_TOKEN,
            "GEMINI_API_KEY": GEMINI_API_KEY,
            "PR_NUMBER": PR_NUMBER,
            "REPO_NAME": REPO_NAME,
        }.items() if not val
    ]
    if missing:
        print(f"[ERROR] Faltan variables de entorno: {', '.join(missing)}")
        sys.exit(1)


def is_reviewable(filename: str) -> bool:
    """Determina si un archivo debe ser revisado por su extensión."""
    _, ext = os.path.splitext(filename)
    return ext.lower() in REVIEWABLE_EXTENSIONS


def get_pr_diffs(repo, pr_number: int) -> dict[str, str]:
    """
    Retorna un diccionario { filename: patch } con los diffs
    de los archivos modificados en el PR que sean revisables.
    """
    pr = repo.get_pull(pr_number)
    files = pr.get_files()
    diffs: dict[str, str] = {}

    for f in files:
        if f.patch and is_reviewable(f.filename):
            diffs[f.filename] = f.patch

    return diffs, pr


def build_prompt(diffs: dict[str, str]) -> str:
    """Construye el prompt completo con todos los diffs."""
    sections = []
    for filename, patch in diffs.items():
        sections.append(f"### Archivo: `{filename}`\n```diff\n{patch}\n```")

    diff_text = "\n\n".join(sections)
    return (
        f"{SYSTEM_PROMPT}\n\n"
        "---\n\n"
        "## Diff del Pull Request\n\n"
        f"{diff_text}\n\n"
        "---\n\n"
        "Por favor, proporciona tu revisión detallada:"
    )


def get_model_candidates(client: genai.Client) -> list[str]:
    """
    Retorna la lista de modelos candidatos en orden de preferencia,
    filtrando solo los que están realmente disponibles en la API Key.
    """
    try:
        available = {m.name for m in client.models.list()}
        print(f"[INFO] Modelos disponibles en esta key: {sorted(available)}")
    except Exception as e:
        print(f"[WARN] No se pudo listar modelos: {e}.")
        available = set()

    candidates: list[str] = []

    # Primero los de la lista de preferencias que estén disponibles
    for preferred in MODEL_PREFERENCES:
        if f"models/{preferred}" in available or preferred in available:
            candidates.append(preferred)

    # Fallback: cualquier gemini disponible (excluye embeddings, audio, tts, imagen)
    SKIP_KEYWORDS = {"embedding", "audio", "tts", "image", "aqa", "computer-use",
                     "deep-research", "antigravity", "live"}
    for name in sorted(available):
        model_id = name.replace("models/", "")
        if "gemini" in model_id and not any(kw in model_id for kw in SKIP_KEYWORDS):
            if model_id not in candidates:
                candidates.append(model_id)

    if not candidates:
        raise RuntimeError(
            "No se encontró ningún modelo Gemini compatible. "
            "Verifica que la API Key sea válida."
        )

    print(f"[INFO] Candidatos a probar en orden: {candidates}")
    return candidates


def review_with_gemini(prompt: str) -> str:
    """Envía el prompt a Gemini probando modelos hasta encontrar uno funcional."""
    from google.genai import errors as genai_errors

    client = genai.Client(api_key=GEMINI_API_KEY)
    candidates = get_model_candidates(client)

    last_error: Exception | None = None
    for model in candidates:
        try:
            print(f"[INFO] Intentando con modelo: {model}")
            response = client.models.generate_content(
                model=model,
                contents=prompt,
            )
            print(f"[OK] Respuesta recibida de: {model}")
            return response.text
        except genai_errors.ClientError as e:
            status = getattr(e, 'status_code', None) or getattr(e, 'code', 0)
            if status in (403, 404, 400):
                print(f"[WARN] Modelo {model} no accesible ({status}), probando siguiente...")
                last_error = e
                continue
            raise  # Otro error inesperado: re-lanzar

    raise RuntimeError(
        f"Ninguno de los modelos candidatos pudo procesar la solicitud. "
        f"Último error: {last_error}"
    )


def post_review_comment(pr, review_text: str) -> None:
    """Publica la revisión de Gemini como un comentario general en el PR."""
    header = (
        "## 🤖 Revisión Automática de Código — Gemini AI\n\n"
        "> Este comentario fue generado automáticamente por **Gemini** como parte "
        "del flujo de revisión de código. Por favor, revisa los hallazgos con criterio propio.\n\n"
        "---\n\n"
    )
    pr.create_issue_comment(header + review_text)
    print("[OK] Comentario de revisión publicado en el PR.")


def post_per_file_comments(pr, diffs: dict[str, str], gemini_response: str) -> None:
    """
    Intenta publicar comentarios individuales por archivo cuando Gemini
    identifica hallazgos específicos. Si falla, hace fallback a comentario general.
    """
    # Separamos la respuesta de Gemini por secciones de archivo (heurística simple)
    lines = gemini_response.split("\n")
    current_file: str | None = None
    file_comments: dict[str, list[str]] = {}

    for line in lines:
        # Detecta encabezados como "### Archivo: `src/foo.py`" o "`src/foo.py`"
        if line.startswith("### Archivo:") or line.startswith("## Archivo:"):
            for fname in diffs.keys():
                if fname in line:
                    current_file = fname
                    file_comments.setdefault(current_file, [])
                    break
        elif current_file:
            file_comments[current_file].append(line)

    if not file_comments:
        # No se pudo separar por archivo → comentario general
        post_review_comment(pr, gemini_response)
        return

    for filename, comment_lines in file_comments.items():
        comment_body = "\n".join(comment_lines).strip()
        if not comment_body:
            continue

        file_header = (
            f"## 🤖 Revisión Gemini AI — `{filename}`\n\n"
            "> Hallazgos automáticos para este archivo.\n\n"
            "---\n\n"
        )
        pr.create_issue_comment(file_header + comment_body)
        print(f"[OK] Comentario publicado para: {filename}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    validate_env()

    pr_number = int(PR_NUMBER)

    print(f"[INFO] Conectando al repositorio: {REPO_NAME} — PR #{pr_number}")
    auth = Auth.Token(GITHUB_TOKEN)
    gh = Github(auth=auth)
    repo = gh.get_repo(REPO_NAME)

    print("[INFO] Extrayendo diffs del PR...")
    diffs, pr = get_pr_diffs(repo, pr_number)

    if not diffs:
        print("[INFO] No se encontraron archivos revisables en este PR. Nada que revisar.")
        pr.create_issue_comment(
            "## 🤖 Revisión Automática de Código — Gemini AI\n\n"
            "ℹ️ No se encontraron archivos de código revisables en este Pull Request "
            "(solo se encontraron binarios, archivos de bloqueo u otros no soportados)."
        )
        return

    print(f"[INFO] Archivos a revisar: {list(diffs.keys())}")

    print("[INFO] Enviando diff a Gemini para análisis...")
    prompt = build_prompt(diffs)
    gemini_review = review_with_gemini(prompt)

    print("[INFO] Publicando resultados en el PR...")
    post_per_file_comments(pr, diffs, gemini_review)

    print("[DONE] Revisión completada exitosamente.")


if __name__ == "__main__":
    main()
