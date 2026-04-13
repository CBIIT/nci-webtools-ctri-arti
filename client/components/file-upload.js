import { createSignal, For, Show } from "solid-js";
import html from "solid-js/html";

function getExtension(fileName) {
  return fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
}

function validateExtension(file, allowedExtensions) {
  if (!allowedExtensions?.length || allowedExtensions.includes(getExtension(file.name))) {
    return;
  }

  return `Invalid file type. Please upload ${allowedExtensions.join(" or ")} file type.`;
}

function validateSize(file, maxBytes) {
  if (!maxBytes) {
    return;
  }
  if (file.size <= maxBytes) {
    return;
  }

  const sizeMB = Math.round(maxBytes / (1024 * 1024));
  return `File '${file.name}' exceeds the ${sizeMB} MB size limit. Please upload a smaller file.`;
}

function validateFile(file, { accept, maxSize }) {
  return validateExtension(file, accept) || validateSize(file, maxSize);
}

/**
 * Validates and partitions files into accepted and rejected groups based on provided constraints.
 * @param {*} files - Array of File objects to validate
 * @param {*} constraints - Validation constraints (e.g. { accept: [".pdf"], maxSize: 25 * 1024 * 1024 })
 * @returns { accepted: File[], errors: string[] } - Object containing arrays of accepted files and error messages for rejected files
 */
function partitionFiles(files, constraints) {
  const accepted = [];
  const errors = [];
  for (const file of files) {
    const error = validateFile(file, constraints);
    if (error) {
      errors.push(error);
    } else {
      accepted.push(file);
    }
  }

  return { accepted, errors };
}

/**
 * @param {Object} props
 * @param {boolean} [props.multiple] - Allow multiple file selection
 * @param {string[]} [props.accept] - Allowed file extensions (e.g. [".pdf", ".docx"])
 * @param {number} [props.maxSize] - Max file size in bytes
 * @param {string} [props.placeholder] - Placeholder text when no file is chosen
 * @param {string} [props.hint] - Hint text below the upload row (e.g. "PDF or DOCX (max 25 MB)")
 * @param {string} [props.buttonText] - Custom button label (defaults to "Choose File")
 * @param {() => any} [props.buttonIcon] - Custom icon template for the button
 * @param {File|null} [props.file] - Current file for single-file mode (reactive)
 * @param {(file: File|null) => void} [props.onFileChange] - Callback for single-file mode
 * @param {File[]} [props.files] - Current files for multi-file mode (reactive)
 * @param {(files: File[]) => void} [props.onFilesChange] - Callback for multi-file mode
 * @param {() => void} [props.onRemove] - Callback when a file is removed (single mode)
 * @returns {JSX.Element}
 */
export function FileUpload(props) {
  const [validationError, setValidationError] = createSignal("");
  let hiddenInput;

  const resolve = (value) => (typeof value === "function" ? value() : value);

  const acceptAttribute = () => (props.accept || []).join(",");

  const selectedFiles = () => {
    if (props.multiple) {
      return resolve(props.files) || [];
    }

    const file = resolve(props.file);
    return file ? [file] : [];
  };

  const hasFiles = () => selectedFiles().length > 0;

  const showUploadRow = () => props.multiple || !hasFiles();

  function handleSingleFile(file) {
    const error = validateFile(file, props);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError("");
    props.onFileChange?.(file);
  }

  function handleMultipleFiles(incoming) {
    const { accepted, errors } = partitionFiles(incoming, props);
    setValidationError(errors?.length ? errors.join("\n") : "");

    if (!accepted?.length) {
      return;
    }

    const current = resolve(props.files) || [];
    props.onFilesChange?.([...current, ...accepted]);
  }

  function handleInputChange(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (!chosen.length) {
      return;
    }

    if (props.multiple) {
      handleMultipleFiles(chosen);
      return;
    }

    handleSingleFile(chosen[0]);
  }

  function removeFileAt(index) {
    if (!props.multiple) {
      setValidationError("");
      props.onRemove ? props.onRemove() : props.onFileChange?.(null);
      return;
    }

    const updated = (resolve(props.files) || []).filter((_, i) => i !== index);
    props.onFilesChange?.(updated);
  }

  return html`
    <div class="d-flex flex-column gap-2">
      <${Show} when=${hasFiles}>
        <div class="d-flex flex-column gap-2">
          <${For} each=${selectedFiles}>
            ${(file, index) => html`
              <div class="pa-file-chip">
                <span class="pa-file-chip-name">${file.name}</span>
                <button
                  type="button"
                  class="pa-file-chip-remove"
                  aria-label="Remove file"
                  onClick=${() => removeFileAt(index())}
                >
                  ✕
                </button>
              </div>
            `}
          <//>
        </div>
      <//>

      <${Show} when=${showUploadRow}>
        <div class="pa-upload-row">
          <button type="button" class="pa-upload-btn" onClick=${() => hiddenInput?.click()}>
            ${() => props.buttonText || "Choose File"}
            ${() =>
              props.buttonIcon ||
              html`<img
                src="assets/images/protocol-advisor/icon-attachment.svg"
                alt="Attach file"
                width="16"
                height="17"
              />`}
          </button>
          <input
            type="file"
            class="d-none"
            id=${props.id}
            accept=${acceptAttribute}
            multiple=${props.multiple || false}
            ref=${(el) => (hiddenInput = el)}
            onChange=${handleInputChange}
          />
          <div class="pa-upload-status">${() => props.placeholder || "No file chosen"}</div>
        </div>
      <//>

      <${Show} when=${props.hint}>
        <span class="pa-file-type-info mt-1">${props.hint}</span>
      <//>
      <${Show} when=${validationError}>
        <span class="pa-field-error">${validationError}</span>
      <//>
    </div>
  `;
}
