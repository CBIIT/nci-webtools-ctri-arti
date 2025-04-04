/**
 * Converts an XML string to a JSON object.
 *
 * The resulting JSON structure uses these special properties:
 * - _attr: Object containing element attributes
 * - _text: String containing text content for simple elements
 * - _content: Array tracking the order of mixed content
 * - _type: String indicating node type ("element" or "text")
 * - _name: String containing element name (in _content array)
 *
 * @param {string} xmlString - The XML string to convert
 * @returns {Object} The resulting JSON object
 * @throws {Error} If XML parsing fails
 */
export function xmlToJson(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML parsing error: " + parserError.textContent);
  }

  // Return object with root element as property
  const result = {};
  result[xmlDoc.documentElement.nodeName] = processNode(xmlDoc.documentElement);
  return result;

  /**
   * Process a DOM node into JSON representation
   */
  function processNode(node) {
    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      return node.nodeValue;
    }

    // For element nodes, create the result object
    const result = {};

    // Add attributes if any exist
    if (node.attributes.length > 0) {
      result._attr = {};
      for (const attr of node.attributes) {
        result._attr[attr.name] = attr.value;
      }
    }

    // Single text/CDATA child case - simple representation
    if (
      node.childNodes.length === 1 &&
      (node.childNodes[0].nodeType === Node.TEXT_NODE || node.childNodes[0].nodeType === Node.CDATA_SECTION_NODE)
    ) {
      const text = node.childNodes[0].nodeValue.trim();
      if (text) {
        result._text = text;
        return result;
      }
    }

    // Filter significant child nodes
    const children = [...node.childNodes].filter(
      (child) =>
        child.nodeType === Node.ELEMENT_NODE ||
        child.nodeType === Node.CDATA_SECTION_NODE ||
        (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim())
    );

    if (children.length > 0) {
      // Track content order with _content array
      result._content = [];

      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childName = child.nodeName;
          const childJson = processNode(child);

          // Add to content array
          result._content.push({
            _type: "element",
            _name: childName,
          });

          // Group by element name
          if (!result[childName]) {
            result[childName] = [childJson];
          } else {
            result[childName].push(childJson);
          }
        } else if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
          const text = child.nodeValue;
          if (text.trim()) {
            // Preserve original whitespace
            result._content.push({
              _type: "text",
              _text: text,
            });
          }
        }
      }
    }

    return result;
  }
}

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
