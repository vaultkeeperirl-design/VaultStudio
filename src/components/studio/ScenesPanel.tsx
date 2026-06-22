import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { Scene } from '../../types';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuItem } from '../common/ContextMenu';
import { RenameDialog } from '../common/RenameDialog';

const SceneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
  flex: 1;
  overflow-y: auto;
`;

const SceneItem = styled.button<{ $active: boolean; $dropTarget?: 'above' | 'below' | null; $dragging?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  width: 100%;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${({ $active }) => ($active ? tokens.colors.panel2 : 'transparent')};
  border: 1px solid ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;
  text-align: left;
  opacity: ${({ $dragging }) => ($dragging ? 0.35 : 1)};
  box-shadow: ${({ $dropTarget }) =>
    $dropTarget === 'above'
      ? `0 -2px 0 0 ${tokens.colors.gold}`
      : $dropTarget === 'below'
        ? `0 2px 0 0 ${tokens.colors.gold}`
        : 'none'};

  &:hover {
    background-color: ${tokens.colors.panel2};
  }
`;

const ActiveDot = styled.div<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  flex-shrink: 0;
`;

const SceneName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SceneInput = styled.input`
  flex: 1;
  background: ${tokens.colors.bg};
  border: 1px solid ${tokens.colors.gold};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  padding: 2px 4px;
  outline: none;
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

  ${SceneItem}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${tokens.colors.danger};
    background-color: rgba(255, 77, 77, 0.1);
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

type Props = {
  scenes: Scene[];
  activeSceneId: string | null;
  onSwitchScene: (sceneId: string) => void;
  onCreateScene?: (name: string) => void;
  onDeleteScene?: (sceneId: string) => void;
  onRenameScene?: (sceneId: string, name: string) => void;
  onDuplicateScene?: (sceneId: string) => void;
  onReorderScene?: (sceneId: string, newIndex: number) => void;
};

export function ScenesPanel({ scenes, activeSceneId, onSwitchScene, onCreateScene, onDeleteScene, onRenameScene, onDuplicateScene, onReorderScene }: Props) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sceneId: string;
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: 'above' | 'below' } | null>(null);

  const finishDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const handleDrop = (targetIndex: number, edge: 'above' | 'below') => {
    if (!dragId || !onReorderScene) return finishDrag();
    const fromIndex = scenes.findIndex((s) => s.id === dragId);
    if (fromIndex < 0) return finishDrag();
    let newIndex = edge === 'above' ? targetIndex : targetIndex + 1;
    if (fromIndex < newIndex) newIndex -= 1;
    newIndex = Math.max(0, Math.min(scenes.length - 1, newIndex));
    if (newIndex !== fromIndex) onReorderScene(dragId, newIndex);
    finishDrag();
  };

  const handleDoubleClick = (scene: Scene) => {
    setRenaming({ id: scene.id, name: scene.name });
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, sceneId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, sceneId });
    },
    []
  );

  const getContextMenuItems = (sceneId: string): (ContextMenuItem | 'separator')[] => {
    return [
      {
        label: 'Rename',
        action: () => {
          const scene = scenes.find((s) => s.id === sceneId);
          if (scene) setRenaming({ id: scene.id, name: scene.name });
        },
      },
      {
        label: 'Duplicate',
        action: () => onDuplicateScene?.(sceneId),
        disabled: !onDuplicateScene,
      },
      'separator',
      {
        label: 'Delete',
        action: () => onDeleteScene?.(sceneId),
        danger: true,
        disabled: sceneId === activeSceneId || !onDeleteScene,
      },
    ];
  };

  const handleAddSubmit = () => {
    if (newName.trim()) {
      onCreateScene?.(newName.trim());
      setNewName('');
      setIsAdding(false);
    }
  };

  return (
    <SceneList>
      {scenes.map((scene, index) => (
        <SceneItem
          key={scene.id}
          $active={scene.id === activeSceneId}
          $dragging={dragId === scene.id}
          $dropTarget={dropTarget?.index === index ? dropTarget.edge : null}
          draggable={!!onReorderScene}
          onDragStart={(e) => {
            setDragId(scene.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', scene.id);
          }}
          onDragEnd={finishDrag}
          onDragOver={(e) => {
            if (!dragId || dragId === scene.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = e.currentTarget.getBoundingClientRect();
            const edge = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
            if (dropTarget?.index !== index || dropTarget.edge !== edge) setDropTarget({ index, edge });
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
          onClick={() => onSwitchScene(scene.id)}
          onDoubleClick={() => handleDoubleClick(scene)}
          onContextMenu={(e) => handleContextMenu(e, scene.id)}
        >
          <ActiveDot $active={scene.id === activeSceneId} />
          <SceneName>{scene.name}</SceneName>
          {onDeleteScene && scene.id !== activeSceneId && (
            <DeleteBtn
              onClick={(e) => {
                e.stopPropagation();
                onDeleteScene(scene.id);
              }}
              aria-label={`Delete ${scene.name}`}
            >
              ✕
            </DeleteBtn>
          )}
        </SceneItem>
      ))}
      {isAdding ? (
        <SceneInput
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleAddSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddSubmit();
            if (e.key === 'Escape') { setIsAdding(false); setNewName(''); }
          }}
          autoFocus
          placeholder="Scene name..."
        />
      ) : onCreateScene && (
        <AddButton onClick={() => setIsAdding(true)}>+ Add Scene</AddButton>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.sceneId)}
          onClose={() => setContextMenu(null)}
        />
      )}
      {renaming && (
        <RenameDialog
          title="Rename scene"
          initialValue={renaming.name}
          onSubmit={(name) => onRenameScene?.(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </SceneList>
  );
}
