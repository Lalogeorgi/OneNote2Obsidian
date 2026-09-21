import DOMPurify from "dompurify";

/**
 * Empties all children from an element without setting innerHTML.
 */
export function emptyElement(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Sets raw SVG markup into an element using DOMParser and importNode,
 * avoiding unsafe assignments to innerHTML.
 */
export function setSvgContent(el: HTMLElement, svgString: string): void {
  emptyElement(el);
  if (!svgString) return;
  try {
    const parser = new DOMParser();
    // Use HTML parser first: natively parses SVG tags without strict xmlns declaration
    const parsedHtml = parser.parseFromString(svgString, "text/html");
    const svgEl = parsedHtml.body.querySelector("svg");
    if (svgEl) {
      const doc = el.ownerDocument || document;
      const imported = doc.importNode(svgEl, true);
      el.appendChild(imported);
      return;
    }

    // Fallback: XML parser with xmlns injection if needed
    const normalizedSvg = svgString.includes("xmlns")
      ? svgString
      : svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const parsedXml = parser.parseFromString(normalizedSvg, "image/svg+xml");
    const xmlEl = parsedXml.documentElement;
    if (xmlEl && xmlEl.tagName.toLowerCase() === "svg") {
      const doc = el.ownerDocument || document;
      const imported = doc.importNode(xmlEl, true);
      el.appendChild(imported);
    }
  } catch {
    // Fallback if parsing fails
    el.textContent = "";
  }
}

/**
 * Sanitizes and sets rich HTML into an element using DOMPurify and DOMParser,
 * avoiding unsafe assignments to innerHTML.
 */
export function setSanitizedHtml(el: HTMLElement, htmlString: string): void {
  emptyElement(el);
  if (!htmlString) return;
  try {
    const cleanHtml = DOMPurify.sanitize(htmlString);
    const parser = new DOMParser();
    const parsed = parser.parseFromString(cleanHtml, "text/html");
    const doc = el.ownerDocument || document;
    while (parsed.body.firstChild) {
      const child = doc.importNode(parsed.body.firstChild, true);
      el.appendChild(child);
    }
  } catch {
    el.textContent = htmlString;
  }
}
