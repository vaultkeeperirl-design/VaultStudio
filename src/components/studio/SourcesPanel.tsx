import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { Source, SourceDevice, SourceType } from '../../types';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuItem } from '../common/ContextMenu';
import { RenameDialog } from '../common/RenameDialog';

const SourceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
  flex: 1;
  overflow-y: auto;
`;

const SourceItem = styled.div<{ $visible: boolean; $selected: boolean; $dropTarget?: 'above' | 'below' | null; $dragging?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${({ $selected }) => ($selected ? 'rgba(39, 168, 255, 0.08)' : tokens.colors.panel2)};
  border: 1px solid ${({ $selected }) => ($selected ? tokens.colors.neonBlue : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  opacity: ${({ $visible, $dragging }) => ($dragging ? 0.35 : $visible ? 1 : 0.5)};
  cursor: pointer;
  transition: opacity 0.15s;
  box-shadow: ${({ $dropTarget }) =>
    $dropTarget === 'above'
      ? `0 -2px 0 0 ${tokens.colors.gold}`
      : $dropTarget === 'below'
        ? `0 2px 0 0 ${tokens.colors.gold}`
        : 'none'};

  &:hover {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;


const SourceTypeLabel = styled.span`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  min-width: 82px;
  justify-content: flex-end;
`;

const TypeIcon = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: ${({ $active }) => ($active ? tokens.colors.neonBlue : tokens.colors.muted)};
`;

const SourceName = styled.span`
  color: ${tokens.colors.text};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const VisibilityBtn = styled.button<{ $visible: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: ${tokens.borderRadius.sm};
  border: 1px solid ${({ $visible }) => ($visible ? tokens.colors.neonBlue : tokens.colors.border)};
  background: ${({ $visible }) => ($visible ? 'rgba(39, 168, 255, 0.16)' : 'transparent')};
  color: ${({ $visible }) => ($visible ? tokens.colors.neonBlue : tokens.colors.muted)};
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    border-color: ${tokens.colors.gold};
    color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const LockBtn = styled.button<{ $locked: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: ${tokens.borderRadius.sm};
  border: 1px solid ${({ $locked }) => ($locked ? tokens.colors.gold : tokens.colors.border)};
  background: ${({ $locked }) => ($locked ? 'rgba(214, 162, 58, 0.16)' : 'transparent')};
  color: ${({ $locked }) => ($locked ? tokens.colors.gold : tokens.colors.muted)};
  cursor: pointer;
  flex-shrink: 0;
  font-size: ${tokens.fontSize.xs};
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    border-color: ${tokens.colors.gold};
    color: ${tokens.colors.gold};
  }
`;

const DeleteBtn = styled.button`
  background: none;
  border: none;
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;

  ${SourceItem}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${tokens.colors.danger};
    background-color: rgba(255, 77, 77, 0.1);
  }
`;

const MoveBtn = styled.button`
  background: none;
  border: none;
  color: ${tokens.colors.muted};
  font-size: 10px;
  cursor: pointer;
  padding: 0 3px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;

  ${SourceItem}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0 !important;
    cursor: default;
  }
`;

const AddDropdown = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
  padding-top: ${tokens.spacing.xs};
`;

const AddOption = styled.button`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  width: 100%;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: ${tokens.colors.gold};
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${tokens.spacing.xs};
  width: 100%;
  padding: ${tokens.spacing.sm};
  background: transparent;
  border: 1px dashed ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
    color: ${tokens.colors.gold};
  }
`;

const AddForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.sm};
  background: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
`;

const FormActions = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
`;

const FieldRow = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
`;

