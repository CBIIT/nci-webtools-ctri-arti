/**
 * Converts a JSON object to an XML string.
 *
 * Expects JSON in the format produced by xmlToJson().
 *
 * @param {Object} jsonObj - The JSON object to convert
 * @returns {string} The resulting XML string
 */
export function jsonToXml(jsonObj) {
  const doc = document.implementation.createDocument(null, "", null);

  // Get root element name and process it
  const rootName = Object.keys(jsonObj)[0];
  const rootElement = createXmlElement(rootName, jsonObj[rootName]);
  doc.appendChild(rootElement);

  // Serialize to string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);

  /**
   * Create an XML element from JSON data
   */
  function createXmlElement(name, data) {
    // Handle primitive values
    if (typeof data !== "object" || data === null) {
      const element = doc.createElement(name);
      if (data != null) {
        // null or undefined
        element.textContent = String(data);
      }
      return element;
    }

    const element = doc.createElement(name);

    // Add attributes if present
    if (data._attr) {
      for (const [attrName, attrValue] of Object.entries(data._attr)) {
        element.setAttribute(attrName, attrValue);
      }
    }

    // Simple text content case
    if (data._text != null) {
      element.textContent = data._text;
      return element;
    }

    // Handle mixed content using _content array
    if (data._content && data._content.length > 0) {
      const usedIndices = {}; // Track used indices for each element name

      for (const item of data._content) {
        if (item._type === "text") {
          // Add text node with original whitespace
          element.appendChild(doc.createTextNode(item._text));
        } else if (item._type === "element") {
          const childName = item._name;
          const childElements = data[childName];

          // Initialize index tracker if needed
          usedIndices[childName] = usedIndices[childName] || 0;

          // Get next unused index and increment
          const index = usedIndices[childName]++;

          // Create and append child element
          if (childElements && index < childElements.length) {
            element.appendChild(createXmlElement(childName, childElements[index]));
          }
        }
      }
    }
    // Regular element children (no mixed content)
    else {
      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith("_")) {
          // Skip special properties
          if (Array.isArray(value)) {
            for (const item of value) {
              element.appendChild(createXmlElement(key, item));
            }
          } else {
            element.appendChild(createXmlElement(key, value));
          }
        }
      }
    }

    return element;
  }
}
