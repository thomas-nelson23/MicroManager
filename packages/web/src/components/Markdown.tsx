/** Markdown as Claude writes it in chat: paragraphs, headings, lists, tables, fenced code, quotes, links, bold, italic, `code`. */
import { Fragment, type ReactNode } from "react";

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\)|(?<![\w*])\*[^*\s][^*\n]*\*(?![\w*])|(?<![\w_])_[^_\s][^_\n]*_(?![\w_]))/g;

export function Inline({ text }: { text: string }): ReactNode {
  return text.split(INLINE).map((part, k) => {
    if (!part) return null;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={k} className="code">{part.slice(1, -1)}</code>;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <b key={k}><Inline text={part.slice(2, -2)} /></b>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return <a key={k} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={k}><Inline text={part.slice(1, -1)} /></em>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

interface Item {
  text: string;
  children: { ordered: boolean; items: Item[] } | null;
}

function parseList(lines: string[], start: number, indent: number): { ordered: boolean; items: Item[]; next: number } {
  const items: Item[] = [];
  const ordered = /\d/.test(LIST.exec(lines[start]!)![2]!);
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]!);
    if (!m) {
      // a wrapped line continues the item above
      if (lines[i]!.trim() && items.length && /^\s+/.test(lines[i]!)) {
        items.at(-1)!.text += " " + lines[i]!.trim();
        i++;
        continue;
      }
      break;
    }
    const ind = m[1]!.length;
    if (ind < indent) break;
    if (ind > indent + 1 && items.length) {
      const sub = parseList(lines, i, ind);
      items.at(-1)!.children = { ordered: sub.ordered, items: sub.items };
      i = sub.next;
      continue;
    }
    items.push({ text: m[3]!, children: null });
    i++;
  }
  return { ordered, items, next: i };
}

function List({ ordered, items }: { ordered: boolean; items: Item[] }) {
  const body = items.map((it, k) => (
    <li key={k}>
      <Inline text={it.text} />
      {it.children && <List {...it.children} />}
    </li>
  ));
  return ordered ? <ol className="md-list">{body}</ol> : <ul className="md-list">{body}</ul>;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").trim().split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = out.length;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!);
      i++;
      out.push(
        <pre key={key} className="md-pre" data-lang={fence[2] || undefined}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = (["h3", "h3", "h4", "h5"] as const)[h[1]!.length - 1]!;
      out.push(<Tag key={key} className={`md-h md-h${h[1]!.length}`}><Inline text={h[2]!} /></Tag>);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key} className="md-hr" />);
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isRule(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) rows.push(cells(lines[i++]!));
      out.push(
        <div key={key} className="md-table">
          <table className="table dense">
            <thead><tr>{head.map((c, k) => <th key={k}><Inline text={c} /></th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{head.map((_, j) => <td key={j}><Inline text={r[j] ?? ""} /></td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key} className="md-quote"><Markdown text={body.join("\n")} /></blockquote>);
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      const l = parseList(lines, i, li[1]!.length);
      out.push(<List key={key} ordered={l.ordered} items={l.items} />);
      i = l.next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|~~~|#{1,4}\s|>)/.test(lines[i]!) && !LIST.test(lines[i]!) && !(lines[i]!.includes("|") && i + 1 < lines.length && isRule(lines[i + 1]!))) {
      para.push(lines[i++]!);
    }
    out.push(
      <p key={key} className="md-p">
        {para.map((l, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            <Inline text={l} />
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{out}</>;
}