const FormButton = styled.button<{ $primary?: boolean }>`
  flex: 1;
  padding: ${tokens.spacing.sm};
  background: ${({ $primary }) => ($primary ? tokens.colors.gold : tokens.colors.panel)};
  color: ${({ $primary }) => ($primary ? '#000' : tokens.colors.text)};
  border: 1px solid ${({ $primary }) => ($primary ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const SOURCE_TYPES: { type: SourceType; label: string; fieldLabel?: string; placeholder?: string }[] = [
  { type: 'camera', label: 'Camera' },
  { type: 'display_capture', label: 'Display Capture' },
  { type: 'game_capture', label: 'Game Capture' },
  { type: 'window_capture', label: 'Window Capture' },
  { type: 'browser', label: 'Browser Source', fieldLabel: 'URL', placeholder: 'https://...' },
  { type: 'image', label: 'Image', fieldLabel: 'Image path', placeholder: 'C:\\path\\image.png' },
  { type: 'video', label: 'Video', fieldLabel: 'Video path', placeholder: 'C:\\path\\clip.mp4' },
  { type: 'audio_track', label: 'Audio Track', fieldLabel: 'Audio path', placeholder: 'C:\\path\\music.mp3' },
  { type: 'playlist', label: 'Playlist', placeholder: 'Add media files...' },
  { type: 'media', label: 'Media / Stream URL', fieldLabel: 'Media path or URL', placeholder: 'C:\\path\\clip.mp4 or rtmp://... (IRL feed)' },
  { type: 'text', label: 'Text', fieldLabel: 'Text', placeholder: 'On-screen text' },
  { type: 'audio_input', label: 'Audio Input' },
  { type: 'audio_output', label: 'Audio Output' },
];

const EmptyState = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  text-align: center;
  padding: ${tokens.spacing.lg};
`;

const InlineInput = styled.input`
  flex: 1;
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  padding: 2px 4px;
  outline: none;
`;

const DeviceSelect = styled.select`
  width: 100%;
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  padding: ${tokens.spacing.sm};
  outline: none;
`;

const PlaylistFiles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 140px;
  overflow-y: auto;
`;

const PlaylistFileRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  padding: 2px 4px;
  background: ${tokens.colors.bg};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
`;

const PlaylistIndex = styled.span`
  color: ${tokens.colors.muted};
  min-width: 16px;
  text-align: right;
`;

const PlaylistFileName = styled.span`
  flex: 1;
  color: ${tokens.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RemoveFileBtn = styled.button`
  background: none;
  border: none;
  color: ${tokens.colors.muted};
  cursor: pointer;
  padding: 0 4px;
  border-radius: 3px;

  &:hover {
    color: ${tokens.colors.danger};
  }
`;

const CheckboxLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  cursor: pointer;
  user-select: none;
`;

