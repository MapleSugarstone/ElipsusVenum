/** Imported first with no dependencies, so a crash before the first screen shows its real cause. */
function show(message: string): void {
  const boot = document.getElementById('boot');
  const box = boot ?? document.body;
  box.style.opacity = '1';
  box.textContent = `Something broke while loading: ${message}. Browser: ${navigator.userAgent}`;
}

window.addEventListener('error', (e) => {
  if (document.getElementById('boot')) show(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  if (document.getElementById('boot')) show(String((e as PromiseRejectionEvent).reason));
});

export {};
