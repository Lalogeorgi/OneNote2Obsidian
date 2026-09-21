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
export function setSvgContent(el: HTMLElement, svgOrText: string): void {
  emptyElement(el);
  if (!svgOrText) return;
  const trimmed = svgOrText.trim();
  if (!trimmed.startsWith("<svg") && !trimmed.startsWith("<SVG")) {
    el.textContent = trimmed;
    return;
  }
  try {
    const parser = new DOMParser();
    const normalizedSvg = trimmed.includes("xmlns")
      ? trimmed
      : trimmed.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const parsedXml = parser.parseFromString(normalizedSvg, "image/svg+xml");
    const xmlEl = parsedXml.documentElement;
    if (xmlEl && xmlEl.tagName.toLowerCase() === "svg" && !xmlEl.querySelector("parsererror")) {
      const doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
      const imported = doc ? doc.importNode(xmlEl, true) : xmlEl;
      el.appendChild(imported);
      return;
    }

    const parsedHtml = parser.parseFromString(trimmed, "text/html");
    const svgEl = parsedHtml.body.querySelector("svg");
    if (svgEl) {
      const doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
      const imported = doc ? doc.importNode(svgEl, true) : svgEl;
      el.appendChild(imported);
      return;
    }
  } catch {
    // Fallback if parsing fails
  }
  el.textContent = "";
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
