export async function* parseNdjsonStream(stream, { onParseError } = {}) {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        yield JSON.parse(line);
      } catch (error) {
        onParseError?.(error, line);
      }
    }
  }

  if (!buffer.trim()) return;

  try {
    yield JSON.parse(buffer);
  } catch (error) {
    onParseError?.(error, buffer);
  }
}
