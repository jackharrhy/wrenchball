import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy from "tippy.js";
import type { Instance as TippyInstance } from "tippy.js";
import { forwardRef, useImperativeHandle, useState, useCallback } from "react";
import { renderMentionedText, type MentionContext } from "~/utils/mentions";

interface MentionItem {
  id: string; // Format: "player-42" or "team-5"
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

    // Derive a safe selected index - clamp it to valid range
    const safeSelectedIndex =
      items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command],
    );

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
          selectItem(safeSelectedIndex);
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-gray-400 text-sm">
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
              index === safeSelectedIndex
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
              {item.type === "team" ? "#" : "@"}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

function plainTextToTiptap(
  text: string,
  playerMap: Map<number, string>,
  teamMap: Map<number, string>,
): JSONContent {
  if (!text) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const lines = text.split("\n");
  const content = lines.map((line) => {
    const paragraphContent: JSONContent[] = [];
    const combinedRegex = /<@(\d+)>|<#(\d+)>/g;

    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        paragraphContent.push({
          type: "text",
          text: line.slice(lastIndex, match.index),
        });
      }

      if (match[1] !== undefined) {
        const playerId = parseInt(match[1], 10);
        const playerName = playerMap.get(playerId) ?? "Unknown";
        paragraphContent.push({
          type: "mention",
          attrs: {
            id: `player-${playerId}`,
            label: playerName,
          },
        });
      } else if (match[2] !== undefined) {
        const teamId = parseInt(match[2], 10);
        const teamName = teamMap.get(teamId) ?? "Unknown";
        paragraphContent.push({
          type: "mention",
          attrs: {
            id: `team-${teamId}`,
            label: teamName,
          },
        });
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      paragraphContent.push({
        type: "text",
        text: line.slice(lastIndex),
      });
    }

    return {
      type: "paragraph",
      content: paragraphContent.length > 0 ? paragraphContent : undefined,
    };
  });

  return { type: "doc", content };
}

function tiptapToPlainText(doc: JSONContent): string {
  if (!doc.content) return "";

  const lines = doc.content.map((paragraph) => {
    if (paragraph.type !== "paragraph" || !paragraph.content) return "";

    return paragraph.content
      .map((node) => {
        if (node.type === "text") {
          return node.text ?? "";
        }
        if (node.type === "hardBreak") {
          return "\n";
        }
        if (node.type === "mention" && node.attrs?.id) {
          const id = String(node.attrs.id);
          if (id.startsWith("player-")) {
            const playerId = id.replace("player-", "");
            return `<@${playerId}>`;
          }
          if (id.startsWith("team-")) {
            const teamId = id.replace("team-", "");
            return `<#${teamId}>`;
          }
        }
        return "";
      })
      .join("");
  });

  return lines.join("\n");
}

interface MentionEditorProps {
  content: string | null | undefined;
  onChange: (content: string) => void;
  placeholder?: string;
  teams: Array<{ id: number; name: string }>;
  players: Array<{ id: number; name: string }>;
}

export function MentionEditor({
  content,
  onChange,
  placeholder,
  teams,
  players,
}: MentionEditorProps) {
  const playerMap = new Map(players.map((p) => [p.id, p.name]));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

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

  const initialContent = plainTextToTiptap(content ?? "", playerMap, teamMap);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
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
        renderHTML({ node }) {
          const isTeam = node.attrs.id?.startsWith("team-");
          return [
            "span",
            {
              class: `mention ${isTeam ? "mention-team" : "mention-player"}`,
              "data-mention-id": node.attrs.id,
            },
            `${isTeam ? "#" : "@"}${node.attrs.label}`,
          ];
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const plainText = tiptapToPlainText(editor.getJSON());
      onChange(plainText);
    },
    editorProps: {
      attributes: {
        class:
          "w-full p-2 text-sm border border-cell-gray/50 bg-cell-gray/20 rounded-md text-white min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500",
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {editor.isEmpty && placeholder && (
        <div className="absolute top-2 left-2 text-gray-300/40 text-sm pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}

interface MentionDisplayProps {
  content: string | null | undefined;
  context: MentionContext;
}

export function MentionDisplay({ content, context }: MentionDisplayProps) {
  if (!content) return null;

  return (
    <div className="text-sm text-gray-200 whitespace-pre-wrap trade-block-content">
      {renderMentionedText(content, context)}
    </div>
  );
}
