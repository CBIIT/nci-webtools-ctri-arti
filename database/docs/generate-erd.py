"""Generate UML ERD diagram from uml2.txt using Pillow.
Uses orthogonal routing and explicit edge assignments to minimize line crossings."""
import math
from PIL import Image, ImageDraw, ImageFont

# ── Configuration ──────────────────────────────────────────────
CANVAS_W, CANVAS_H = 3200, 2500
BG = "#ffffff"
HEADER_GREEN = "#90ee90"
FK_PINK = "#ffcccc"
ROW_WHITE = "#f8fff8"
BORDER = "#888888"
NOTE_BG = "#ffffcc"
NOTE_BORDER = "#cccc88"
LINE_COLOR = "#555555"

FONT_SIZE = 16
HEADER_FONT_SIZE = 18
NOTE_FONT_SIZE = 14
COL_W = 220
TYPE_W = 100
BOX_W = COL_W + TYPE_W
ROW_H = 24
HEADER_H = 30

try:
    font = ImageFont.truetype("arial.ttf", FONT_SIZE)
    font_bold = ImageFont.truetype("arialbd.ttf", HEADER_FONT_SIZE)
    font_note = ImageFont.truetype("arial.ttf", NOTE_FONT_SIZE)
except:
    font = ImageFont.load_default()
    font_bold = font
    font_note = font

