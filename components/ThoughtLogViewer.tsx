/**
 * ThoughtLogViewer - 思考ログビューアーコンポーネント
 * 
 * このファイルは、ペルソナの思考ログを一覧表示・参照するためのコンポーネントです。
 * デバッグモードが有効な場合、ルーム内のすべての思考ログを時系列順に表示し、
 * ペルソナの思考プロセスを詳細に確認できるようにします。
 */

'use client';

import { useState, useEffect } from 'react';
import { db, ThoughtLog, Persona } from '@/lib/db';
import { useDebugMode } from '@/hooks/useDebugMode';
import { logger } from '@/lib/logger';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface ThoughtLogViewerProps {
  roomId: number;
  onClose: () => void;
}

export function ThoughtLogViewer({ roomId, onClose }: ThoughtLogViewerProps) {
  const { debugMode } = useDebugMode();
  const [thoughtLogs, setThoughtLogs] = useState<(ThoughtLog & { personaName?: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const handleResetThoughtLogs = async (): Promise<void> => {
    // 誤操作を防ぐため、リセット前に確認を求める
    if (
      !confirm(
        'Are you sure you want to reset all thought logs for this room? This will delete all thought logs but keep the messages. This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await db.thoughtLogs.where('roomId').equals(roomId).delete();
      logger.info('Thought logs reset', { roomId });
      setThoughtLogs([]);
    } catch (error) {
      logger.error('Error resetting thought logs', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      alert('Error resetting thought logs. Please check console for details.');
    }
  };

  useEffect(() => {
    if (!debugMode) {
      return;
    }

    const loadThoughtLogs = async (): Promise<void> => {
      setLoading(true);
      try {
        const logs = await db.thoughtLogs
          .where('roomId')
          .equals(roomId)
          .sortBy('timestamp');

        // ペルソナ名を取得して表示を改善
        const logsWithPersonaNames = await Promise.all(
          logs.map(async (log) => {
            const persona = await db.personas.get(log.personaId);
            return {
              ...log,
              personaName: persona?.name || `Persona ${log.personaId}`,
            };
          })
        );

        setThoughtLogs(logsWithPersonaNames);
      } catch (error) {
        console.error('Error loading thought logs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadThoughtLogs();

    // 定期的に思考ログを更新
    const intervalId = setInterval(loadThoughtLogs, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [roomId, debugMode]);

  if (!debugMode) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Thought Logs</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="text-gray-600">
            Debug mode must be enabled to view thought logs. Please enable debug mode in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Thought Logs</h2>
          <div className="flex gap-2">
            <button
              onClick={handleResetThoughtLogs}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Reset thought logs"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Reset Logs
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading thought logs...</div>
          ) : thoughtLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No thought logs found for this room.
            </div>
          ) : (
            thoughtLogs.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold text-gray-800">
                    {log.personaName || `Persona ${log.personaId}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {log.thought}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

