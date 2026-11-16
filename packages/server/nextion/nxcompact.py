#!/usr/bin/env python3
"""Rewrite an hmi.txt in the compact format: one line per page or component.

  nxcompact.py <hmi.txt> [<out>]      (default: rewrite in place, keeping <hmi.txt>.bak)

Commands that select an earlier object (setatt "0") are merged into that object's line. The result
expands (nxprep.py) to the same attributes and events as the original.
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ALIASES = {121: "page", 116: "text", 98: "button", 53: "dsbutton", 54: "number", 59: "float", 106: "progress",
           1: "slider", 122: "gauge", 0: "waveform", 112: "picture", 113: "crop", 109: "hotspot", 56: "checkbox",
           57: "radio", 67: "switch", 58: "qrcode", 62: "scrolltext", 51: "timer", 52: "variable"}


def value(v):
    s = str(v)
    return int(s) if s.lstrip("-").isdigit() and s == str(int(s)) else s


def compact(job):
    out = [job[0]]
    page_objs, sel = [], None
    for c in job[1:]:
        if "com" not in c:          # already compact
            out.append(c)
            page_objs, sel = [], None
            continue
        com = c["com"]
        if com == "addpage":
            sel = {"page": c["pagename"]}
            page_objs = [sel]
            out.append(sel)
        elif com == "addobj":
            t = int(c["objtype"])
            sel = {"obj": ALIASES.get(t, t), "name": c["objname"]}
            page_objs.append(sel)
            out.append(sel)
        elif com == "setatt" and str(c["attname"]) == "0":
            idx = int(c["attval"])
            if 0 <= idx < len(page_objs):
                sel = page_objs[idx]
            else:
                out.append(c)
        elif com == "setatt" and sel is not None:
            sel.pop(c["attname"], None)
            sel[c["attname"]] = value(c["attval"])
        elif com == "setevent" and sel is not None:
            code = str(c["eventcode"]).replace("\r\n", "\n").split("\n")
            sel.setdefault("on", {})[c["eventname"]] = code if len(code) > 1 else code[0]
        else:
            out.append(c)
    for e in out[1:]:
        if "on" in e:               # keep events last on the line
            e["on"] = e.pop("on")
    return out


def dumps(job):
    return "[\n" + ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in job) + "\n]\n"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    job = json.load(open(src, encoding="utf-8"))
    text = dumps(compact(job))
    if dst == src:
        shutil.copyfile(src, src + ".bak")
    open(dst, "w", encoding="utf-8").write(text)
    print(f"{dst}: {os.path.getsize(src + '.bak') if dst == src else os.path.getsize(src)} -> {len(text.encode())} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
