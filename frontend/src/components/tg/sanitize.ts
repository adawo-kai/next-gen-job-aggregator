/* Allow-list HTML sanitizer for scraped vacancy descriptions (client-side, DOMParser based).
   Unknown elements are unwrapped (text kept), attributes are dropped except safe http(s) links. */

const ALLOWED = new Set(["P", "BR", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U", "H1", "H2", "H3", "H4", "H5", "BLOCKQUOTE", "CODE", "PRE", "A", "SPAN", "DIV"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "SVG", "MATH", "LINK", "META", "NOSCRIPT", "TEMPLATE", "IMG", "VIDEO", "AUDIO"]);

function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (DROP.has(tag)) return null;
  const kids = Array.from(el.childNodes)
    .map((c) => clean(c, doc))
    .filter((c): c is Node => !!c);
  if (!ALLOWED.has(tag)) {
    const frag = doc.createDocumentFragment();
    kids.forEach((k) => frag.appendChild(k));
    return frag;
  }
  const out = doc.createElement(tag === "H1" || tag === "H2" ? "h3" : tag.toLowerCase());
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      out.setAttribute("href", href);
      out.setAttribute("target", "_blank");
      out.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
  kids.forEach((k) => out.appendChild(k));
  return out;
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  const src = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  Array.from(src.body.childNodes).forEach((n) => {
    const c = clean(n, doc);
    if (c) root.appendChild(c);
  });
  return root.innerHTML;
}

export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
