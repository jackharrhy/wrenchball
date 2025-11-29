import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy from "tippy.js";
import type { Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";

interface MentionItem {
  id: string;
  label: string;
  type: "team" | "player";
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command],
    );

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev === 0 ? items.length - 1 : prev - 1,
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev === items.length - 1 ? 0 : prev + 1,
          );
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-md p-2 text-gray-400 text-sm">
          No results
        </div>
      );
    }

    return (
      <div className="bg-gray-800 border border-gray-600 rounded-md overflow-hidden shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`block w-full text-left px-3 py-2 text-sm ${
              index === selectedIndex
                ? "bg-blue-600 text-white"
                : "text-gray-200 hover:bg-gray-700"
            }`}
          >
            <span
              className={`inline-block w-4 h-4 rounded mr-2 text-xs text-center leading-4 ${
                item.type === "team"
                  ? "bg-green-600 text-white"
                  : "bg-orange-600 text-white"
              }`}
            >
              {item.type === "team" ? "T" : "P"}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

interface TradeBlockEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  teams: Array<{ id: number; name: string }>;
  players: Array<{ id: number; name: string }>;
  label: string;
  labelColor: string;
}

export function TradeBlockEditor({
  content,
  onChange,
  placeholder,
  teams,
  players,
  label,
  labelColor,
}: TradeBlockEditorProps) {
  const mentionItems: MentionItem[] = [
    ...teams.map((t) => ({
      id: `team-${t.id}`,
      label: t.name,
      type: "team" as const,
    })),
    ...players.map((p) => ({
      id: `player-${p.id}`,
      label: p.name,
      type: "player" as const,
    })),
  ];

  const suggestion: Omit<SuggestionOptions<MentionItem>, "editor"> = {
    items: ({ query }) => {
      return mentionItems
        .filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10);
    },

    render: () => {
      let component: ReactRenderer<MentionListRef, MentionListProps>;
      let popup: TippyInstance[];

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        orderedList: false,
        bulletList: false,
        listItem: false,
        code: false,
        bold: false,
        italic: false,
        strike: false,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion,
        renderHTML({ options, node }) {
          return [
            "span",
            {
              class: `mention ${node.attrs.id?.startsWith("team-") ? "mention-team" : "mention-player"}`,
              "data-mention-id": node.attrs.id,
            },
            `@${node.attrs.label}`,
          ];
        },
      }),
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class:
          "w-full p-2 text-sm border border-cell-gray/50 bg-cell-gray/20 rounded-md text-white min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500",
      },
    },
  });

  // Initialize editor content from JSON if it's valid JSON, otherwise treat as plain text
  useEffect(() => {
    if (editor && content) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === "doc") {
          editor.commands.setContent(parsed);
        }
      } catch (e) {
        // If not valid JSON, treat as plain text - this is expected for legacy content
        console.debug("Trade block content is plain text, not JSON:", e);
        editor.commands.setContent(content);
      }
    }
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={`text-sm font-semibold ${labelColor}`}>{label}:</label>
      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <div className="absolute top-2 left-2 text-gray-500 text-sm pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Type @ to mention teams or players
      </p>
    </div>
  );
}

interface TradeBlockDisplayProps {
  content: string | null;
  label: string;
  labelColor: string;
}

export function TradeBlockDisplay({
  content,
  label,
  labelColor,
}: TradeBlockDisplayProps) {
  if (!content) return null;

  // Try to parse as JSON (Tiptap content), fallback to plain text
  let displayContent: React.ReactNode;
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "doc") {
      displayContent = renderTiptapContent(parsed);
    } else {
      displayContent = content;
    }
  } catch (e) {
    // If not valid JSON, display as plain text - this is expected for legacy content
    console.debug("Trade block content is plain text, not JSON:", e);
    displayContent = content;
  }

  return (
    <div className="flex-1">
      <p className={`text-sm font-semibold ${labelColor} mb-1`}>{label}:</p>
      <div className="text-sm text-gray-200 whitespace-pre-wrap trade-block-content">
        {displayContent}
      </div>
    </div>
  );
}

interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  attrs?: {
    id?: string;
    label?: string;
  };
}

function renderTiptapContent(doc: TiptapNode): React.ReactNode {
  if (!doc.content) return null;

  return doc.content.map((node, index) => {
    if (node.type === "paragraph") {
      return (
        <p key={index} className="mb-1 last:mb-0">
          {node.content?.map((child, childIndex) => {
            if (child.type === "text") {
              return <span key={childIndex}>{child.text}</span>;
            }
            if (child.type === "mention") {
              const isTeam = child.attrs?.id?.startsWith("team-");
              return (
                <a
                  key={childIndex}
                  href={
                    isTeam
                      ? `/team/${child.attrs?.id?.replace("team-", "")}`
                      : `/player/${child.attrs?.id?.replace("player-", "")}`
                  }
                  className={`inline-block px-1 rounded ${
                    isTeam
                      ? "bg-green-600/30 text-green-300 hover:bg-green-600/50"
                      : "bg-orange-600/30 text-orange-300 hover:bg-orange-600/50"
                  }`}
                >
                  @{child.attrs?.label}
                </a>
              );
            }
            return null;
          }) ?? null}
        </p>
      );
    }
    return null;
  });
}
