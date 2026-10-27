# canvas-confetti

- Library: canvas-confetti 1.9.4 by Kiril Vatev.
- Upstream: https://github.com/catdad/canvas-confetti
- Pinned commit: 20eebad51dde793070c373d594099a7ed8d96e22
- Source: src/confetti.js, unmodified inside a private module wrapper.
- License: ISC; the complete notice is in canvas-confetti.LICENSE.txt.
- The wrapper exports to the extension runtime, without creating or replacing window.confetti.
- Code is shipped locally. No CDN or external script is requested at runtime.
- The extension uses a custom canvas, useWorker: false, and reduced-motion support.