type Props = {
  sources: Source[];
  selectedSourceId?: string | null;
  irlIngestUrl?: string;
  onToggleVisibility?: (sourceId: string) => void;
  onRemoveSource?: (sourceId: string) => void;
  onAddSource?: (type: SourceType, settings?: Record<string, unknown>) => void;
  onMoveSource?: (sourceId: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onTransformAction?: (sourceId: string, action: 'fit' | 'stretch' | 'center') => void;
  onRestartCapture?: (sourceId: string) => void;
  onCameraFormat?: (sourceId: string, format: 'auto' | '720p30' | '1080p30') => void;
  onReorderSource?: (sourceId: string, newIndex: number) => void;
  onRenameSource?: (sourceId: string, name: string) => void;
  onToggleLock?: (sourceId: string, locked: boolean) => void;
  onSelectSource?: (sourceId: string) => void;
  devices?: Partial<Record<SourceType, SourceDevice[]>>;
};

const DEVICE_SOURCE_TYPES = new Set<SourceType>(['camera', 'audio_input', 'audio_output', 'display_capture', 'window_capture']);

type IconProps = { size?: number };

function LockIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 14v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UnlockIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16 10V7a4 4 0 0 0-7.5-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 14v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m3 3 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9.8 5.3A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a16.7 16.7 0 0 1-2.4 3.2M6.5 6.7C3.9 8.5 2.5 12 2.5 12s3.5 7 9.5 7c1.5 0 2.9-.4 4.1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SourceTypeIcon({ type, size = 14 }: IconProps & { type: Source['type'] }) {
  switch (type) {
    case 'camera':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" /><path d="m17 10 5-3v10l-5-3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
    case 'browser':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M7 7h.01M10 7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'image':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="m4 16 5-5 4 4 2-2 5 5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="16" cy="9" r="1.5" fill="currentColor" /></svg>;
    case 'media':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="m10 9 5 3-5 3V9Z" fill="currentColor" /></svg>;
    case 'video':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M7 5v14M17 5v14M2.5 12h19" stroke="currentColor" strokeWidth="2" /></svg>;
    case 'audio_track':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M9 17V5l11-2v12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="15" r="3" stroke="currentColor" strokeWidth="2" /></svg>;
    case 'playlist':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 7h11M4 12h11M4 17h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="m17 13 4 2.5-4 2.5v-5Z" fill="currentColor" /></svg>;
    case 'display_capture':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 21h6M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'window_capture':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M4 9h16M9 9v10" stroke="currentColor" strokeWidth="2" /></svg>;
    case 'game_capture':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 10h10a5 5 0 0 1 4.8 3.6l.7 2.7a2 2 0 0 1-3.3 2l-2-2.3H6.8l-2 2.3a2 2 0 0 1-3.3-2l.7-2.7A5 5 0 0 1 7 10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 14h4M9 12v4M16 14h.01M19 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'audio_input':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'audio_output':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 10v4h4l5 4V6l-5 4H4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'text':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 6h16M12 6v12M8 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'scene':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" /><rect x="10" y="10" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" /></svg>;
  }
}

function sourceNameFromPath(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function SourcesPanel({
  sources,
  selectedSourceId,
  irlIngestUrl,
  onToggleVisibility,
  onRemoveSource,
  onAddSource,
  onMoveSource,
  onTransformAction,
  onRestartCapture,
  onCameraFormat,
  onReorderSource,
  onRenameSource,
  onToggleLock,
  onSelectSource,
  devices = {},
}: Props) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sourceId: string;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftType, setDraftType] = useState<SourceType | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftFiles, setDraftFiles] = useState<string[]>([]);
  const [draftLoop, setDraftLoop] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: 'above' | 'below' } | null>(null);

  const finishDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const handleDrop = (targetIndex: number, edge: 'above' | 'below') => {
    if (!dragId || !onReorderSource) return finishDrag();
    const fromIndex = sources.findIndex((s) => s.id === dragId);
    if (fromIndex < 0) return finishDrag();
    // Insert position in the final arrangement (after the item is lifted out).
    let newIndex = edge === 'above' ? targetIndex : targetIndex + 1;
    if (fromIndex < newIndex) newIndex -= 1;
    newIndex = Math.max(0, Math.min(sources.length - 1, newIndex));
    if (newIndex !== fromIndex) onReorderSource(dragId, newIndex);
    finishDrag();
  };

  const selectDraftType = (type: SourceType, fallbackName: string) => {
    const firstDevice = devices[type]?.find((device) => !device.disabled);
    setDraftType(type);
    setDraftName(firstDevice?.name || fallbackName);
    setDraftValue(firstDevice?.value || '');
    setDraftFiles([]);
    // Music/playlists loop by default; one-shot video clips play once.
    setDraftLoop(type === 'audio_track' || type === 'playlist');
  };

  const addIrlPhoneFeed = () => {
    if (!irlIngestUrl) return;
    onAddSource?.('media', {
      name: 'IRL Phone Feed',
      file: irlIngestUrl,
    });
    resetAdd();
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, sourceId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, sourceId });
    },
    []
  );

  const getContextMenuItems = (sourceId: string): (ContextMenuItem | 'separator')[] => {
    const source = sources.find((s) => s.id === sourceId);
    const index = sources.findIndex((s) => s.id === sourceId);
    const restartable = source && ['camera', 'display_capture', 'game_capture', 'window_capture', 'media'].includes(source.type);
    return [
      ...(restartable && onRestartCapture
        ? [
            {
              label: 'Restart Capture',
              action: () => onRestartCapture(sourceId),
            } as ContextMenuItem,
          ]
        : []),
      ...(source?.type === 'camera' && onCameraFormat
        ? [
            {
              label: 'Camera Format: Auto',
              action: () => onCameraFormat(sourceId, 'auto'),
            } as ContextMenuItem,
            {
              label: 'Camera Format: 720p30 (low USB load)',
              action: () => onCameraFormat(sourceId, '720p30'),
            } as ContextMenuItem,
            {
              label: 'Camera Format: 1080p30',
              action: () => onCameraFormat(sourceId, '1080p30'),
            } as ContextMenuItem,
          ]
        : []),
      ...(restartable && (onRestartCapture || onCameraFormat) ? ['separator' as const] : []),
      {
        label: 'Rename',
        action: () => {
          const source = sources.find((s) => s.id === sourceId);
          if (source) setRenaming({ id: source.id, name: source.name });
        },
      },
      {
        label: source?.visible ? 'Hide' : 'Show',
        action: () => onToggleVisibility?.(sourceId),
        disabled: !onToggleVisibility,
      },
      {
        label: source?.locked ? 'Unlock' : 'Lock',
        action: () => source && onToggleLock?.(sourceId, !source.locked),
        disabled: !onToggleLock,
      },
      {
        label: 'Move Up',
        action: () => onMoveSource?.(sourceId, 'up'),
        disabled: !onMoveSource || !!source?.locked || index <= 0,
      },
      {
        label: 'Move Down',
        action: () => onMoveSource?.(sourceId, 'down'),
        disabled: !onMoveSource || !!source?.locked || index < 0 || index >= sources.length - 1,
      },
      {
        label: 'Move to Top',
        action: () => onMoveSource?.(sourceId, 'top'),
        disabled: !onMoveSource || !!source?.locked || index <= 0,
      },
      {
        label: 'Move to Bottom',
        action: () => onMoveSource?.(sourceId, 'bottom'),
        disabled: !onMoveSource || !!source?.locked || index < 0 || index >= sources.length - 1,
      },
      'separator',
      {
        label: 'Fit to Screen',
        action: () => onTransformAction?.(sourceId, 'fit'),
        disabled: !onTransformAction || !!source?.locked,
      },
      {
        label: 'Stretch to Screen',
        action: () => onTransformAction?.(sourceId, 'stretch'),
        disabled: !onTransformAction || !!source?.locked,
      },
      {
        label: 'Center on Screen',
        action: () => onTransformAction?.(sourceId, 'center'),
        disabled: !onTransformAction || !!source?.locked,
      },
      'separator',
      {
        label: 'Remove',
        action: () => onRemoveSource?.(sourceId),
        danger: true,
        disabled: !onRemoveSource,
      },
    ];
  };

  const resetAdd = () => {
    setAdding(false);
    setDraftType(null);
    setDraftName('');
    setDraftValue('');
    setDraftFiles([]);
    setDraftLoop(false);
  };

  const submitAddSource = () => {
    if (!draftType) return;
    const settings: Record<string, unknown> = {};
    if (draftName.trim()) settings.name = draftName.trim();
    if (draftType === 'playlist') {
      settings.files = draftFiles;
      settings.looping = draftLoop;
    } else if (draftValue.trim()) {
      if (draftType === 'browser') settings.url = draftValue.trim();
      else if (draftType === 'image' || draftType === 'media' || draftType === 'video' || draftType === 'audio_track')
        settings.file = draftValue.trim();
      else if (draftType === 'text') settings.text = draftValue.trim();
      else if (draftType === 'display_capture') settings.monitorId = draftValue.trim();
      else if (draftType === 'window_capture') settings.windowId = draftValue.trim();
      else if (DEVICE_SOURCE_TYPES.has(draftType)) settings.deviceId = draftValue.trim();
    }
    if (draftType === 'video' || draftType === 'audio_track') settings.looping = draftLoop;
    onAddSource?.(draftType, settings);
    resetAdd();
  };

  const selectImageFile = async () => {
    const filePath = await window.vaultstudio?.files?.selectImage?.();
    if (filePath) {
      setDraftValue(filePath);
      if (!draftName.trim() || draftName === 'Image') setDraftName(sourceNameFromPath(filePath));
    }
  };

  const selectMediaFile = async () => {
    const filePath = await window.vaultstudio?.files?.selectMedia?.();
    if (filePath) {
      setDraftValue(filePath);
      if (!draftName.trim() || draftName === 'Media / Stream URL') setDraftName(sourceNameFromPath(filePath));
    }
  };

  const selectVideoFile = async () => {
    const filePath = await window.vaultstudio?.files?.selectVideo?.();
    if (filePath) {
      setDraftValue(filePath);
      if (!draftName.trim() || draftName === 'Video') setDraftName(sourceNameFromPath(filePath));
    }
  };

  const selectAudioFile = async () => {
    const filePath = await window.vaultstudio?.files?.selectAudio?.();
    if (filePath) {
      setDraftValue(filePath);
      if (!draftName.trim() || draftName === 'Audio Track') setDraftName(sourceNameFromPath(filePath));
    }
  };

  const addPlaylistFiles = async () => {
    const paths = await window.vaultstudio?.files?.selectPlaylist?.();
    if (paths && paths.length > 0) {
      setDraftFiles((prev) => [...prev, ...paths]);
      if (!draftName.trim() || draftName === 'Playlist') setDraftName(sourceNameFromPath(paths[0]));
    }
  };

  const removePlaylistFile = (index: number) => {
    setDraftFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedType = SOURCE_TYPES.find((s) => s.type === draftType);
  const selectedDevices = draftType ? devices[draftType] || [] : [];
  const selectedTypeNeedsDevice = !!draftType && DEVICE_SOURCE_TYPES.has(draftType);
  const showLoopToggle = draftType === 'video' || draftType === 'audio_track' || draftType === 'playlist';
  const REQUIRES_VALUE = new Set<SourceType>(['image', 'media', 'video', 'audio_track', 'browser']);
  const canSubmit =
    !!draftType &&
    (!selectedTypeNeedsDevice || selectedDevices.some((device) => device.value === draftValue && !device.disabled)) &&
    (!REQUIRES_VALUE.has(draftType) || draftValue.trim().length > 0) &&
    (draftType !== 'playlist' || draftFiles.length > 0);

  return (
    <SourceList onContextMenu={(e) => e.preventDefault()}>
      {sources.length === 0 && <EmptyState>No sources</EmptyState>}
      {sources.map((source, index) => (
        <SourceItem
          key={source.id}
          $visible={source.visible}
          $selected={source.id === selectedSourceId}
          $dragging={dragId === source.id}
          $dropTarget={dropTarget?.index === index ? dropTarget.edge : null}
          draggable={!!onReorderSource && !source.locked}
          onDragStart={(e) => {
            setDragId(source.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', source.id);
          }}
          onDragEnd={finishDrag}
          onDragOver={(e) => {
            if (!dragId || dragId === source.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = e.currentTarget.getBoundingClientRect();
            const edge = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
            if (dropTarget?.index !== index || dropTarget.edge !== edge) {
              setDropTarget({ index, edge });
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            if (dropTarget?.index === index) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            handleDrop(index, e.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
          }}
          onClick={() => onSelectSource?.(source.id)}
          onContextMenu={(e) => handleContextMenu(e, source.id)}
        >
          <VisibilityBtn
            $visible={source.visible}
            data-icon={source.visible ? 'eye' : 'eye-off'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility?.(source.id);
            }}
            aria-label={source.visible ? 'Hide source' : 'Show source'}
            title={source.visible ? 'Hide source' : 'Show source'}
          >
            {source.visible ? <EyeIcon /> : <EyeOffIcon />}
          </VisibilityBtn>
          <SourceName>{source.name}</SourceName>
          <SourceTypeLabel>
            {source.type.replace('_', ' ')}
            <TypeIcon $active={source.id === selectedSourceId}>
              <SourceTypeIcon type={source.type} />
            </TypeIcon>
          </SourceTypeLabel>
          {onToggleLock && (
            <LockBtn
              $locked={!!source.locked}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(source.id, !source.locked);
              }}
              aria-label={source.locked ? `Unlock ${source.name}` : `Lock ${source.name}`}
              title={source.locked ? 'Unlock source' : 'Lock source'}
            >
              {source.locked ? <LockIcon /> : <UnlockIcon />}
            </LockBtn>
          )}
          {onMoveSource && (
            <>
              <MoveBtn
                disabled={index === 0 || !!source.locked}
                onClick={() => onMoveSource(source.id, 'up')}
                aria-label={`Move ${source.name} up`}
              >
                ^
              </MoveBtn>
              <MoveBtn
                disabled={index === sources.length - 1 || !!source.locked}
                onClick={() => onMoveSource(source.id, 'down')}
                aria-label={`Move ${source.name} down`}
              >
                v
              </MoveBtn>
            </>
          )}
          {onRemoveSource && (
            <DeleteBtn
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSource(source.id);
              }}
              aria-label={`Remove ${source.name}`}
            >
              x
            </DeleteBtn>
          )}
        </SourceItem>
      ))}
      {onAddSource && !adding && (
        <AddButton onClick={() => setAdding(true)}>+ Add Source</AddButton>
      )}
      {onAddSource && adding && !draftType && (
        <AddDropdown>
          {irlIngestUrl && (
            <AddOption onClick={addIrlPhoneFeed}>
              + IRL Phone Feed
            </AddOption>
          )}
          {SOURCE_TYPES.map(({ type, label }) => (
            <AddOption key={type} onClick={() => selectDraftType(type, label)}>
              + {label}
            </AddOption>
          ))}
          <FormButton onClick={resetAdd}>Cancel</FormButton>
        </AddDropdown>
      )}
      {onAddSource && adding && draftType && selectedType && (
        <AddForm>
          <InlineInput
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Source name"
            aria-label="Source name"
          />
          {selectedType.fieldLabel && (
            <FieldRow>
              <InlineInput
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                placeholder={selectedType.placeholder}
                aria-label={selectedType.fieldLabel}
              />
              {draftType === 'image' && (
                <FormButton type="button" onClick={selectImageFile}>Browse...</FormButton>
              )}
              {draftType === 'media' && (
                <FormButton type="button" onClick={selectMediaFile}>Browse...</FormButton>
              )}
              {draftType === 'video' && (
                <FormButton type="button" onClick={selectVideoFile}>Browse...</FormButton>
              )}
              {draftType === 'audio_track' && (
                <FormButton type="button" onClick={selectAudioFile}>Browse...</FormButton>
              )}
            </FieldRow>
          )}
          {draftType === 'playlist' && (
            <>
              {draftFiles.length > 0 && (
                <PlaylistFiles>
                  {draftFiles.map((file, i) => (
                    <PlaylistFileRow key={`${file}-${i}`}>
                      <PlaylistIndex>{i + 1}</PlaylistIndex>
                      <PlaylistFileName title={file}>{sourceNameFromPath(file)}</PlaylistFileName>
                      <RemoveFileBtn
                        type="button"
                        onClick={() => removePlaylistFile(i)}
                        aria-label={`Remove ${sourceNameFromPath(file)} from playlist`}
                      >
                        x
                      </RemoveFileBtn>
                    </PlaylistFileRow>
                  ))}
                </PlaylistFiles>
              )}
              <FormButton type="button" onClick={addPlaylistFiles}>
                + Add files...
              </FormButton>
            </>
          )}
          {showLoopToggle && (
            <CheckboxLabel>
              <input
                type="checkbox"
                checked={draftLoop}
                onChange={(e) => setDraftLoop(e.target.checked)}
              />
              Loop
            </CheckboxLabel>
          )}
          {selectedTypeNeedsDevice && selectedDevices.length > 0 && (
            <DeviceSelect
              value={draftValue}
              onChange={(e) => {
                const device = selectedDevices.find((d) => d.value === e.target.value);
                setDraftValue(e.target.value);
                if (device && !draftName.trim()) setDraftName(device.name);
              }}
              aria-label={`${selectedType.label} device`}
            >
              {selectedDevices.map((device) => (
                <option key={device.value} value={device.value} disabled={device.disabled}>
                  {device.name}
                </option>
              ))}
            </DeviceSelect>
          )}
          {selectedTypeNeedsDevice && selectedDevices.length === 0 && (
            <EmptyState>No {selectedType.label.toLowerCase()} devices found</EmptyState>
          )}
          <FormActions>
            <FormButton $primary onClick={submitAddSource} disabled={!canSubmit}>Add {selectedType.label}</FormButton>
            <FormButton onClick={() => setDraftType(null)}>Back</FormButton>
          </FormActions>
        </AddForm>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.sourceId)}
          onClose={() => setContextMenu(null)}
        />
      )}
      {renaming && (
        <RenameDialog
          title="Rename source"
          initialValue={renaming.name}
          onSubmit={(name) => onRenameSource?.(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </SourceList>
  );
}
