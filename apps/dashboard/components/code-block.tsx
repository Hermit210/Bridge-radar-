"use client";

import { useState } from "react";

/** Real copy-to-clipboard code block — no syntax highlighting dependency
 * (keeps the /developers page's own bundle as dependency-light as the
 * things it documents), just monospace text with a language label and a
 * real navigator.clipboard.writeText button, same pattern as the Report
 * Card's Share button. */
export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Real clipboard permission can be denied — an honest no-op beats
      // pretending it copied.
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border-subtle bg-surface-2">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] text-muted-dark transition-colors hover:text-text"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-text-secondary">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
