if (typeof window !== 'undefined') {
  // 1. Ensure window.fetch has both a getter and a setter.
  // Chrome extensions (e.g. frame_ant) attempt to overwrite `window.fetch = patchedFetch`.
  // In sandboxed iframes, Window.prototype.fetch may only have a getter, throwing:
  // "TypeError: Cannot set property fetch of #<Window> which has only a getter"
  try {
    const rawFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : undefined;
    let currentFetch = rawFetch;
    const defineFetch = (target: any) => {
      try {
        Object.defineProperty(target, 'fetch', {
          configurable: true,
          enumerable: true,
          get() {
            return currentFetch || rawFetch;
          },
          set(fn: any) {
            currentFetch = typeof fn === 'function' ? fn : rawFetch;
          },
        });
      } catch {}
    };

    defineFetch(window);
    if (typeof Window !== 'undefined' && Window.prototype) {
      defineFetch(Window.prototype);
    }
  } catch {}

  // 2. Suppress non-actionable external browser extension errors in iframe preview
  const isExtensionError = (msg: any, src?: any, err?: any) => {
    const strMsg = typeof msg === 'string' ? msg : (msg && msg.message) || '';
    const strSrc = typeof src === 'string' ? src : '';
    const strStack = (err && err.stack) || '';
    return (
      strSrc.includes('chrome-extension://') ||
      strStack.includes('chrome-extension://') ||
      strMsg.includes('chrome-extension://') ||
      strMsg.includes('frame_ant') ||
      strStack.includes('frame_ant') ||
      strMsg.includes('Cannot set property fetch') ||
      strStack.includes('Cannot set property fetch')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isExtensionError(event.message, event.filename, event.error)) {
        event.preventDefault?.();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        return true;
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event.reason;
      if (isExtensionError(reason, '', reason)) {
        event.preventDefault?.();
        if (typeof (event as any).stopImmediatePropagation === 'function') {
          (event as any).stopImmediatePropagation();
        }
      }
    },
    true
  );

  const origOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (isExtensionError(message, source, error)) {
      return true;
    }
    if (typeof origOnError === 'function') {
      return origOnError.apply(this, arguments as any);
    }
  };
}
export {};