# ── Entity Definitions ─────────────────────────────────────────
entities = {
    "Resource": [
        ("id", "int", False), ("toolID", "int", True), ("conversationID", "int", False),
        ("messageID", "int", False), ("name", "string", False), ("description", "string", False),
        ("metadata", "jsonb", False), ("s3Uri", "string", False), ("createdAt", "datetime", False),
        ("updatedAt", "datetime", False), ("MIMEType", "string", False), ("content", "string", False),
    ],
    "Vector": [
        ("id", "int", False), ("toolID", "int", True), ("resourceID", "int", False),
        ("order", "int", False), ("embedding", "jsonb", False), ("content", "string", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False), ("conversationID", "int", False),
    ],
    "Message": [
        ("id", "int", False), ("conversationID", "int", False), ("serialNumber", "int", False),
        ("role", "string", False), ("content", "jsonb", False), ("tokens", "int", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Conversation": [
        ("id", "int", False), ("agentID", "int", False), ("userID", "int", False),
        ("deleted", "boolean", False), ("deletedAt", "datetime", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
        ("title", "string", False), ("latestSummarySN", "int", False),
    ],
    "User": [
        ("id", "int", False), ("firstName", "string", False), ("lastName", "string", False),
        ("email", "string", False), ("roleId", "int", False), ("createdAt", "datetime", False),
        ("updatedAt", "datetime", False), ("status", "string", False), ("apiKey", "string", False),
        ("budget", "float", False), ("remaining", "float", False),
    ],
    "Roles": [
        ("id", "int", False), ("name", "string", False), ("displayOrder", "int", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "RolePolicy": [
        ("roleID", "int", False), ("policyID", "int", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Policy": [
        ("id", "int", False), ("name", "string", False), ("resource", "string", False),
        ("action", "string", False), ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Agent": [
        ("id", "int", False), ("name", "string", False), ("description", "string", False),
        ("promptId", "int", False), ("modelID", "int", False), ("modelParameters", "jsonb", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False), ("creatorID", "int", False),
    ],
    "Prompt": [
        ("id", "int", False), ("agentID", "int", False), ("version", "int", False),
        ("content", "string", False), ("createdAt", "datetime", False),
        ("updatedAt", "datetime", False), ("name", "string", False),
    ],
    "Model": [
        ("id", "int", False), ("name", "string", False), ("type", "string", False),
        ("description", "string", False), ("providerId", "int", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
        ("internalName", "string", False), ("summarizeThreshold", "int", False),
        ("defaultParameters", "jsonb", False), ("maxContext", "int", False),
        ("maxOutput", "int", False), ("maxReasoning", "int", False),
        ("cost1kInput", "float", False), ("cost1KOutput", "float", False),
        ("cost1kCacheReason", "float", False), ("cost1kCacheWrite", "float", False),
    ],
    "Providers": [
        ("id", "int", False), ("name", "string", False), ("apiKey", "string", False),
        ("endpoint", "string", False), ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Tool": [
        ("id", "int", False), ("name", "string", False), ("description", "string", False),
        ("type", "string", False), ("authenticationType", "string", False),
        ("endpoint", "string", False), ("transportType", "string", False),
        ("customConfig", "jsonb", False), ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "UserAgent": [
        ("userID", "int", False), ("agentID", "int", False), ("role", "string", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "UserTool": [
        ("userID", "int", False), ("toolID", "int", False), ("credential", "jsonb", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "AgentTool": [
        ("toolID", "int", False), ("agentID", "int", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Usages": [
        ("id", "int", False), ("type", "string", True), ("userID", "int", False),
        ("agentID", "int", False), ("messageID", "int", False), ("modelId", "int", False),
        ("inputTokens", "float", False), ("outputtokens", "float", False),
        ("cacheReadToken", "float", False), ("cacheWriteToken", "float", False),
        ("cost", "float", False), ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
    "Sessions": [
        ("sid", "string", False), ("expires", "datetime", False), ("data", "string", False),
        ("createdAt", "datetime", False), ("updatedAt", "datetime", False),
    ],
}

# ── Layout matching original diagram ───────────────────────────
# 5 columns, entities placed to minimize crossing
positions = {
    # Col 1 (left): Message, Roles chain
    "Message":      (80,  500),
    "Roles":        (80,  1050),
    "RolePolicy":   (80,  1260),
    "Policy":       (80,  1480),

    # Col 2: Resource, Conversation, User
    "Resource":     (470, 30),
    "Conversation": (470, 460),
    "User":         (470, 840),

    # Col 3: Vector, Agent, join tables, Usages
    "Vector":       (860, 30),
    "Agent":        (860, 370),
    "UserAgent":    (860, 760),
    "UserTool":     (860, 940),
    "Usages":       (860, 1180),

    # Col 4: Prompt, Model, AgentTool
    "Prompt":       (1610, 60),
    "Model":        (1610, 340),
    "AgentTool":    (1610, 790),

    # Col 5 (right): Providers, Tool, Sessions
    "Providers":    (2000, 60),
    "Tool":         (2000, 640),
    "Sessions":     (2000, 1020),
}

# ── Notes ──────────────────────────────────────────────────────
notes = [
    (80,  700, 310, ["role: ['system', 'user', 'assistant', 'tool']"]),
    (470, 1130, 310, ["status: ['Active', 'Inactive', 'Disabled']"]),
    (80,  1190, 300, ["name: ['Admin', 'Super User', 'User']"]),
    (1610, 790, 310, ["type: ['chat', 'embedding', 'reranking']"]),
    (2000, 920, 240, ["type: ['MCP', 'custom']"]),
    (860, 1520, 310, ["type: ['user', 'agent', 'guardrail']"]),
    (860, 910, 280, ["role: ['admin', 'user']"]),
    (1250, 640, 250, [
        "Model Parameters",
        "  temperature", "  maxToken", "  topP", "  topK", "  ...",
    ]),
    (2000, 1200, 290, [
        "Configuration",
        "  McpType", "  embeddingModelID", "  rerankingModelID",
        "  chunkSize", "  overlap", "  retrieveTopN", "  rerankTopN", "  ...",
        "", "McpType: ['knowledgebase',", "  'API', 'database']",
    ]),
]


# ── Drawing helpers ────────────────────────────────────────────
def entity_h(name):
    return HEADER_H + len(entities[name]) * ROW_H + 2

def box(name):
    """Return (x1, y1, x2, y2) of entity."""
    x, y = positions[name]
    return (x, y, x + BOX_W, y + entity_h(name))

def edge(name, side, frac=0.5):
    """Get a point on an entity edge.
    side: 'L','R','T','B'
    frac: 0.0=start of edge, 1.0=end (top-to-bottom for L/R, left-to-right for T/B)
    """
    x1, y1, x2, y2 = box(name)
    if side == 'L':
        return (x1, y1 + (y2 - y1) * frac)
    elif side == 'R':
        return (x2, y1 + (y2 - y1) * frac)
    elif side == 'T':
        return (x1 + (x2 - x1) * frac, y1)
    elif side == 'B':
        return (x1 + (x2 - x1) * frac, y2)

def draw_entity(draw_ctx, name):
    x, y = positions[name]
    cols = entities[name]
    h = entity_h(name)

    # Shadow
    draw_ctx.rectangle([x+3, y+3, x+BOX_W+3, y+h+3], fill="#dddddd")
    # Header
    draw_ctx.rectangle([x, y, x+BOX_W, y+HEADER_H], fill=HEADER_GREEN, outline=BORDER)
    draw_ctx.text((x+8, y+5), name, fill="black", font=font_bold)
    # Columns
    for i, (col_name, col_type, is_fk) in enumerate(cols):
        ry = y + HEADER_H + i * ROW_H
        bg = FK_PINK if is_fk else ROW_WHITE
        draw_ctx.rectangle([x, ry, x+BOX_W, ry+ROW_H], fill=bg, outline=BORDER)
        draw_ctx.line([(x+COL_W, ry), (x+COL_W, ry+ROW_H)], fill=BORDER)
        draw_ctx.text((x+6, ry+3), col_name, fill="black", font=font)
        draw_ctx.text((x+COL_W+6, ry+3), col_type, fill="black", font=font)
    # Outer border
    draw_ctx.rectangle([x, y, x+BOX_W, y+h], outline=BORDER)

def draw_note(draw_ctx, x, y, w, lines):
    h = len(lines) * 20 + 12
    draw_ctx.rectangle([x, y, x+w, y+h], fill=NOTE_BG, outline=NOTE_BORDER)
    for i, line in enumerate(lines):
        f = font_bold if i == 0 and not line.startswith(" ") and ":" not in line and "[" not in line else font_note
        draw_ctx.text((x+8, y+6+i*20), line, fill="#333333", font=f)

def draw_one_mark(draw_ctx, x, y, direction):
    """Draw '1' mark. direction: 'H' or 'V'."""
    sz = 8
    if direction == 'H':
        draw_ctx.line([(x, y-sz), (x, y+sz)], fill=LINE_COLOR, width=2)
    else:
        draw_ctx.line([(x-sz, y), (x+sz, y)], fill=LINE_COLOR, width=2)

def draw_crow_foot(draw_ctx, x, y, toward):
    """Draw crow's foot. toward: 'L','R','U','D' = direction the foot points."""
    sz = 10
    sp = 7
    if toward == 'L':
        draw_ctx.line([(x, y), (x+sz, y-sp)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x+sz, y)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x+sz, y+sp)], fill=LINE_COLOR, width=2)
    elif toward == 'R':
        draw_ctx.line([(x, y), (x-sz, y-sp)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x-sz, y)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x-sz, y+sp)], fill=LINE_COLOR, width=2)
    elif toward == 'U':
        draw_ctx.line([(x, y), (x-sp, y+sz)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x, y+sz)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x+sp, y+sz)], fill=LINE_COLOR, width=2)
    elif toward == 'D':
        draw_ctx.line([(x, y), (x-sp, y-sz)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x, y-sz)], fill=LINE_COLOR, width=2)
        draw_ctx.line([(x, y), (x+sp, y-sz)], fill=LINE_COLOR, width=2)

def draw_ortho_line(draw_ctx, points):
    """Draw an orthogonal polyline through a list of (x,y) points."""
    for i in range(len(points) - 1):
        draw_ctx.line([points[i], points[i+1]], fill=LINE_COLOR, width=1)


# ── Explicit relationship routes ───────────────────────────────
# Each: (src, src_side, src_frac, tgt, tgt_side, tgt_frac, waypoints[], one_dir, crow_dir)
# one_dir/crow_dir: direction the symbol faces ('L','R','U','D')
# waypoints: list of (x,y) for intermediate bends (orthogonal routing)

def routes():
    """Define all relationship routes explicitly to avoid crossings."""
    R = []

    # -- Conversation <-> Message (horizontal, same row) --
    R.append(("Conversation", 'L', 0.3, "Message", 'R', 0.3, [], 'H', 'R'))

    # -- Conversation <-> Agent (horizontal) --
    R.append(("Agent", 'L', 0.15, "Conversation", 'R', 0.15, [], 'H', 'L'))

    # -- Conversation <-> User (vertical) --
    R.append(("Conversation", 'B', 0.3, "User", 'T', 0.3, [], 'V', 'D'))

    # -- Agent <-> Conversation (agentID) -- already covered above

    # -- Conversation <-> Resource (vertical up) --
    R.append(("Conversation", 'T', 0.3, "Resource", 'B', 0.3, [], 'V', 'U'))

    # -- Conversation <-> Vector (line up-right) --
    cv_s = edge("Conversation", 'T', 0.7)
    cv_e = edge("Vector", 'B', 0.3)
    R.append(("Conversation", 'T', 0.7, "Vector", 'B', 0.3, [(cv_s[0], cv_e[1])], 'V', 'U'))

    # -- Resource <-> Vector (horizontal) --
    R.append(("Resource", 'R', 0.15, "Vector", 'L', 0.15, [], 'H', 'L'))

    # -- Resource <-> Tool (long horizontal right) --
    rs = edge("Resource", 'R', 0.05)
    re = edge("Tool", 'L', 0.05)
    mid_y = min(rs[1], re[1]) - 15
    R.append(("Resource", 'R', 0.05, "Tool", 'L', 0.05, [(rs[0]+10, rs[1]), (rs[0]+10, mid_y), (re[0]-10, mid_y), (re[0]-10, re[1])], 'H', 'L'))

    # -- Vector <-> Tool (horizontal right) --
    vs = edge("Vector", 'R', 0.05)
    ve = edge("Tool", 'L', 0.15)
    mid_y2 = min(vs[1], ve[1]) - 30
    R.append(("Vector", 'R', 0.05, "Tool", 'L', 0.15, [(vs[0]+10, vs[1]), (vs[0]+10, mid_y2), (ve[0]-10, mid_y2), (ve[0]-10, ve[1])], 'H', 'L'))

    # -- Resource <-> Vector (resourceID) -- already covered by R<->V horizontal

    # -- Message <-> Resource (vertical up-right) --
    ms = edge("Message", 'T', 0.7)
    mre = edge("Resource", 'B', 0.7)
    R.append(("Message", 'T', 0.7, "Resource", 'B', 0.7, [(ms[0], mre[1]+15), (mre[0], mre[1]+15)], 'V', 'U'))

    # -- Agent <-> Prompt (horizontal right) --
    R.append(("Agent", 'R', 0.2, "Prompt", 'L', 0.5, [], 'H', 'L'))

    # -- Agent <-> Model (line right via Prompt area) --
    as1 = edge("Agent", 'R', 0.35)
    ae1 = edge("Model", 'L', 0.15)
    R.append(("Agent", 'R', 0.35, "Model", 'L', 0.15, [(as1[0]+60, as1[1]), (as1[0]+60, ae1[1])], 'H', 'L'))

    # -- User <-> Agent (creatorID - line up) --
    R.append(("User", 'T', 0.7, "Agent", 'B', 0.7, [], 'V', 'U'))

    # -- Providers <-> Model (vertical down or horizontal) --
    R.append(("Providers", 'B', 0.3, "Model", 'T', 0.7, [(edge("Providers",'B',0.3)[0], edge("Model",'T',0.7)[1]-15), (edge("Model",'T',0.7)[0], edge("Model",'T',0.7)[1]-15)], 'V', 'D'))

    # -- User <-> Roles (horizontal left) --
    R.append(("User", 'L', 0.35, "Roles", 'R', 0.3, [], 'H', 'R'))

    # -- Roles <-> RolePolicy (vertical down) --
    R.append(("Roles", 'B', 0.5, "RolePolicy", 'T', 0.5, [], 'V', 'D'))

    # -- Policy <-> RolePolicy (vertical up) --
    R.append(("Policy", 'T', 0.5, "RolePolicy", 'B', 0.5, [], 'V', 'U'))

    # -- User <-> UserAgent (horizontal right) --
    R.append(("User", 'R', 0.15, "UserAgent", 'L', 0.3, [], 'H', 'L'))

    # -- Agent <-> UserAgent (vertical down) --
    R.append(("Agent", 'B', 0.3, "UserAgent", 'T', 0.3, [], 'V', 'D'))

    # -- User <-> UserTool (horizontal right) --
    us = edge("User", 'R', 0.5)
    ue = edge("UserTool", 'L', 0.3)
    R.append(("User", 'R', 0.5, "UserTool", 'L', 0.3, [(us[0]+20, us[1]), (us[0]+20, ue[1])], 'H', 'L'))

    # -- Tool <-> UserTool (horizontal left) --
    R.append(("Tool", 'L', 0.7, "UserTool", 'R', 0.3, [], 'H', 'R'))

    # -- Tool <-> AgentTool (horizontal left) --
    R.append(("Tool", 'L', 0.4, "AgentTool", 'R', 0.3, [], 'H', 'R'))

    # -- Agent <-> AgentTool (horizontal right) --
    ags = edge("Agent", 'R', 0.8)
    age = edge("AgentTool", 'L', 0.3)
    R.append(("Agent", 'R', 0.8, "AgentTool", 'L', 0.3, [(ags[0]+30, ags[1]), (ags[0]+30, age[1])], 'H', 'L'))

    # -- User <-> Usages (line down-right) --
    uus = edge("User", 'B', 0.7)
    uue = edge("Usages", 'L', 0.15)
    R.append(("User", 'B', 0.7, "Usages", 'L', 0.15, [(uus[0], uue[1])], 'V', 'L'))

    # -- Agent <-> Usages (vertical down) --
    R.append(("Agent", 'B', 0.5, "Usages", 'T', 0.3, [(edge("Agent",'B',0.5)[0], edge("Usages",'T',0.3)[1]-15), (edge("Usages",'T',0.3)[0], edge("Usages",'T',0.3)[1]-15)], 'V', 'U'))

    # -- Message <-> Usages (line down-right) --
    mus = edge("Message", 'B', 0.5)
    mue = edge("Usages", 'L', 0.35)
    R.append(("Message", 'B', 0.5, "Usages", 'L', 0.35, [(mus[0], mue[1])], 'V', 'L'))

    # -- Model <-> Usages (line down-left) --
    mds = edge("Model", 'B', 0.3)
    mde = edge("Usages", 'R', 0.3)
    R.append(("Model", 'B', 0.3, "Usages", 'R', 0.3, [(mds[0], mde[1])], 'V', 'R'))

    # -- User <-> Conversation (userID) -- already covered above

    return R

def draw_relationship(draw_ctx, src, src_side, src_frac, tgt, tgt_side, tgt_frac, waypoints, one_dir, crow_dir):
    sp = edge(src, src_side, src_frac)
    tp = edge(tgt, tgt_side, tgt_frac)
    points = [sp] + waypoints + [tp]
    draw_ortho_line(draw_ctx, points)

    # One mark near source (12px in from edge)
    if one_dir == 'H':
        if src_side == 'R':
            draw_one_mark(draw_ctx, sp[0]+12, sp[1], 'H')
        elif src_side == 'L':
            draw_one_mark(draw_ctx, sp[0]-12, sp[1], 'H')
        elif src_side == 'T':
            draw_one_mark(draw_ctx, sp[0], sp[1]-12, 'V')
        elif src_side == 'B':
            draw_one_mark(draw_ctx, sp[0], sp[1]+12, 'V')
    else:  # 'V'
        if src_side == 'B':
            draw_one_mark(draw_ctx, sp[0], sp[1]+12, 'V')
        elif src_side == 'T':
            draw_one_mark(draw_ctx, sp[0], sp[1]-12, 'V')
        elif src_side == 'R':
            draw_one_mark(draw_ctx, sp[0]+12, sp[1], 'H')
        elif src_side == 'L':
            draw_one_mark(draw_ctx, sp[0]-12, sp[1], 'H')

    # Crow's foot near target
    draw_crow_foot(draw_ctx, tp[0], tp[1], crow_dir)


# ── Main ───────────────────────────────────────────────────────
img = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
d = ImageDraw.Draw(img)

# Draw relationships first (behind entities)
for r in routes():
    draw_relationship(d, *r)

# Draw entities on top
for name in entities:
    draw_entity(d, name)

# Draw notes
for args in notes:
    draw_note(d, *args)

img.save("E:/Projects/nci-webtools-ctri-research-optimizer/database/uml2.png")
print(f"Saved uml2.png ({CANVAS_W}x{CANVAS_H})")
