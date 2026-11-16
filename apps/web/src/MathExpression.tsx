import { renderToString } from 'katex';

export function MathExpression({ latex }: { latex: string }) {
  if (latex.length > 800) return <p>Math expression exceeds the display limit.</p>;
  let markup: string;
  try {
    // Only KaTeX-generated MathML is inserted. Untrusted HTML/URLs are never accepted.
    markup = renderToString(latex, {
      output: 'mathml',
      displayMode: true,
      trust: false,
      strict: 'error',
      throwOnError: true,
      maxExpand: 100,
      maxSize: 8,
    });
  } catch {
    return <p className="muted">This math expression could not be displayed safely.</p>;
  }
  return <span className="math-expression" dangerouslySetInnerHTML={{ __html: markup }} />;
}
