interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs?: number;
}

interface Props {
  toolCalls: ToolCallLog[];
}

export function ToolCallPanel({ toolCalls }: Props) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 mt-1 w-full">
      {toolCalls.map((tc, i) => (
        <details
          key={i}
          className="border-l-2 border-violet-400 pl-2 rounded-sm text-xs bg-muted/40"
        >
          <summary className="cursor-pointer list-none flex items-center gap-2 py-1 text-muted-foreground hover:text-foreground select-none">
            <span className="font-mono font-medium">{tc.toolName}</span>
            {tc.durationMs !== undefined && (
              <span className="bg-muted rounded px-1 py-0.5 text-[10px]">
                {tc.durationMs}ms
              </span>
            )}
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-1 pb-2 pr-2">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Input
              </p>
              <pre className="bg-background border rounded p-1.5 overflow-auto text-[10px] leading-relaxed">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Output
              </p>
              <pre className="bg-background border rounded p-1.5 overflow-auto text-[10px] leading-relaxed">
                {JSON.stringify(tc.output, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
