/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import ReactDOM from "react-dom";
import { Download, Minus } from "lucide-react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, NewTabIcon, PlusIcon } from "@plane/propel/icons";
import type { TIssueAttachment, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import {
  cn,
  convertBytesToSize,
  getAttachmentPreviewType,
  getFileExtension,
  getFileURL,
  getFileName,
} from "@plane/utils";
// components
import { getFileIcon } from "@/components/icons";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_SPEED = 0.05;
const ZOOM_STEPS = [0.5, 1, 1.5, 2];
// text files larger than this are not fetched for preview
const TEXT_PREVIEW_SIZE_LIMIT = 2 * 1024 * 1024;

type TAttachmentPreviewModal = {
  attachmentIds: string[];
  initialAttachmentId: string;
  onClose: () => void;
  issueServiceType?: TIssueServiceType;
  /** Override store lookup — lets non-issue surfaces (e.g. comment
   * attachments) reuse the modal with their own data. */
  resolveAttachment?: (attachmentId: string) => TIssueAttachment | undefined;
};

type TViewerProps = {
  attachment: TIssueAttachment;
  fileURL: string;
  onDownload: () => void;
};

function PreviewUnavailable(props: TViewerProps & { message: string }) {
  const { attachment, message, onDownload } = props;
  const fileExtension = getFileExtension(attachment.attributes.name);
  return (
    <div className="flex max-w-[90vw] flex-col items-center gap-3 rounded-lg bg-surface-1 p-8">
      <div className="size-9">{getFileIcon(fileExtension, 36)}</div>
      <p className="max-w-full truncate text-13 font-medium text-primary">{attachment.attributes.name}</p>
      <p className="text-13 text-secondary">{message}</p>
      <button
        type="button"
        onClick={onDownload}
        className="mt-1 flex items-center gap-1.5 rounded-md bg-layer-1 px-3 py-1.5 text-13 font-medium text-primary hover:bg-layer-2"
      >
        <Download className="size-3.5" />
        Download
      </button>
    </div>
  );
}

function ImageViewer(props: TViewerProps & { isTouchDevice: boolean }) {
  const { attachment, fileURL, isTouchDevice, onDownload } = props;
  // refs
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  // states
  const [magnification, setMagnification] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleMagnification = useCallback((direction: "increase" | "decrease") => {
    setMagnification((prev) => {
      let targetZoom: number;
      if (direction === "increase") {
        targetZoom = ZOOM_STEPS.find((step) => step > prev) ?? MAX_ZOOM;
      } else {
        targetZoom = [...ZOOM_STEPS].reverse().find((step) => step < prev) ?? MIN_ZOOM;
      }
      // Reset image position when back to the default zoom level
      if (targetZoom === 1 && imgRef.current) {
        imgRef.current.style.left = "0px";
        imgRef.current.style.top = "0px";
      }
      return targetZoom;
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const imgWidth = imgRef.current.offsetWidth * magnification;
    const imgHeight = imgRef.current.offsetHeight * magnification;
    if (imgWidth > window.innerWidth || imgHeight > window.innerHeight) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      dragOffset.current = {
        x: parseInt(imgRef.current.style.left || "0"),
        y: parseInt(imgRef.current.style.top || "0"),
      };
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !imgRef.current) return;
      const scaledDx = (e.clientX - dragStart.current.x) / magnification;
      const scaledDy = (e.clientY - dragStart.current.y) / magnification;
      imgRef.current.style.left = `${dragOffset.current.x + scaledDx}px`;
      imgRef.current.style.top = `${dragOffset.current.y + scaledDy}px`;
    },
    [isDragging, magnification]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) setIsDragging(false);
  }, [isDragging]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!imgRef.current) return;
    e.preventDefault();
    // Handle pinch-to-zoom
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY;
      setMagnification((prev) => {
        const clampedZoom = Math.min(Math.max(prev * (1 - delta * ZOOM_SPEED), MIN_ZOOM), MAX_ZOOM);
        if (clampedZoom === 1 && imgRef.current) {
          imgRef.current.style.left = "0px";
          imgRef.current.style.top = "0px";
        }
        return clampedZoom;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [handleMouseMove, handleMouseUp, handleWheel]);

  if (hasError)
    return <PreviewUnavailable attachment={attachment} fileURL={fileURL} onDownload={onDownload} message="Preview is not available for this file." />;

  return (
    <>
      <img
        ref={imgRef}
        src={fileURL}
        alt={attachment.attributes.name}
        className={cn("relative max-h-[80vh] max-w-[90vw] rounded-lg object-contain", {
          "cursor-grabbing": isDragging,
        })}
        style={{
          transform: `scale(${magnification})`,
          transformOrigin: "center",
          transition: isDragging ? undefined : "transform 0.2s ease",
        }}
        onMouseDown={handleMouseDown}
        onError={() => setHasError(true)}
      />
      <div className="fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1 divide-x divide-subtle-1 rounded-md border border-subtle-1 bg-black py-2 pr-1 pl-1">
        <div className="flex items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleMagnification("decrease");
            }}
            className="grid size-8 place-items-center text-white/60 transition-colors duration-200 hover:text-white disabled:text-white/30"
            disabled={magnification <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-13 text-white">{Math.round(100 * magnification)}%</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleMagnification("increase");
            }}
            className="grid size-8 place-items-center text-white/60 transition-colors duration-200 hover:text-white disabled:text-white/30"
            disabled={magnification >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
        {!isTouchDevice && (
          <button
            type="button"
            onClick={onDownload}
            className="grid size-8 flex-shrink-0 place-items-center text-white/60 transition-colors duration-200 hover:text-white"
            aria-label="Download image"
          >
            <Download className="size-4" />
          </button>
        )}
      </div>
    </>
  );
}

