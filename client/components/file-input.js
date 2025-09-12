import { createEffect, splitProps } from "solid-js"
import html from "solid-js/html";

export default function FileInput(props) {
  let fileInput;
  const [local, rest] = splitProps(props, ["value"]);
  createEffect(() => fileInput.files = asFileList(local.value));
  return html`<input type="file" ref=${(el) => fileInput = el} ...${rest} />`;
}

/**
 * Converts an arraylike object of File objects into a FileList object.
 */
export function asFileList(files = []) {
  const dataTransfer = new DataTransfer();
  for (const file of files.filter(Boolean)) {
    dataTransfer.items.add(file);
  }
  return dataTransfer.files;
}