---
target: AX Document Platform 전체 UI (dashboard/shell/mypage 중심)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-20T01-46-35Z
slug: src-components-dashboard-dashboardview-tsx
---
# 진단 결과 - 디자인 크리틱 (Assessment A + B)

Method: dual-agent (A: acd7d0fb2a15e62e7, B: a558a77ca35a5ed89)

## Design Health Score
Total: 28/40 (Good, borderline)
1 Visibility of System Status: 3
2 Match System/Real World: 2 - brand name mismatch (사이드프로젝트/NV개발 vs AX Document Platform)
3 User Control and Freedom: 3
4 Consistency and Standards: 4
5 Error Prevention: 3
6 Recognition Rather Than Recall: 4
7 Flexibility and Efficiency: 1 - no bulk actions on 93-item finding lists, no keyboard shortcuts
8 Aesthetic and Minimalist Design: 3
9 Error Recovery: 3
10 Help and Documentation: 2

## Design Specificity Verdict
Backend logic is bespoke (UTC weekday labels, tabular-nums, documented ΔE contrast calc, Pretendard font fix) but outward brand identity contradicts it: Sidebar.tsx:82-84 and login/page.tsx:37 show "사이드프로젝트/NV개발" instead of AX Document Platform/PCN. Topbar search bar and notification bell are non-functional template leftovers on every screen.
Detector (detect.mjs) found 0 issues across 24 files (exit 0, no suppression config) - deterministic scan cannot catch product-identity or fake-affordance issues; design review is what surfaced them.
Mobile overflow cross-validated: pipeline strip (charts/index.tsx:161) measured at 633px content in 390px viewport by Assessment B, confirming Assessment A's "true counts scrolled off-screen" finding. Table overflow in ProjectDocuments.tsx and embedding-lab/page.tsx confirmed intentional (overflow-x-auto, documented).

## Priority Issues
[P0] Non-functional global search bar - Topbar.tsx:24-30, div/span not input, no onClick/route, present on every page
[P1] Brand name mismatch "사이드프로젝트/NV개발" vs product spec - Sidebar.tsx:82-84, login/page.tsx:37
[P1] Mobile document detail metadata pane fully hidden (not reflowed) - DocumentDetail.tsx:268 `hidden lg:flex`, removed from a11y tree below 1024px
[P2] Mobile pipeline strip hides true non-zero counts with no scroll affordance - charts/index.tsx:161
[P2] Dead notification bell - Topbar.tsx:66-74, no onClick/badge
[P3] No batch actions on 93-item proofread finding lists

## Persona Red Flags
Alex (power user): no bulk approve across 93 findings, no keyboard shortcuts, fake search forces manual nav every time
Sam (accessibility): search is div/span not focusable input, invisible to screen readers; mobile doc-detail metadata removed from a11y tree

## Minor Observations
- Sidebar footer "v0.1" reinforces unfinished-prototype feel alongside brand mismatch
- Embedding Lab's mock buttons also give no click feedback (same dead-affordance pattern)
- Two near-identically named test projects with no disambiguation on cards
