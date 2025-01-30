export function loadFromStorage(key) {
  // localStorage.removeItem(key);
  const localStorageItem = localStorage.getItem(key);
  if (localStorageItem) {
    try {
      return JSON.parse(localStorageItem);
    } catch (e) {
      console.error(e);
      localStorage.removeItem(key);
    }
  }
  return null;
}

export function getId() {
  return Math.random().toString(36).substring(7);
}

export function pluralizeCount(count, singular, plural) {
  plural = plural || singular + "s";
  return `${count} ${count === 1 ? singular : plural}`;
}

export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openWindow(title, text) {
  const newWindow = window.open('', '', 'width=800,height=800');
  newWindow.document.title = title;
  newWindow.document.body.innerText = text;
  newWindow.document.body.style.whiteSpace = "pre-wrap";
  newWindow.document.body.style.fontFamily = "system-ui, Arial, sans-serif";
}