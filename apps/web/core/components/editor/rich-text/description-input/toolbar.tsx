/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ALargeSmall, Ban, MessageSquareText, MinusSquare, MoreHorizontal, Smile } from "lucide-react";
// plane imports
import type { EditorRefApi, ToolbarMenuItem } from "@plane/editor";
import { COLORS_LIST, TOOLBAR_ITEMS, TYPOGRAPHY_ITEMS } from "@plane/editor";
import { CheckIcon, ChevronDownIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  editorRef: React.RefObject<EditorRefApi>;
};

// extra insert actions not part of the shared document toolbar set
const INSERT_ITEMS: ToolbarMenuItem<"callout" | "divider" | "emoji">[] = [
  { itemKey: "callout", renderKey: "callout", name: "Callout", icon: MessageSquareText, editors: ["document"] },
  { itemKey: "divider", renderKey: "divider", name: "Divider", icon: MinusSquare, editors: ["document"] },
  { itemKey: "emoji", renderKey: "emoji", name: "Emoji", icon: Smile, editors: ["document"] },
];

// flat, ordered list of all button actions; what doesn't fit goes into the "..." menu
// (image is swapped into quote's slot so it stays visible before the bar collapses)
const ALL_BUTTON_ITEMS: ToolbarMenuItem[] = (() => {
  const items = [...Object.values(TOOLBAR_ITEMS.document).flat(), ...INSERT_ITEMS];
  const quoteIndex = items.findIndex((item) => item.itemKey === "quote");
  const imageIndex = items.findIndex((item) => item.itemKey === "image");
  if (quoteIndex !== -1 && imageIndex !== -1)
    [items[quoteIndex], items[imageIndex]] = [items[imageIndex], items[quoteIndex]];
  return items;
})();

// px budget used to compute how many buttons fit in the available row width
const BUTTON_WIDTH = 36; // size-8 button + gap
const RESERVED_WIDTH = 200; // typography (w-24 + gap) + color trigger + "..." trigger + container padding

type ToolbarButtonProps = {
  item: ToolbarMenuItem;
  isActive: boolean;
  isMobile: boolean;
  executeCommand: (item: ToolbarMenuItem) => void;
};

const ToolbarButton = React.memo(function ToolbarButton(props: ToolbarButtonProps) {
  const { item, isActive, isMobile, executeCommand } = props;

  return (
    <Tooltip
      isMobile={isMobile}
      tooltipContent={
        <p className="flex flex-col gap-1 text-center text-11">
          <span className="font-medium">{item.name}</span>
          {item.shortcut && <kbd className="text-placeholder">{item.shortcut.join(" + ")}</kbd>}
        </p>
      }
    >
      <button
        type="button"
        onClick={() => executeCommand(item)}
        className={cn("grid size-8 shrink-0 place-items-center rounded-sm text-tertiary", {
          "bg-layer-transparent-selected text-primary hover:bg-layer-transparent-selected": isActive,
          "hover:bg-layer-transparent-hover": !isActive,
        })}
      >
        <item.icon
          className={cn("size-4 transition-transform duration-200", {
            "text-primary": isActive,
          })}
        />
      </button>
    </Tooltip>
  );
});

ToolbarButton.displayName = "ToolbarButton";

type ColorMenuProps = {
  handleColorSelect: (key: "text-color" | "background-color", color: string | undefined) => void;
  isColorActive: (key: "text-color" | "background-color", color: string | undefined) => boolean;
};

