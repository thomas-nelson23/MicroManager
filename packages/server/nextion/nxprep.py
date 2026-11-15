#!/usr/bin/env python3
"""Validate a job's hmi.txt and write the prepared copy that gets sent to the VM.

  nxprep.py <jobdir> <out_hmi.txt> --jobname NAME --jobroot 'C:\\...\\nxauto'

- Fills settings missing from element 0 using DISPLAY_* environment variables.
- Always sets hmifile/tftfile to the VM job folder (so the job's own paths don't matter).
- Checks commands, component types and attribute names against reference/components.json.
Exit code 1 on errors (printed as ERROR:), warnings don't block the build.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
COMMON = {"objname", "vscope", "x", "y", "w", "h", "0"}
EVENTS = {"load", "loadend", "unload", "down", "up", "slide", "timer", "touchs", "ref", "vis", "init", "playend"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobdir")
    ap.add_argument("out")
    ap.add_argument("--jobname", required=True)
    ap.add_argument("--jobroot", required=True)
    a = ap.parse_args()

    errs, warns = [], []
    path = os.path.join(a.jobdir, "hmi.txt")
    try:
        job = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"ERROR: {path}: not valid JSON: {e}")
        return 1
    if not isinstance(job, list) or not job or not isinstance(job[0], dict):
        print("ERROR: hmi.txt must be a JSON array whose first element is the settings object")
        return 1
    if not os.path.isfile(os.path.join(a.jobdir, "star.txt")):
        errs.append("star.txt (Program.s) is missing")

    comps = json.load(open(os.path.join(HERE, "components.json"), encoding="utf-8"))
    by_id = {int(v["id"]): (k, v) for k, v in comps.items() if v["id"].isdigit()}

    s = job[0]
    env = os.environ
    defaults = {"ser": env.get("DISPLAY_SERIES", ""), "model": env.get("DISPLAY_MODEL", ""), "dire": "0",
                "mesize": "0", "maxtftsize": "134217728", "medatastring": "", "ico_q": "", "ram1open": "0",
                "asp100_tc": "0"}
    for k, v in defaults.items():
        s.setdefault(k, v)
    for k in list(s):
        s[k] = str(s[k])
    if env.get("DISPLAY_MODEL") and s["model"] != env["DISPLAY_MODEL"]:
        warns.append(f"model {s['model']!r} differs from DISPLAY_MODEL {env['DISPLAY_MODEL']!r}; the upload will refuse it")
    s["hmifile"] = f"{a.jobroot}\\{a.jobname}\\out\\{a.jobname}.HMI"
    s["tftfile"] = f"{a.jobroot}\\{a.jobname}\\out\\{a.jobname}.tft"

    cur_page, cur_type, cur_name, objs = None, None, None, {}
    pages, events = {}, []
    names_on_page, maxl = set(), {}
    for i, c in enumerate(job[1:], start=2):
        where = f"element {i}"
        if not isinstance(c, dict) or "com" not in c:
            errs.append(f"{where}: command object needs a 'com' field")
            continue
        for k in list(c):
            c[k] = str(c[k])
        com = c["com"]
        if com == "addpage":
            if "pagename" not in c:
                errs.append(f"{where}: addpage needs pagename")
            cur_page, cur_type, cur_name = c.get("pagename"), "page", c.get("pagename")
            if cur_page in pages:
                errs.append(f"{where}: page name {cur_page!r} used twice")
            names_on_page, objs = {c.get("pagename")}, {0: ("page", c.get("pagename"))}
            pages[cur_page] = {cur_page: "page"}
        elif cur_page is None:
            errs.append(f"{where}: '{com}' before the first addpage (the default page is deleted; start with addpage)")
        elif com == "addobj":
            try:
                t = int(c.get("objtype", ""))
            except ValueError:
                t = -1
            if t not in by_id:
                errs.append(f"{where}: unknown objtype {c.get('objtype')!r}")
                continue
            n = c.get("objname", "")
            if not n:
                errs.append(f"{where}: addobj needs objname")
            elif n in names_on_page:
                errs.append(f"{where}: objname {n!r} already used on page {cur_page!r}")
            names_on_page.add(n)
            cur_type, cur_name = by_id[t][0], n
            objs[len(objs)] = (cur_type, n)
            pages[cur_page][n] = cur_type
        elif com == "setatt":
            an, av = c.get("attname"), c.get("attval", "")
            if an is None:
                errs.append(f"{where}: setatt needs attname")
                continue
            if an == "0":
                idx = int(av) if av.lstrip("-").isdigit() else -1
                if idx not in objs:
                    errs.append(f"{where}: select index {av} doesn't exist on page {cur_page!r} (0..{len(objs) - 1})")
                else:
                    cur_type, cur_name = objs[idx]
                continue
            known = set(comps.get(cur_type, {}).get("atts", {})) | COMMON
            if an not in known:
                warns.append(f"{where}: {cur_name} ({cur_type}) has no attribute {an!r} in the reference")
            if an == "txt_maxl":
                maxl[(cur_page, cur_name)] = int(av) if av.isdigit() else 0
            if an == "txt":
                ml = maxl.get((cur_page, cur_name), 10)
                if len(av.encode("latin-1", "replace")) > ml:
                    errs.append(f"{where}: {cur_name}.txt is {len(av)} chars but txt_maxl is {ml}; set txt_maxl first")
            if an in ("x", "y", "w", "h") and not av.lstrip("-").isdigit():
                errs.append(f"{where}: {an} must be an integer")
        elif com == "setevent":
            ev = c.get("eventname")
            allowed = set(comps.get(cur_type, {}).get("events", []))
            if ev not in EVENTS:
                errs.append(f"{where}: unknown eventname {ev!r}")
            elif allowed and ev not in allowed:
                errs.append(f"{where}: {cur_name} ({cur_type}) has no {ev!r} event (has: {', '.join(sorted(allowed))})")
            if "eventcode" not in c:
                errs.append(f"{where}: setevent needs eventcode")
            else:
                events.append((where, cur_page, cur_name, c["eventcode"]))
        else:
            errs.append(f"{where}: unknown com {com!r} (addpage, addobj, setatt, setevent)")

    if cur_page is None:
        errs.append("no addpage command; a project needs at least one page")

    # Event code: every dotted reference must resolve. "obj.att" = component on the same page,
    # "page.obj.att" = component on another page. String literals and comments are ignored.
    for where, page, owner, code in events:
        for ln, line in enumerate(code.replace("\r\n", "\n").split("\n"), start=1):
            body = re.sub(r'"(?:[^"\\]|\\.)*"', '""', line.split("//")[0])
            for m in re.finditer(r"(?<![\w.])([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?", body):
                a1, a2, a3 = m.groups()
                if a3 is not None:                     # page.obj.att
                    if a1 not in pages:
                        errs.append(f"{where} ({owner} event, line {ln}): unknown page {a1!r} in {m.group(0)!r}")
                        continue
                    pg, obj, att = a1, a2, a3
                else:
                    pg, obj, att = page, a1, a2
                if obj not in pages.get(pg, {}):
                    if a3 is None and obj in pages:    # 'page1.x' style is not a valid reference either
                        errs.append(f"{where} ({owner} event, line {ln}): {m.group(0)!r}: use page.object.attribute")
                    else:
                        errs.append(f"{where} ({owner} event, line {ln}): no component {obj!r} on page {pg!r} ({m.group(0)!r})")
                    continue
                t = pages[pg][obj]
                if att not in set(comps.get(t, {}).get("atts", {})) | COMMON | {"id", "type"}:
                    warns.append(f"{where} ({owner} event, line {ln}): {obj} ({t}) has no attribute {att!r} in the reference")

    for w in warns:
        print("WARN:", w)
    for e in errs:
        print("ERROR:", e)
    if errs:
        return 1
    json.dump(job, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"prepared {a.out}: {len(job) - 1} commands, model {s['model']} ({s['ser']}), dire {s['dire']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
