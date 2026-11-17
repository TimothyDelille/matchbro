import path from "node:path";
import type { ReactNode } from "react";
import { Circle, Document, Font, Image, Link, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Nodes, Root, RootContent, PhrasingContent, List, Table } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { RUBRICS, profileScore, type Scores } from "@/lib/score";

/**
 * The report as a PDF document (@react-pdf/renderer): score breakdown + the
 * written review. The user's submitted photos/recordings and the voice note
 * are never included. Rendered by lib/pdf/report-pdf.ts.
 */

// Same palette as app/globals.css (PDFs can't read CSS variables).
const C = {
  paper: "#ffffff",
  ink: "#17121c",
  muted: "#6d6574",
  flame: "#ff5a1f",
  flameDeep: "#e2400a",
  butter: "#ffd84a",
  line: "#ece8ef",
  good: "#22a55b",
  bad: "#e5383b",
};
const band = (s: number) => (s > 80 ? C.good : s >= 50 ? C.butter : C.bad);
/** The band color mixed 22% into white, like the ring track on the site. */
const tint = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * 0.22 + 255 * 0.78);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const FONT = "Bricolage";
const fontFile = (w: number) =>
  path.join(process.cwd(), "lib/pdf/fonts", `bricolage-grotesque-latin-${w}-normal.woff`);
