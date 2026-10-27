const input = document.getElementById("wordInput");
const result = document.getElementById("result");
let requestId = 0;

document.getElementById("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value;
  if (!DictUI.hasLetter(text)) return;
  const id = ++requestId;
  result.replaceChildren(DictUI.spinner());
  const content = await DictUI.lookup(text);
  if (id === requestId) result.replaceChildren(content); // ignore stale answers
});