function VideoViewer(props: TViewerProps) {
  const { attachment, fileURL, onDownload } = props;
  const [hasError, setHasError] = useState(false);

  if (hasError)
    return <PreviewUnavailable attachment={attachment} fileURL={fileURL} onDownload={onDownload} message="This video format cannot be played in the browser." />;

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      controls
      autoPlay
      src={fileURL}
      className="max-h-[80vh] max-w-[90vw] rounded-lg"
      onError={() => setHasError(true)}
    />
  );
}

function AudioViewer(props: TViewerProps) {
  const { attachment, fileURL, onDownload } = props;
  const [hasError, setHasError] = useState(false);

  if (hasError)
    return <PreviewUnavailable attachment={attachment} fileURL={fileURL} onDownload={onDownload} message="This audio format cannot be played in the browser." />;

  return (
    <div className="flex w-[90vw] max-w-lg flex-col items-center gap-4 rounded-lg bg-surface-1 p-6">
      <p className="max-w-full truncate text-13 font-medium text-primary">{attachment.attributes.name}</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls autoPlay src={fileURL} className="w-full" onError={() => setHasError(true)} />
    </div>
  );
}

function PdfViewer(props: TViewerProps & { isIOS: boolean }) {
  const { attachment, fileURL, isIOS } = props;
  // iframes honor Content-Disposition, so the inline variant of the URL is required here
  const inlineFileURL = `${fileURL}${fileURL.includes("?") ? "&" : "?"}disposition=inline`;

  return (
    <div className="flex h-[85vh] w-[92vw] max-w-5xl flex-col gap-2">
      <iframe src={inlineFileURL} title={attachment.attributes.name} className="size-full rounded-lg bg-white" />
      {isIOS && (
        // iOS Safari renders only the first page of a PDF inside an iframe
        <button
          type="button"
          onClick={() => window.open(inlineFileURL, "_blank")}
          className="mx-auto flex items-center gap-1.5 rounded-md bg-surface-1 px-3 py-1.5 text-13 font-medium text-primary"
        >
          <NewTabIcon className="size-3.5" />
          Open full PDF
        </button>
      )}
    </div>
  );
}

function TextViewer(props: TViewerProps) {
  const { attachment, fileURL, onDownload } = props;
  // states
  const [content, setContent] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const isTooLarge = attachment.attributes.size > TEXT_PREVIEW_SIZE_LIMIT;

  useEffect(() => {
    if (isTooLarge) return;
    let isCancelled = false;
    fetch(fileURL, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.text();
      })
      .then((text) => {
        if (!isCancelled) setContent(text);
      })
      .catch(() => {
        if (!isCancelled) setHasError(true);
      });
    return () => {
      isCancelled = true;
    };
  }, [fileURL, isTooLarge]);

  if (isTooLarge)
    return <PreviewUnavailable attachment={attachment} fileURL={fileURL} onDownload={onDownload} message="This file is too large to preview." />;
  if (hasError)
    return <PreviewUnavailable attachment={attachment} fileURL={fileURL} onDownload={onDownload} message="Preview is not available for this file." />;
  if (content === null)
    return (
      <div className="flex items-center justify-center rounded-lg bg-surface-1 px-8 py-6">
        <span className="text-13 text-secondary">Loading preview...</span>
      </div>
    );

  return (
    <div className="max-h-[80vh] w-[92vw] max-w-4xl overflow-auto rounded-lg bg-surface-1 p-4">
      <pre className="font-mono text-12 whitespace-pre-wrap break-words text-primary">{content}</pre>
    </div>
  );
}