let registered = false;
function registerFonts() {
  if (registered) return;
  registered = true;
  // Bricolage Grotesque has no italic: italics fall back to the upright face.
  Font.register({
    family: FONT,
    fonts: [400, 700, 800].flatMap((w) => [
      { src: fontFile(w), fontWeight: w },
      { src: fontFile(w), fontWeight: w, fontStyle: "italic" as const },
    ]),
  });
  Font.registerEmojiSource({ format: "png", url: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/" });
  // Don't hyphenate words across lines.
  Font.registerHyphenationCallback((word) => [word]);
}

// Body text sets fontSize next to lineHeight: react-pdf resolves a lineHeight
// multiplier against the style's own fontSize (default 18), not the inherited one.
const FS = 10.5;
const LH = 1.55;

const s = StyleSheet.create({
  page: {
    fontFamily: FONT,
    fontSize: FS,
    color: C.ink,
    backgroundColor: C.paper,
    // Room for the header/footer repeated on every page.
    paddingTop: 92,
    paddingBottom: 64,
    paddingHorizontal: 52,
  },
  header: {
    position: "absolute",
    top: 40,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brand: { fontSize: 14, fontWeight: 800, letterSpacing: -0.3 },
  meta: { fontSize: 9.5, color: C.muted },
  title: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15 },
  scoreCard: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  rubrics: { flex: 1, gap: 9 },
  rubricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rubricLabel: { fontSize: 10.5, fontWeight: 700 },
  rubricValue: { fontSize: 12, fontWeight: 800 },
  barTrack: { marginTop: 3, height: 5, borderRadius: 3, backgroundColor: C.line },
  barFill: { height: 5, borderRadius: 3 },
  body: { marginTop: 22 },
  contact: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line },
  h1: { marginTop: 16, marginBottom: 6, fontSize: 18, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.2 },
  h2: { marginTop: 16, marginBottom: 5, fontSize: 15, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.25 },
  h3: { marginTop: 12, marginBottom: 4, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 },
  // Set per text style, not on the page: there it stops react-pdf drawing the page numbers.
  p: { marginBottom: 8, fontSize: FS, lineHeight: LH },
  tight: { marginBottom: 2, fontSize: FS, lineHeight: LH },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 16, color: C.muted, fontSize: FS, lineHeight: LH },
  listBody: { flex: 1 },
  quote: { marginBottom: 8, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: C.flame, color: C.muted },
  code: { fontFamily: "Courier", fontSize: 9.5, backgroundColor: C.line },
  pre: { lineHeight: 1.4, marginBottom: 8, padding: 10, borderRadius: 6, backgroundColor: C.line, fontFamily: "Courier", fontSize: 9 },
  hr: { marginVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  link: { color: C.flameDeep, textDecoration: "underline" },
  image: { marginVertical: 8, maxHeight: 360, objectFit: "contain", borderRadius: 8 },
  table: { marginBottom: 8, borderWidth: 1, borderColor: C.line, borderRadius: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  td: { flex: 1, padding: 5, fontSize: FS, lineHeight: 1.4 },
  footerLeft: { position: "absolute", bottom: 30, left: 52, fontSize: 8.5, color: C.muted },
  footerRight: { position: "absolute", bottom: 30, right: 52, width: 80, textAlign: "right", fontSize: 8.5, color: C.muted },
});

/** SVG arc clockwise from 12 o'clock covering `pct`% of the circle. */
function arc(c: number, r: number, pct: number) {
  if (pct >= 100) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
  const a = (pct / 100) * 2 * Math.PI;
  const x = c + r * Math.sin(a);
  const y = c - r * Math.cos(a);
  return `M ${c} ${c - r} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${x} ${y}`;
}

function ScoreRing({ score, size = 84 }: { score: number; size?: number }) {
  const stroke = Math.round(size * 0.09);
  const r = (size - stroke) / 2;
  const color = band(score);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint(color)} strokeWidth={stroke} />
        {score > 0 && (
          <Path d={arc(size / 2, r, score)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        )}
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.34, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{score}</Text>
        <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>out of 100</Text>
      </View>
    </View>
  );
}

function ScoreSection({ scores }: { scores: Scores }) {
  const total = profileScore(scores);
  if (total === null) return null;
  // Rubrics that weren't part of this submission (N/A) aren't shown.
  const scored = RUBRICS.flatMap(({ key, label }) => (scores[key] === null ? [] : [{ key, label, value: scores[key]! }]));
  return (
    <View style={s.scoreCard} wrap={false}>
      <ScoreRing score={total} />
      <View style={s.rubrics}>
        <Text style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 0.6 }}>PROFILE SCORE</Text>
        {scored.map(({ key, label, value }) => (
          <View key={key}>
            <View style={s.rubricRow}>
              <Text style={s.rubricLabel}>{label}</Text>
              <Text style={s.rubricValue}>{value}</Text>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${value}%`, backgroundColor: band(value) }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Markdown (mdast) → PDF ----

/** react-pdf decodes PNG and JPEG only. */
const printable = (url: string) => /\.(png|jpe?g)(\?|$)/i.test(url);

type Ctx = { assets: Record<string, string> };

function inline(nodes: PhrasingContent[], ctx: Ctx): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return n.value;
      case "strong":
        return (
          <Text key={i} style={{ fontWeight: 700 }}>
            {inline(n.children, ctx)}
          </Text>
        );
      case "emphasis":
        return (
          <Text key={i} style={{ fontStyle: "italic" }}>
            {inline(n.children, ctx)}
          </Text>
        );
      case "delete":
        return (
          <Text key={i} style={{ textDecoration: "line-through" }}>
            {inline(n.children, ctx)}
          </Text>
        );
      case "inlineCode":
        return (
          <Text key={i} style={s.code}>
            {n.value}
          </Text>
        );
      case "link":
        return (
          <Link key={i} src={n.url} style={s.link}>
            {inline(n.children, ctx)}
          </Link>
        );
      case "break":
        return "\n";
      default:
        // Images are handled at block level; anything else is dropped.
        return null;
    }
  });
}

/** A paragraph's images become their own blocks; the remaining text stays a paragraph. */
function paragraph(children: PhrasingContent[], key: string, ctx: Ctx, style = s.p): ReactNode[] {
  const out: ReactNode[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => {
    const hasText = run.some((n) => n.type !== "text" || n.value.trim());
    if (hasText)
      out.push(
        <Text key={`${key}-${out.length}`} style={style}>
          {inline(run, ctx)}
        </Text>,
      );
    run = [];
  };
  for (const n of children) {
    if (n.type === "image") {
      flush();
      const src = ctx.assets[n.url] ?? n.url;
      // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an <img>
      if (/^https?:/.test(src) && printable(src)) out.push(<Image key={`${key}-${out.length}`} src={src} style={s.image} />);
    } else run.push(n);
  }
  flush();
  return out;
}

function list(node: List, key: string, ctx: Ctx): ReactNode {
  const start = node.start ?? 1;
  return (
    <View key={key} style={{ marginBottom: 8 }}>
      {node.children.map((item, i) => (
        <View key={i} style={s.listItem} wrap={false}>
          <Text style={s.bullet}>
            {item.checked === true ? "☑" : item.checked === false ? "☐" : node.ordered ? `${start + i}.` : "•"}
          </Text>
          <View style={s.listBody}>
            {item.children.flatMap((c, j) =>
              c.type === "paragraph" ? paragraph(c.children, `${key}-${i}-${j}`, ctx, s.tight) : block(c, `${key}-${i}-${j}`, ctx),
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function table(node: Table, key: string, ctx: Ctx): ReactNode {
  return (
    <View key={key} style={s.table}>
      {node.children.map((row, i) => (
        <View key={i} style={[s.tr, i === node.children.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          {row.children.map((cell, j) => (
            <Text key={j} style={[s.td, i === 0 ? { fontWeight: 700 } : {}]}>
              {inline(cell.children, ctx)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function block(node: RootContent | Nodes, key: string, ctx: Ctx): ReactNode[] {
  switch (node.type) {
    case "heading": {
      const style = node.depth === 1 ? s.h1 : node.depth === 2 ? s.h2 : s.h3;
      // minPresenceAhead keeps a heading from being stranded at the bottom of a page.
      return [
        <Text key={key} style={style} minPresenceAhead={60}>
          {inline(node.children, ctx)}
        </Text>,
      ];
    }
    case "paragraph":
      return paragraph(node.children, key, ctx);
    case "list":
      return [list(node, key, ctx)];
    case "blockquote":
      return [
        <View key={key} style={s.quote}>
          {node.children.flatMap((c, i) =>
            c.type === "paragraph" ? paragraph(c.children, `${key}-${i}`, ctx, s.tight) : block(c, `${key}-${i}`, ctx),
          )}
        </View>,
      ];
    case "code":
      return [
        <Text key={key} style={s.pre}>
          {node.value}
        </Text>,
      ];
    case "thematicBreak":
      return [<View key={key} style={s.hr} />];
    case "table":
      return [table(node, key, ctx)];
    default:
      return [];
  }
}

function markdownToPdf(markdown: string, ctx: Ctx): ReactNode[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  return tree.children.flatMap((n, i) => block(n, `b${i}`, ctx));
}

export type ReportPdfData = {
  markdown: string;
  scores: Scores;
  /** Signed URLs for images the reviewer put in the report ("report/..." paths). */
  assets: Record<string, string>;
  date: Date;
  draft: boolean;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles",
});

export function ReportDocument({ markdown, scores, assets, date, draft }: ReportPdfData) {
  registerFonts();
  const body = markdown.trim() ? markdownToPdf(markdown, { assets }) : [];
  return (
    <Document title="Your dating profile review" author="matchbro.app" creator="matchbro.app" producer="matchbro.app">
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.brand}>matchbro.app</Text>
          <Text style={s.meta}>{draft ? `Draft · ${dateFmt.format(date)}` : `Reviewed on ${dateFmt.format(date)}`}</Text>
        </View>

        <Text style={s.title}>Your dating profile review</Text>
        <ScoreSection scores={scores} />
        <View style={s.body}>{body}</View>

        <View style={s.contact} wrap={false}>
          <Text style={[s.p, { color: C.muted, marginBottom: 0 }]}>
            If you have any questions, feel free to reach out to:{" "}
            <Link src="mailto:support@matchbro.app" style={s.link}>
              support@matchbro.app
            </Link>
          </Text>
        </View>

        <Text style={s.footerLeft} fixed>
          matchbro.app
        </Text>
        <Text style={s.footerRight} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}
