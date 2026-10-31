if (typeof window !== 'undefined') {
  // Suppress non-actionable external browser extension errors in iframe preview
  const isExtensionError = (msg: any, src?: any, err?: any) => {
    const strMsg = typeof msg === 'string' ? msg : (msg && msg.message) || '';
    const strSrc = typeof src === 'string' ? src : '';
    const strStack = (err && err.stack) || '';
    return (
      strSrc.includes('chrome-extension://') ||
      strStack.includes('chrome-extension://') ||
      strMsg.includes('frame_ant') ||
      strStack.includes('frame_ant')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isExtensionError(event.message, event.filename, event.error)) {
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
        event.preventDefault?.();
      }
    },
    true
  );
}
export {};
