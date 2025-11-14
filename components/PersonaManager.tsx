/**
 * PersonaManager - ペルソナ管理コンポーネント
 * 
 * このファイルは、ペルソナの作成、編集、削除を行うためのUIを提供します。
 * ペルソナの一覧表示、モーダルフォームによる編集機能、データベースとの
 * 連携を担当し、アプリケーション全体のペルソナ管理機能を実現しています。
 */

'use client';

import { useState, useEffect } from 'react';
import { db, Persona } from '@/lib/db';
import { PersonaCard } from './PersonaCard';
import { PlusIcon } from '@heroicons/react/24/outline';
import { logger } from '@/lib/logger';
import {
  MIN_RESPONSE_DELAY_MULTIPLIER,
  MAX_RESPONSE_DELAY_MULTIPLIER,
  RESPONSE_DELAY_MULTIPLIER_STEP,
} from '@/lib/constants';

export function PersonaManager() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    personality: '',
    systemPrompt: '',
    responseDelayMultiplier: 1,
  });

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async (): Promise<void> => {
    try {
      const allPersonas = await db.personas.toArray();
      setPersonas(allPersonas);
    } catch (error) {
      logger.error('Error loading personas', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const resetForm = (): void => {
    setIsModalOpen(false);
    setEditingPersona(null);
    setFormData({
      name: '',
      personality: '',
      systemPrompt: '',
      responseDelayMultiplier: 1,
    });
  };

  const resetFormAndOpenModal = (): void => {
    setEditingPersona(null);
    setFormData({
      name: '',
      personality: '',
      systemPrompt: '',
      responseDelayMultiplier: 1,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      // 編集と新規作成で処理が異なるため、早期リターンで分岐を明確にする
      // これにより、ネストを減らし可読性を向上させる
      if (editingPersona?.id) {
        await db.personas.update(editingPersona.id, {
          ...formData,
          updatedAt: Date.now(),
        });
        logger.info('Persona updated', { personaId: editingPersona.id });
        resetForm();
        await loadPersonas();
        return;
      }

      // 新規作成時はcreatedAtも設定する必要があるため、別の処理として実装
      await db.personas.add({
        ...formData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      logger.info('Persona created');
      resetForm();
      await loadPersonas();
    } catch (error) {
      logger.error('Error saving persona', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleEdit = (persona: Persona): void => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      personality: persona.personality,
      systemPrompt: persona.systemPrompt,
      responseDelayMultiplier: persona.responseDelayMultiplier,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number): Promise<void> => {
    // 誤操作によるデータ損失を防ぐため、削除前にユーザーに確認を求める
    if (!confirm('Are you sure you want to delete this persona?')) {
      return;
    }
    try {
      await db.personas.delete(id);
      logger.info('Persona deleted', { personaId: id });
      await loadPersonas();
    } catch (error) {
      logger.error('Error deleting persona', {
        personaId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Personas</h1>
        <button
          onClick={resetFormAndOpenModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <PlusIcon className="w-5 h-5" />
          Add Persona
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personas.map((persona) => (
          <PersonaCard
            key={persona.id}
            persona={persona}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingPersona ? 'Edit Persona' : 'Create Persona'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Personality
                </label>
                <input
                  type="text"
                  value={formData.personality}
                  onChange={(e) =>
                    setFormData({ ...formData, personality: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Friendly and curious"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  System Prompt
                </label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData({ ...formData, systemPrompt: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg h-32"
                  placeholder="Detailed personality and behavior description..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Response Delay Multiplier
                </label>
                <input
                  type="number"
                  min={MIN_RESPONSE_DELAY_MULTIPLIER}
                  max={MAX_RESPONSE_DELAY_MULTIPLIER}
                  step={RESPONSE_DELAY_MULTIPLIER_STEP}
                  value={formData.responseDelayMultiplier}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      responseDelayMultiplier: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingPersona(null);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  {editingPersona ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

