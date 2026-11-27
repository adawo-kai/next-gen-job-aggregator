/* Allow-list HTML sanitizer for scraped vacancy descriptions that works identically on the server (SSR)
   and in the browser (no DOM needed). Only formatting tags survive, all attributes are dropped except
   http(s) links; dangerous elements are removed together with their content. */

const ALLOWED = new Set(["p", "br", "ul", "ol", "li", "b", "strong", "i", "em", "u", "h3", "h4", "h5", "blockquote", "code", "pre", "a", "span", "div"]);
const RENAME: Record<string, string> = { h1: "h3", h2: "h3", h6: "h5" };
const VOID = new Set(["br"]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|select|title|head)\b[\s\S]*?<\/\1\s*>/gi;

const escAttr = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeHtml(html: string): string {
  const src = html.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(DROP_WITH_CONTENT, "");
  let out = "";
  let last = 0;
  const re = /<[^>]*>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += src.slice(last, m.index).replace(/</g, "&lt;");
    last = m.index + m[0].length;
    const t = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b([\s\S]*?)\/?\s*>$/.exec(m[0]);
    if (!t) continue;
    const closing = !!t[1];
    let tag = t[2].toLowerCase();
    tag = RENAME[tag] ?? tag;
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      if (!VOID.has(tag)) out += `</${tag}>`;
      continue;
    }
    if (tag === "a") {
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(t[3]);
      const href = (h?.[1] ?? h?.[2] ?? h?.[3] ?? "").trim();
      out += /^https?:\/\//i.test(href) ? `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">` : "<a>";
      continue;
    }
    out += VOID.has(tag) ? `<${tag}/>` : `<${tag}>`;
  }
  out += src.slice(last).replace(/</g, "&lt;");
  return out;
}

export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
