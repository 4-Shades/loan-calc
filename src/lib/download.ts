/** Saves a Blob as a file from the browser, with no server round trip. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
