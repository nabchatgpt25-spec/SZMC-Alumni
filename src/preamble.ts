if (typeof window !== 'undefined') {
  // 1. Intercept and suppress external browser extension / frame_ant injection errors
  const isExtensionError = (msg: any, src?: any, err?: any) => {
    const strMsg = typeof msg === 'string' ? msg : (msg && msg.message) || '';
    const strSrc = typeof src === 'string' ? src : '';
    const strStack = (err && err.stack) || '';
    return (
      strSrc.includes('chrome-extension://') ||
      strStack.includes('chrome-extension://') ||
      strMsg.includes('Cannot set property fetch') ||
      strMsg.includes('frame_ant') ||
      strStack.includes('frame_ant')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isExtensionError(event.message, event.filename, event.error)) {
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        event.preventDefault?.();
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
        event.stopImmediatePropagation?.();
        event.preventDefault?.();
      }
    },
    true
  );

  const prevOnError = window.onerror;
  window.onerror = function (msg, url, line, col, err) {
    if (isExtensionError(msg, url, err)) {
      return true;
    }
    if (typeof prevOnError === 'function') {
      return (prevOnError as any).apply(this, arguments);
    }
  };

  // 2. Defensive guard for browser extensions / iframe runners attempting to override window.fetch
  try {
    let _origFetch = window.fetch;
    try {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        enumerable: true,
        get() {
          return _origFetch;
        },
        set(fn) {
          _origFetch = fn;
        },
      });
    } catch {
      // ignore
    }

    if (typeof Window !== 'undefined' && Window.prototype) {
      try {
        const protoDesc = Object.getOwnPropertyDescriptor(Window.prototype, 'fetch');
        if (!protoDesc || !protoDesc.set) {
          Object.defineProperty(Window.prototype, 'fetch', {
            configurable: true,
            enumerable: true,
            get: (protoDesc && protoDesc.get) || (() => _origFetch),
            set(fn) {
              _origFetch = fn;
            },
          });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // Clean up any stale dev/preview service workers on preview and cloud run hosts
  if (
    'serviceWorker' in navigator &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname.includes('.run.app') ||
      window.location.hostname.includes('.ai.studio') ||
      window.location.hostname.startsWith('ais-'))
  ) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }
}
export {};