// Popper-positioned (opens upward, stays in the viewport) color picker — the
// pages ColorDropdown uses a plain fixed-position panel that renders off-screen
// when the toolbar sits near the bottom of the viewport.
function ColorMenu(props: ColorMenuProps) {
  const { handleColorSelect, isColorActive } = props;

  const activeTextColor = COLORS_LIST.find((c) => isColorActive("text-color", c.key));
  const activeBackgroundColor = COLORS_LIST.find((c) => isColorActive("background-color", c.key));

  return (
    <CustomMenu
      customButton={
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover"
          )}
        >
          <span
            className={cn("grid size-6 shrink-0 place-items-center rounded-sm border-[0.5px] border-strong", {
              "bg-surface-1": !activeBackgroundColor,
            })}
            style={{
              backgroundColor: activeBackgroundColor ? activeBackgroundColor.backgroundColor : "transparent",
            }}
          >
            <ALargeSmall
              className={cn("size-3.5", {
                "text-primary": !activeTextColor,
              })}
              style={{
                color: activeTextColor ? activeTextColor.textColor : "inherit",
              }}
            />
          </span>
        </span>
      }
      className="shrink-0"
      placement="top-start"
      closeOnSelect={false}
    >
      <div className="space-y-2 p-1">
        <div className="space-y-1.5">
          <p className="text-11 font-semibold text-tertiary">Text colors</p>
          <div className="flex items-center gap-2">
            {COLORS_LIST.map((color) => (
              <button
                key={color.key}
                type="button"
                className="size-6 flex-shrink-0 rounded-sm border-[0.5px] border-strong-1 transition-opacity hover:opacity-60"
                style={{
                  backgroundColor: color.textColor,
                }}
                onClick={() => handleColorSelect("text-color", color.key)}
                aria-label={`Text color ${color.label}`}
              />
            ))}
            <button
              type="button"
              className="grid size-6 flex-shrink-0 place-items-center rounded-sm border-[0.5px] border-strong-1 text-tertiary transition-colors hover:bg-layer-1"
              onClick={() => handleColorSelect("text-color", undefined)}
              aria-label="Remove text color"
            >
              <Ban className="size-4" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-11 font-semibold text-tertiary">Background colors</p>
          <div className="flex items-center gap-2">
            {COLORS_LIST.map((color) => (
              <button
                key={color.key}
                type="button"
                className="size-6 flex-shrink-0 rounded-sm border-[0.5px] border-strong-1 transition-opacity hover:opacity-60"
                style={{
                  backgroundColor: color.backgroundColor,
                }}
                onClick={() => handleColorSelect("background-color", color.key)}
                aria-label={`Background color ${color.label}`}
              />
            ))}
            <button
              type="button"
              className="grid size-6 flex-shrink-0 place-items-center rounded-sm border-[0.5px] border-strong-1 text-tertiary transition-colors hover:bg-layer-1"
              onClick={() => handleColorSelect("background-color", undefined)}
              aria-label="Remove background color"
            >
              <Ban className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </CustomMenu>
  );
}

/**
 * Persistent formatting toolbar rendered below the description editor so all
 * editor actions (marks, lists, table, image, callout, ...) are discoverable
 * without selecting text or knowing the "/" command.
 *
 * The bar never scrolls or overflows: buttons that don't fit the available
 * width collapse into a trailing "..." menu (recomputed on resize).
 *
 * NOTE: the editor ref handle is recreated once the underlying editor instance
 * initializes, so this component always reads `editorRef.current` at call time
 * instead of caching the handle (a cached early handle has no commands bound).
 */
