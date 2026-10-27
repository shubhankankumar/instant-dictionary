{
  let popup = null;
  let requestId = 0;

  function close() {
    popup?.remove();
    popup = null;
  }

  function place(x, y) {
    const { width, height } = popup.getBoundingClientRect();
    popup.style.left = Math.max(10, Math.min(x, innerWidth - width - 10)) + "px";
    popup.style.top = Math.max(10, Math.min(y, innerHeight - height - 10)) + "px";
  }

  async function show(text, x, y) {
    close();
    if (!DictUI.hasLetter(text)) return;
    const id = ++requestId;
    popup = document.createElement("div");
    popup.className = "id-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Dictionary");
    popup.append(DictUI.spinner());
    (document.body || document.documentElement).append(popup);
    place(x, y);
    const content = await DictUI.lookup(text);
    if (id !== requestId || !popup) return; // closed or superseded meanwhile
    popup.replaceChildren(content);
    place(x, y);
  }

  document.addEventListener("dblclick", (e) => {
    // isTrusted: pages can dispatch synthetic dblclicks to drive lookups.
    if (!e.isTrusted || e.target.isContentEditable || e.target.closest?.("input, textarea")) return;
    show(window.getSelection().toString(), e.clientX, e.clientY + 12);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "show") return;
    const sel = window.getSelection();
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    show(String(msg.text), rect ? rect.left : 200, rect ? rect.bottom + 8 : 200);
  });

  document.addEventListener("click", (e) => {
    if (popup && !popup.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.addEventListener("scroll", close, { passive: true });
  window.addEventListener("pagehide", close);
}
