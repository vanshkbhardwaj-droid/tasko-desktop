# Tasko Desktop architecture

Tasko is a standalone Electron application. Its React interface is bundled by Vite and opened from the installed application files; no Tasko window loads a remote page. The only optional external journey is the deliberate sign-in-to-sync action, which uses the operating system browser.

The main process owns a SQLite database at the operating system’s application-data location. The renderer cannot access Node, SQLite, filesystem paths, or update controls directly. It calls a small, validated IPC bridge exposed through preload. Database schema changes run in a transaction and take a timestamped backup before applying new migrations.

The app packages a Qwen 2.5 0.5B Q3_K_S GGUF model and node-llama-cpp runtime for offline grounded replies, plus locally bundled operational reference data, help, templates, and fonts. If the model is unavailable, Tasko says so and returns only deterministic local search results; it does not fabricate an answer.

Local PDF output is created using PDFKit from the main process into the user’s Documents/Tasko directory. Noto Sans Arabic is embedded for bilingual and RTL line items. The app’s CSP rejects network connections from the renderer.
