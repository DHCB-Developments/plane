# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# A work item reference is <PROJECT_IDENTIFIER>-<sequence>, optionally wrapped
# in [] or (), optionally preceded by a semantic keyword:
#   "fixes BFH-231"      -> closing   (completes the item when the PR merges)
#   "BFH-231" / "[BFH-231]" -> reference (links + state automation, no auto-close)
#   "relates to BFH-231" -> relation  (link only, no state changes)
CLOSING_KEYWORDS = ("fix", "fixes", "fixed", "close", "closes", "closed", "resolve", "resolves", "resolved", "complete", "completes", "completed", "implement", "implements", "implemented")
RELATION_KEYWORDS = ("relates to", "related to", "relate to")

REFERENCE_PATTERN = re.compile(
    r"(?:(?P<keyword>[a-zA-Z]+(?:\s+to)?)\s+)?[\[\(]?(?P<identifier>[a-zA-Z][a-zA-Z0-9]*)-(?P<sequence>\d+)[\]\)]?",
    re.IGNORECASE,
)

# Branch names carry the identifier as a path/dash segment: mido/bfh-231-fix-thing
BRANCH_PATTERN = re.compile(
    r"(?:^|[/_.-])(?P<identifier>[a-zA-Z][a-zA-Z0-9]*)-(?P<sequence>\d+)(?=$|[/_.-])",
    re.IGNORECASE,
)


def parse_text_references(text):
    """Extract work item references from PR title/description text.

    Returns a list of dicts {identifier, sequence, link_type}, deduplicated —
    the strongest tier wins when the same item is referenced more than once
    (closing > reference > relation).
    """
    if not text:
        return []
    strength = {"relation": 0, "reference": 1, "closing": 2}
    found = {}
    for match in REFERENCE_PATTERN.finditer(text):
        identifier = match.group("identifier").upper()
        sequence = int(match.group("sequence"))
        keyword = (match.group("keyword") or "").lower().strip()
        if keyword in CLOSING_KEYWORDS:
            link_type = "closing"
        elif keyword in RELATION_KEYWORDS or keyword == "to":
            # "relates to BFH-1" tokenizes keyword as "relates to"; a bare
            # trailing "to" ("assigned to BFH-1") is treated as relation too.
            link_type = "relation"
        else:
            link_type = "reference"
        key = (identifier, sequence)
        if key not in found or strength[link_type] > strength[found[key]]:
            found[key] = link_type
    return [
        {"identifier": identifier, "sequence": sequence, "link_type": link_type}
        for (identifier, sequence), link_type in found.items()
    ]


def parse_branch_references(branch_name):
    """Extract work item references from a branch name.

    Returns a list of dicts {identifier, sequence} (no tiers — branch links
    are always plain references).
    """
    if not branch_name:
        return []
    seen = set()
    references = []
    for match in BRANCH_PATTERN.finditer(branch_name):
        key = (match.group("identifier").upper(), int(match.group("sequence")))
        if key not in seen:
            seen.add(key)
            references.append({"identifier": key[0], "sequence": key[1]})
    return references
