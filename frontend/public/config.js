// Development default. In containers this file is replaced at startup by the
// entrypoint script from Helm values (see docker/40-runtime-config.sh).
// Empty apiBaseUrl = same origin (Vite dev proxy / Ingress).
window.__APP_CONFIG__ = { apiBaseUrl: '' }
