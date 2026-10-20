if (typeof window !== 'undefined') {
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
