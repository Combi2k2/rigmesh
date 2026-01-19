'use client';

import { useState } from 'react';

export interface SceneObject {
  id: string;
  name: string;
  type: 'mesh' | 'line' | 'group' | 'other';
}

interface SceneGraphProps {
  objects: SceneObject[];
  onObjectNameChange: (id: string, newName: string) => void;
  onObjectSelect?: (id: string) => void;
  selectedObjectId?: string | null;
}

export default function SceneGraph({
  objects,
  onObjectNameChange,
  onObjectSelect,
  selectedObjectId,
}: SceneGraphProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleStartEdit = (obj: SceneObject) => {
    setEditingId(obj.id);
    setEditingName(obj.name);
  };

  const handleFinishEdit = (id: string) => {
    if (editingName.trim()) {
      onObjectNameChange(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleFinishEdit(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Scene Graph
      </div>
      {objects.length === 0 ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
          No objects in scene
        </div>
      ) : (
        <div className="space-y-1">
          {objects.map((obj) => (
            <div
              key={obj.id}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 ${
                selectedObjectId === obj.id
                  ? 'bg-blue-100 dark:bg-blue-900'
                  : ''
              }`}
              onClick={() => onObjectSelect?.(obj.id)}
            >
              <div className="flex-shrink-0 w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-600" />
              {editingId === obj.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleFinishEdit(obj.id)}
                  onKeyDown={(e) => handleKeyDown(e, obj.id)}
                  className="flex-1 text-xs px-1 py-0.5 border border-blue-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 text-xs text-gray-700 dark:text-gray-300"
                  onDoubleClick={() => handleStartEdit(obj)}
                >
                  {obj.name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

