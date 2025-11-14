/**
 * PersonaCard - ペルソナカード表示コンポーネント
 * 
 * このファイルは、個別のペルソナ情報をカード形式で表示するコンポーネントです。
 * ペルソナの名前、性格、遅延倍率を表示し、編集・削除ボタンを提供することで、
 * ペルソナ管理画面での一覧表示機能を実現しています。
 */

'use client';

import { Persona } from '@/lib/db';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

interface PersonaCardProps {
  persona: Persona;
  onEdit: (persona: Persona) => void;
  onDelete: (id: number) => void;
}

export function PersonaCard({ persona, onEdit, onDelete }: PersonaCardProps) {
  const handleEdit = (): void => {
    // ペルソナIDが存在する場合のみ編集を実行
    // 早期リターンで無効な状態を処理し、型安全性を保つ
    if (!persona.id) {
      return;
    }
    onEdit(persona);
  };

  const handleDelete = (): void => {
    // ペルソナIDが存在する場合のみ削除を実行
    // 早期リターンで無効な状態を処理し、型安全性を保つ
    if (!persona.id) {
      return;
    }
    onDelete(persona.id);
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">{persona.name}</h3>
        <div className="flex gap-2">
          <button
            onClick={handleEdit}
            className="p-1 text-gray-600 hover:text-blue-600"
            aria-label="Edit persona"
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-gray-600 hover:text-red-600"
            aria-label="Delete persona"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-2">{persona.personality}</p>
      <div className="text-xs text-gray-500">
        Delay multiplier: {persona.responseDelayMultiplier}x
      </div>
    </div>
  );
}

