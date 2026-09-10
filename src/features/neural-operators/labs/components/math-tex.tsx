import katex from 'katex';
export function MathTex({
  tex,
  inline = false,
}: {
  tex: string;
  inline?: boolean;
}) {
  const html = katex.renderToString(tex, {
    displayMode: !inline,
    throwOnError: true,
    trust: false,
    output: 'htmlAndMathml',
    strict: 'error',
  });
  return inline ? (
    <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className="math-typeset" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
