# AGENTS.md — Pagos-Poliza-modulo

## Git

- Crear ramas de feature/fix **siempre desde `main`**: `git fetch origin && git checkout -b mi-rama origin/main`.
- **No commitear ni pushear directo a `main`**: solo merge vía PR desde la rama.
- PRs hacia **`qa`**: basar la rama en `origin/qa` (no en `main`) para evitar conflictos masivos.
