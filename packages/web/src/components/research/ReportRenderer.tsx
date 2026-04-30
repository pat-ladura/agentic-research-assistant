import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReportReference {
  id: string;
  url: string;
}

interface KeyFinding {
  finding: string;
  citations?: string[];
}

interface SubQuestion {
  question: string;
  answer: string;
  citations?: string[];
}

interface StructuredReport {
  introduction?: string;
  executive_summary?: string;
  key_findings?: KeyFinding[];
  sub_questions?: SubQuestion[];
  gaps?: string[];
  conclusion?: string;
  references?: ReportReference[];
}

function tryParseReport(content: string): StructuredReport | null {
  try {
    // Strip markdown code fences if the AI wrapped JSON in ```json ... ```
    const stripped = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object' && 'executive_summary' in parsed) {
      return parsed as StructuredReport;
    }
  } catch {
    // not JSON — fall through to markdown renderer
  }
  return null;
}

interface ReportRendererProps {
  content: string;
}

export function ReportRenderer({ content }: ReportRendererProps) {
  const structured = tryParseReport(content);

  if (structured) {
    return <StructuredReportView report={structured} />;
  }

  // Fallback: legacy markdown reports
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function StructuredReportView({ report }: { report: StructuredReport }) {
  const refMap: Record<string, string> = {};
  report.references?.forEach((r) => {
    refMap[r.id] = r.url;
  });

  return (
    <div className="space-y-6 text-sm">
      {report.introduction && (
        <section>
          <h2 className="text-base font-semibold mb-2">Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">{report.introduction}</p>
        </section>
      )}

      {report.executive_summary && (
        <section>
          <h2 className="text-base font-semibold mb-2">Executive Summary</h2>
          <p className="text-muted-foreground leading-relaxed">{report.executive_summary}</p>
        </section>
      )}

      {report.key_findings && report.key_findings.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2">Key Findings</h2>
          <ul className="space-y-3">
            {report.key_findings.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <span>{f.finding}</span>
                  {f.citations && f.citations.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {f.citations.map((c, ci) => (
                        <CitationLink key={ci} id={c} refMap={refMap} />
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.sub_questions && report.sub_questions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2">Research Questions</h2>
          <div className="space-y-4">
            {report.sub_questions.map((sq, i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="font-medium mb-1">{sq.question}</p>
                <p className="text-muted-foreground">{sq.answer}</p>
                {sq.citations && sq.citations.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sources:{' '}
                    {sq.citations.map((c, ci) => (
                      <CitationLink key={ci} id={c} refMap={refMap} />
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {report.gaps && report.gaps.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2">Research Gaps</h2>
          <ul className="space-y-1">
            {report.gaps.map((gap, i) => (
              <li key={i} className="flex gap-2 text-muted-foreground">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-yellow-500" />
                {gap}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.conclusion && (
        <section>
          <h2 className="text-base font-semibold mb-2">Conclusion</h2>
          <p className="text-muted-foreground leading-relaxed">{report.conclusion}</p>
        </section>
      )}

      {report.references && report.references.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2">References</h2>
          <ol className="space-y-1">
            {report.references.map((ref, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium">{ref.id}: </span>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground break-all"
                >
                  {ref.url}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function CitationLink({ id, refMap }: { id: string; refMap: Record<string, string> }) {
  const url = refMap[id];
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-foreground mx-0.5"
    >
      [{id}]
    </a>
  ) : (
    <span className="mx-0.5">[{id}]</span>
  );
}
