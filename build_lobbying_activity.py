"""Build data/lobbying_activity.json from the Registry of Lobbyists' bulk
Monthly Communication Reports (https://lobbycanada.gc.ca/en/open-data/).

Expects these 4 files extracted into data/lobbying_raw/ (gitignored -- they're
50+ MB each):
  Communication_PrimaryExport.csv
  Communication_DpohExport.csv
  Communication_SubjectMattersExport.csv
  Codes_SubjectMatterTypesExport.csv

Run from project root: python3 build_lobbying_activity.py

What it does: for every logged communication (COMLOG_ID), joins the client
company, the Designated Public Office Holder (DPOH) contacted, and the
subject-matter codes, keeps only recent ones, and groups the result by
company so impact.py can look up "who has this company been lobbying, and
about what" the same way it used to look up mp_holdings.json.

Honesty note: the Registry doesn't appear to expose a stable public deep-link
per COMLOG_ID, so "source" here points at the general public search portal
plus the COMLOG_ID as a reference number -- not a one-click citation. If you
find the real per-record URL pattern, swap SOURCE_URL below.
"""
import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta

RAW = "data/lobbying_raw"
OUT = "data/lobbying_activity.json"

CUTOFF_DAYS = 540  # ~18 months -- adjust if you want more/less history
MAX_PER_COMPANY = 8  # cap so the JSON and the UI stay demo-sized
SOURCE_URL = "https://lobbycanada.gc.ca/app/secure/ocl/lrs/do/guest"


def find_col(fieldnames, *keywords):
    for name in fieldnames:
        upper = name.upper()
        if all(k.upper() in upper for k in keywords):
            return name
    return None


def clean(value):
    """These government exports use the literal string "null" for empty
    cells instead of leaving them blank -- strip that out."""
    value = (value or "").strip()
    return "" if value.lower() == "null" else value


def main():
    # --- subject matter code -> English description ---
    smt_desc = {}
    with open(f"{RAW}/Codes_SubjectMatterTypesExport.csv", encoding="cp1252", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            smt_desc[row["SUBJECT_CODE_OBJET"]] = row["SMT_EN_DESC"]
    print(f"Loaded {len(smt_desc)} subject matter codes")

    # --- comlog_id -> set of subject descriptions ---
    subjects_by_comlog = defaultdict(set)
    with open(f"{RAW}/Communication_SubjectMattersExport.csv", encoding="cp1252", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        print("Communication_SubjectMattersExport.csv columns:", reader.fieldnames)
        for row in reader:
            code = row["SUBJECT_CODE_OBJET"]
            subjects_by_comlog[row["COMLOG_ID"]].add(smt_desc.get(code, code))

    # --- comlog_id -> list of DPOHs contacted ---
    dpoh_by_comlog = defaultdict(list)
    with open(f"{RAW}/Communication_DpohExport.csv", encoding="cp1252", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        print("Communication_DpohExport.csv columns:", fieldnames)
        # Prefer an exact "INSTITUTION" column (the actual department, e.g.
        # "Transport Canada (TC)") over BRANCH_UNIT_* (a finer sub-unit that's
        # often blank) or OTHER_INSTITUTION_AUTRE (a freeform fallback).
        inst_col = (
            "INSTITUTION" if "INSTITUTION" in fieldnames
            else find_col(fieldnames, "INSTITUTION")
        )
        other_inst_col = find_col(fieldnames, "OTHER", "INSTITUTION")
        branch_col = find_col(fieldnames, "BRANCH")
        print("Detected DPOH institution columns:", inst_col, "/ fallback:", other_inst_col, "/ branch:", branch_col)
        for row in reader:
            first = clean(row.get("DPOH_FIRST_NM_PRENOM_TCPD"))
            last = clean(row.get("DPOH_LAST_NM_TCPD"))
            institution = clean(row.get(inst_col)) if inst_col else ""
            if not institution and other_inst_col:
                institution = clean(row.get(other_inst_col))
            if not institution and branch_col:
                institution = clean(row.get(branch_col))
            dpoh_by_comlog[row["COMLOG_ID"]].append({
                "name": f"{first} {last}".strip(),
                "title": clean(row.get("DPOH_TITLE_TITRE_TCPD")),
                "institution": institution,
            })

    # --- main pass: client org (company) -> lobbying activity ---
    cutoff = datetime.now() - timedelta(days=CUTOFF_DAYS)
    activity = defaultdict(list)
    kept, skipped_old, skipped_no_company = 0, 0, 0

    with open(f"{RAW}/Communication_PrimaryExport.csv", encoding="cp1252", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        print("Communication_PrimaryExport.csv columns:", fieldnames)
        date_col = find_col(fieldnames, "DATE")
        print("Detected date column:", date_col)

        for row in reader:
            comlog_id = row["COMLOG_ID"]
            company = clean(row.get("EN_CLIENT_ORG_CORP_NM_AN"))
            if not company:
                skipped_no_company += 1
                continue

            date_str = clean(row.get(date_col)) if date_col else ""
            if date_str:
                try:
                    date = datetime.strptime(date_str[:10], "%Y-%m-%d")
                    if date < cutoff:
                        skipped_old += 1
                        continue
                except ValueError:
                    pass  # unparsable date -- keep the row rather than drop it

            for dpoh in dpoh_by_comlog.get(comlog_id, []):
                activity[company].append({
                    "dpoh_name": dpoh["name"],
                    "dpoh_title": dpoh["title"],
                    "dpoh_institution": dpoh["institution"],
                    "subject_matters": sorted(subjects_by_comlog.get(comlog_id, [])),
                    "date": date_str,
                    "comlog_id": comlog_id,
                    "source": SOURCE_URL,
                })
            kept += 1

    # De-dupe + cap per company, most recent first
    for company, records in activity.items():
        seen = set()
        deduped = []
        for r in sorted(records, key=lambda r: r["date"], reverse=True):
            key = (r["dpoh_name"], tuple(r["subject_matters"]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)
            if len(deduped) >= MAX_PER_COMPANY:
                break
        activity[company] = deduped

    with open(OUT, "w") as f:
        json.dump(activity, f, indent=2)

    print(f"\nRows kept: {kept}, skipped (too old): {skipped_old}, skipped (no company): {skipped_no_company}")
    print(f"Wrote {len(activity)} companies with lobbying activity to {OUT}")


if __name__ == "__main__":
    main()
