import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders report markdown. Images written as ![](report/abc.png) are swapped
 * for signed URLs from `assets`. Raw HTML in the markdown is not rendered.
 */
export default function Markdown({ markdown, assets = {} }: { markdown: string; assets?: Record<string, string> }) {
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:tracking-tight prose-a:text-flame-deep prose-img:rounded-2xl prose-img:border prose-img:border-line">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            const resolved = typeof src === "string" ? (assets[src] ?? src) : undefined;
            if (!resolved) return null;
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs
            return <img src={resolved} alt={alt ?? ""} loading="lazy" />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
