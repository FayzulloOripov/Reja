"use client";

import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListChecks, ListOrdered, Strikethrough } from "lucide-react";
import { useEffect, useRef } from "react";
import { matchScore } from "@/lib/text";
import type { RichDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MentionPerson {
  id: string;
  name: string;
}

/** Extract plain text and mentioned user ids from a TipTap document. */
export function docToText(doc: JSONContent | null | undefined): { text: string; mentions: string[] } {
  const parts: string[] = [];
  const mentions = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "mention" && node.attrs?.id) {
      mentions.add(String(node.attrs.id));
      parts.push(`@${node.attrs.label ?? ""}`);
    }
    node.content?.forEach(walk);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") parts.push("\n");
  };
  if (doc) walk(doc);
  return { text: parts.join("").replace(/\n{3,}/g, "\n\n").trim(), mentions: [...mentions] };
}

export function textToDoc(text: string | null | undefined): RichDoc {
  if (!text?.trim()) return null;
  return {
    type: "doc",
    content: text.split(/\n+/).map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
  };
}

/** Minimal vanilla-DOM suggestion popup for @mentions (keyboard navigable). */
function mentionSuggestion(getPeople: () => MentionPerson[]) {
  return {
    char: "@",
    items: ({ query }: { query: string }) =>
      getPeople()
        .map((p) => ({ p, s: matchScore(p.name, query) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
        .map((r) => r.p),
    render: () => {
      let el: HTMLDivElement | null = null;
      let items: MentionPerson[] = [];
      let index = 0;
      let command: ((p: { id: string; label: string }) => void) | null = null;
      const draw = () => {
        if (!el) return;
        el.innerHTML = "";
        items.forEach((p, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = p.name;
          b.className = `block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${i === index ? "bg-muted" : ""}`;
          b.onmousedown = (e) => {
            e.preventDefault();
            command?.({ id: p.id, label: p.name });
          };
          el!.appendChild(b);
        });
        el.style.display = items.length ? "block" : "none";
      };
      const place = (rect: DOMRect | null | undefined) => {
        if (!el || !rect) return;
        el.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
        el.style.top = `${rect.bottom + 6}px`;
      };
      return {
        onStart: (props: { items: MentionPerson[]; command: typeof command; clientRect?: (() => DOMRect | null) | null }) => {
          el = document.createElement("div");
          el.className = "fixed z-[100] w-52 rounded-lg border bg-popover p-1 shadow-elev-3";
          el.setAttribute("role", "listbox");
          document.body.appendChild(el);
          items = props.items;
          command = props.command;
          index = 0;
          draw();
          place(props.clientRect?.());
        },
        onUpdate: (props: { items: MentionPerson[]; command: typeof command; clientRect?: (() => DOMRect | null) | null }) => {
          items = props.items;
          command = props.command;
          index = Math.min(index, Math.max(0, items.length - 1));
          draw();
          place(props.clientRect?.());
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (!items.length) return false;
          if (event.key === "ArrowDown") {
            index = (index + 1) % items.length;
            draw();
            return true;
          }
          if (event.key === "ArrowUp") {
            index = (index - 1 + items.length) % items.length;
            draw();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            const p = items[index];
            if (p) command?.({ id: p.id, label: p.name });
            return true;
          }
          return false;
        },
        onExit: () => {
          el?.remove();
          el = null;
        },
      };
    },
  };
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  editable = true,
  mentions,
  onSubmit,
  autoFocus,
  toolbar,
  className,
  ariaLabel,
  editorRef,
}: {
  value: RichDoc;
  onChange?: (doc: RichDoc, text: string, mentionIds: string[]) => void;
  placeholder?: string;
  editable?: boolean;
  mentions?: MentionPerson[];
  onSubmit?: () => void;
  autoFocus?: boolean;
  toolbar?: boolean;
  className?: string;
  ariaLabel?: string;
  editorRef?: React.RefObject<Editor | null>;
}) {
  const peopleRef = useRef<MentionPerson[]>(mentions ?? []);
  const submitRef = useRef(onSubmit);
  const changeRef = useRef(onChange);
  useEffect(() => {
    peopleRef.current = mentions ?? [];
    submitRef.current = onSubmit;
    changeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: !editable, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      ...(mentions
        ? [
            Mention.configure({
              HTMLAttributes: { class: "mention" },
              // the getter runs later, when the user types "@" — not during render
              // eslint-disable-next-line react-hooks/refs
              suggestion: mentionSuggestion(() => peopleRef.current) as never,
            }),
          ]
        : []),
    ],
    content: (value as JSONContent) ?? "",
    editorProps: {
      attributes: {
        class: cn("prose-reja min-h-[1.5rem] outline-none", className ?? ""),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && submitRef.current) {
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      const { text, mentions: ids } = docToText(json);
      changeRef.current?.(ed.isEmpty ? null : (json as RichDoc), text, ids);
    },
  });

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  // reflect external changes (realtime) when not focused
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value ?? { type: "doc", content: [{ type: "paragraph" }] });
    if (current !== next) editor.commands.setContent((value as JSONContent) ?? "", { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return <div className="min-h-[1.5rem]" />;

  return (
    <div className="group/editor">
      {toolbar && editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn("rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}
    >
      {icon}
    </button>
  );
  return (
    <div className="mb-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within/editor:opacity-100 group-hover/editor:opacity-100">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="size-3.5" />, "Bold")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="size-3.5" />, "Italic")}
      {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="size-3.5" />, "Strike")}
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="size-3.5" />, "List")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="size-3.5" />, "Ordered list")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <ListChecks className="size-3.5" />, "Heading")}
      {btn(editor.isActive("link"), () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev ?? "https://");
        if (url === null) return;
        if (!url) editor.chain().focus().unsetLink().run();
        else if (/^https?:\/\//i.test(url)) editor.chain().focus().setLink({ href: url }).run();
      }, <Link2 className="size-3.5" />, "Link")}
    </div>
  );
}

/** Read-only renderer (comments, shared pages). */
export function RichView({ value, className }: { value: RichDoc; className?: string }) {
  return <RichEditor value={value} editable={false} className={className} />;
}
