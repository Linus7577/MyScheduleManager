import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Turns a note's markdown into a page on the server, so the library never reaches the browser. Raw HTML in a note
 * is dropped and unsafe links are stripped, so a pasted note can't run code. Pictures are left out too: this hub
 * stores no files, and loading one would tell another site you opened the note.
 */
export function NoteBody({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          h1: ({ children }) => <h2 className="text-xl font-semibold">{children}</h2>,
          h2: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="text-base font-semibold">{children}</h4>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-crimson-400 underline underline-offset-4">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-foreground/20 pl-3 text-muted-foreground">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">{children}</code>,
          pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-foreground/20 py-1 pr-3 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b border-foreground/10 py-1 pr-3">{children}</td>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
