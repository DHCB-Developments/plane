/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Play } from "lucide-react";
import type { TIssueAttachment } from "@plane/types";
import { cn, getAttachmentPreviewType, getFileExtension, getFileURL } from "@plane/utils";
// components
import { getFileIcon } from "@/components/icons";

type TAttachmentThumbnail = {
  attachment: TIssueAttachment;
  /** square box size, tailwind class e.g. "size-7" */
  className?: string;
  /** size of the fallback file-type icon in px */
  iconSize?: number;
};

/**
 * Renders a real thumbnail for image/video attachments and falls back to the
 * standard file-type icon for everything else (or when the media fails to load).
 */
export function AttachmentThumbnail(props: TAttachmentThumbnail) {
  const { attachment, className, iconSize = 18 } = props;
  // states
  const [hasError, setHasError] = useState(false);
  // derived values
  const fileExtension = getFileExtension(attachment.attributes.name);
  const fileURL = getFileURL(attachment.asset_url);
  const previewType = getAttachmentPreviewType(attachment.attributes.name, attachment.attributes.type);
  const hasThumbnail = !hasError && !!fileURL && (previewType === "image" || previewType === "video");

  if (!hasThumbnail)
    return (
      <span className={cn("grid flex-shrink-0 place-items-center", className)}>
        {getFileIcon(fileExtension, iconSize)}
      </span>
    );

  return (
    <span
      className={cn(
        "relative flex-shrink-0 overflow-hidden rounded-md border border-subtle bg-layer-1",
        className
      )}
    >
      {previewType === "image" ? (
        <img
          src={fileURL}
          alt={attachment.attributes.name}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={fileURL}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            className="pointer-events-none size-full object-cover"
            onError={() => setHasError(true)}
          />
          <span className="absolute inset-0 grid place-items-center bg-black/20">
            <Play className="size-3 fill-white text-white drop-shadow" />
          </span>
        </>
      )}
    </span>
  );
}
