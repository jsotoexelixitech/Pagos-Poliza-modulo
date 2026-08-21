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

# Modelo a usar. Se puede sobreescribir con la variable de entorno GEMINI_MODEL.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

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


def review_with_gemini(prompt: str) -> str:
    """Envía el prompt a Gemini usando el modelo configurado."""
    client = genai.Client(api_key=GEMINI_API_KEY)

    print(f"[INFO] Usando modelo: {GEMINI_MODEL}")
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    print(f"[OK] Respuesta recibida de: {GEMINI_MODEL}")
    return response.text


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
