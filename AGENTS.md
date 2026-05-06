# Piano Scale Practice Game — Agent Notes

## Stack
- Vite + TypeScript, no UI framework
- Plain CSS in src/styles.css (no Tailwind, no CSS modules)
- Web Audio API for synthesized feedback
- Web MIDI for hardware input

## Conventions
- Functional, module-scoped TypeScript. No classes for DOM components.
- Styles are global in src/styles.css. Use BEM-ish naming (.title-screen__button, etc.).

## Things to avoid
- Don't introduce a UI framework or CSS-in-JS.
- Don't refactor existing screens unless explicitly asked.
- Don't add dependencies without strong justification.
