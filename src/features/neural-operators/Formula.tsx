import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
export default function Formula({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const content = (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {inline ? `$${tex}$` : `$$\n${tex}\n$$`}
    </ReactMarkdown>
  );
  return inline ? <span>{content}</span> : <div className="no-equation">{content}</div>;
}