function AttachmentPreviewModalContent(props: TAttachmentPreviewModal) {
  const {
    attachmentIds,
    initialAttachmentId,
    onClose,
    issueServiceType = EIssueServiceType.ISSUES,
    resolveAttachment,
  } = props;
  // store hooks
  const {
    attachment: { getAttachmentById: getStoreAttachmentById },
  } = useIssueDetail(issueServiceType);
  const getAttachmentById = resolveAttachment ?? getStoreAttachmentById;
  // hooks
  const { isMobile } = usePlatformOS();
  // derived values
  const previewableAttachmentIds = useMemo(
    () =>
      attachmentIds.filter((id) => {
        const attachment = getAttachmentById(id);
        if (!attachment) return false;
        return getAttachmentPreviewType(attachment.attributes.name, attachment.attributes.type) !== "none";
      }),
    [attachmentIds, getAttachmentById]
  );
  // states
  const [activeAttachmentId, setActiveAttachmentId] = useState(initialAttachmentId);

  const activeIndex = previewableAttachmentIds.indexOf(activeAttachmentId);
  const attachment = getAttachmentById(activeAttachmentId);
  const fileURL = getFileURL(attachment?.asset_url ?? "");
  const previewType = attachment
    ? getAttachmentPreviewType(attachment.attributes.name, attachment.attributes.type)
    : "none";
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const handleNavigate = useCallback(
    (direction: "previous" | "next") => {
      if (previewableAttachmentIds.length < 2) return;
      const currentIndex = previewableAttachmentIds.indexOf(activeAttachmentId);
      if (currentIndex === -1) return;
      const nextIndex =
        direction === "next"
          ? (currentIndex + 1) % previewableAttachmentIds.length
          : (currentIndex - 1 + previewableAttachmentIds.length) % previewableAttachmentIds.length;
      setActiveAttachmentId(previewableAttachmentIds[nextIndex]);
    },
    [activeAttachmentId, previewableAttachmentIds]
  );

  const handleDownload = useCallback(() => {
    if (fileURL) window.open(fileURL, "_blank");
  }, [fileURL]);

  useEffect(() => {
    // Capture phase, so Escape doesn't also reach document-level listeners
    // behind the preview (e.g. the peek overview's close handler).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
      // leave arrow keys to focused media elements (seek/volume)
      if (e.target instanceof HTMLVideoElement || e.target instanceof HTMLAudioElement) return;
      if (e.key === "ArrowLeft") handleNavigate("previous");
      if (e.key === "ArrowRight") handleNavigate("next");
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleNavigate, onClose]);

  if (!attachment || !fileURL) return null;

  const fileName = getFileName(attachment.attributes.name);
  const fileExtension = getFileExtension(attachment.attributes.name);
  const viewerProps: TViewerProps = { attachment, fileURL, onDownload: handleDownload };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
      data-prevent-outside-click
    >
      {/* header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex-shrink-0">{getFileIcon(fileExtension, 18)}</div>
          <p className="truncate text-13 font-medium text-white">{`${fileName}.${fileExtension}`}</p>
          <span className="flex-shrink-0 text-12 text-white/60">{convertBytesToSize(attachment.attributes.size)}</span>
          {previewableAttachmentIds.length > 1 && activeIndex !== -1 && (
            <span className="flex-shrink-0 text-12 text-white/60">
              {activeIndex + 1} / {previewableAttachmentIds.length}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleDownload}
            className="grid size-11 place-items-center text-white/60 transition-colors hover:text-white"
            aria-label="Download"
          >
            <Download className="size-4" />
          </button>
          {!isMobile && (
            <button
              type="button"
              onClick={() => window.open(fileURL, "_blank")}
              className="grid size-11 place-items-center text-white/60 transition-colors hover:text-white"
              aria-label="Open in new tab"
            >
              <NewTabIcon className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center text-white/60 transition-colors hover:text-white"
            aria-label="Close preview"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
      </div>
      {/* content */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        {previewType === "image" && (
          <ImageViewer key={activeAttachmentId} {...viewerProps} isTouchDevice={isMobile} />
        )}
        {previewType === "video" && <VideoViewer key={activeAttachmentId} {...viewerProps} />}
        {previewType === "audio" && <AudioViewer key={activeAttachmentId} {...viewerProps} />}
        {previewType === "pdf" && <PdfViewer key={activeAttachmentId} {...viewerProps} isIOS={isIOS} />}
        {previewType === "text" && <TextViewer key={activeAttachmentId} {...viewerProps} />}
        {previewType === "none" && (
          <PreviewUnavailable {...viewerProps} message="Preview is not available for this file." />
        )}
        {previewableAttachmentIds.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => handleNavigate("previous")}
              className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/60 transition-colors hover:text-white"
              aria-label="Previous attachment"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate("next")}
              className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/60 transition-colors hover:text-white"
              aria-label="Next attachment"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const IssueAttachmentPreviewModal = observer(function IssueAttachmentPreviewModal(
  props: TAttachmentPreviewModal
) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(<AttachmentPreviewModalContent {...props} />, document.body);
});