export function DescriptionInputToolbar(props: Props) {
  const { editorRef } = props;
  // the editor instance is created after the first render; poll until the ref
  // handle is backed by a live editor (cursor position is defined only then)
  const [isEditorReady, setIsEditorReady] = useState(false);
  // states
  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});
  const [isTypographyMenuOpen, setIsTypographyMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ALL_BUTTON_ITEMS.length);
  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  // hooks
  const { isMobile } = usePlatformOS();

  useEffect(() => {
    if (isEditorReady) return;
    const checkEditorReady = () => editorRef.current?.getCurrentCursorPosition() !== undefined;
    if (checkEditorReady()) {
      setIsEditorReady(true);
      return;
    }
    const interval = setInterval(() => {
      if (checkEditorReady()) {
        setIsEditorReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isEditorReady, editorRef]);

  // collapse buttons that don't fit into the "..." menu
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const computeVisibleCount = () => {
      const available = container.clientWidth - RESERVED_WIDTH;
      const fits = Math.max(0, Math.floor(available / BUTTON_WIDTH));
      setVisibleCount(Math.min(fits, ALL_BUTTON_ITEMS.length));
    };
    computeVisibleCount();
    const observer = new ResizeObserver(computeVisibleCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isEditorReady]);

  const executeCommand = useCallback(
    (item: ToolbarMenuItem) => {
      // TODO: update this while toolbar homogenization
      // @ts-expect-error type mismatch here
      editorRef.current?.executeMenuItemCommand({
        itemKey: item.itemKey,
        ...item.extraProps,
      });
    },
    [editorRef]
  );

  const updateActiveStates = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const newActiveStates: Record<string, boolean> = {};
    ALL_BUTTON_ITEMS.forEach((item) => {
      // TODO: update this while toolbar homogenization
      // @ts-expect-error type mismatch here
      newActiveStates[item.renderKey] = editor.isMenuItemActive({
        itemKey: item.itemKey,
        ...item.extraProps,
      });
    });
    setActiveStates(newActiveStates);
  }, [editorRef]);

  useEffect(() => {
    if (!isEditorReady) return;
    const unsubscribe = editorRef.current?.onStateChange(updateActiveStates);
    updateActiveStates();
    return () => unsubscribe?.();
  }, [isEditorReady, editorRef, updateActiveStates]);

  if (!isEditorReady) return null;

  const activeTypography = TYPOGRAPHY_ITEMS.find((item) =>
    editorRef.current?.isMenuItemActive({
      itemKey: item.itemKey,
      ...item.extraProps,
    })
  );

  const visibleItems = ALL_BUTTON_ITEMS.slice(0, visibleCount);
  const overflowItems = ALL_BUTTON_ITEMS.slice(visibleCount);

  return (
    <div
      ref={containerRef}
      className="animate-in fade-in mt-2 flex items-center gap-0.5 rounded-md border-[0.5px] border-subtle bg-surface-2 p-1 duration-200"
      // keep the editor's focus and text selection while interacting with the toolbar
      onMouseDown={(e) => e.preventDefault()}
    >
      <CustomMenu
        customButton={
          <span
            className={cn(
              "flex h-8 w-24 shrink-0 items-center justify-between gap-2 rounded-sm border-[0.5px] border-strong px-2 text-left text-13 whitespace-nowrap",
              {
                "bg-layer-1-selected text-primary": isTypographyMenuOpen,
                "text-tertiary hover:bg-layer-1-hover": !isTypographyMenuOpen,
              }
            )}
          >
            {activeTypography?.name || "Text"}
            <ChevronDownIcon className="size-3 shrink-0" />
          </span>
        }
        className="shrink-0 pr-1"
        placement="top-start"
        closeOnSelect
        maxHeight="lg"
        menuButtonOnClick={() => setIsTypographyMenuOpen((prev) => !prev)}
        onMenuClose={() => setIsTypographyMenuOpen(false)}
      >
        {TYPOGRAPHY_ITEMS.map((item) => (
          <CustomMenu.MenuItem
            key={item.renderKey}
            className={cn("flex items-center justify-between gap-2", {
              "bg-layer-transparent-selected text-primary": activeTypography?.itemKey === item.itemKey,
              "hover:bg-layer-transparent-hover": !(activeTypography?.itemKey === item.itemKey),
            })}
            onClick={() => {
              if (activeTypography?.itemKey !== item.itemKey) {
                editorRef.current?.executeMenuItemCommand({
                  itemKey: item.itemKey,
                  ...item.extraProps,
                });
              }
            }}
          >
            <span className="flex items-center gap-2">
              <item.icon className="size-3" />
              {item.name}
            </span>
            {activeTypography?.itemKey === item.itemKey && <CheckIcon className="size-3 shrink-0 text-tertiary" />}
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
      <ColorMenu
        handleColorSelect={(key, color) =>
          editorRef.current?.executeMenuItemCommand({
            itemKey: key,
            color,
          })
        }
        isColorActive={(key, color) =>
          editorRef.current?.isMenuItemActive({
            itemKey: key,
            color,
          }) ?? false
        }
      />
      {visibleItems.map((item) => (
        <ToolbarButton
          key={item.renderKey}
          item={item}
          isActive={activeStates[item.renderKey]}
          isMobile={isMobile}
          executeCommand={executeCommand}
        />
      ))}
      {overflowItems.length > 0 && (
        <CustomMenu
          customButton={
            <span className="grid size-8 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover">
              <MoreHorizontal className="size-4" />
            </span>
          }
          className="ml-auto shrink-0"
          placement="top-end"
          closeOnSelect
          maxHeight="lg"
        >
          {overflowItems.map((item) => (
            <CustomMenu.MenuItem
              key={item.renderKey}
              className={cn("flex items-center justify-between gap-2", {
                "bg-layer-transparent-selected text-primary": activeStates[item.renderKey],
                "hover:bg-layer-transparent-hover": !activeStates[item.renderKey],
              })}
              onClick={() => executeCommand(item)}
            >
              <span className="flex items-center gap-2">
                <item.icon className="size-3.5" />
                {item.name}
              </span>
              {activeStates[item.renderKey] && <CheckIcon className="size-3 shrink-0 text-tertiary" />}
            </CustomMenu.MenuItem>
          ))}
        </CustomMenu>
      )}
    </div>
  );
}
