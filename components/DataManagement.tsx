/**
 * DataManagement - データ管理コンポーネント
 * 
 * このファイルは、アプリケーションのデータをエクスポート・削除する機能を提供します。
 * ユーザーが全データをJSON形式でエクスポートしたり、全データを削除したりできる
 * UIを実装し、データのバックアップとリセット機能を実現しています。
 */

'use client';

import { useState } from 'react';
import { downloadExport } from '@/lib/data-export';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline';

export function DataManagement() {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExport = async (): Promise<void> => {
    try {
      await downloadExport();
      logger.info('Data exported successfully');
    } catch (error) {
      logger.error('Error exporting data', {
        error: error instanceof Error ? error.message : String(error),
      });
      alert('Error exporting data. Please check console for details.');
    }
  };

  const handleDeleteAll = async (): Promise<void> => {
    // 全データ削除は不可逆的な操作のため、2段階の確認で誤操作を防ぐ
    // 1回目の確認で続行を拒否された場合は早期リターン
    if (
      !confirm(
        'Are you sure you want to delete ALL data? This cannot be undone!'
      )
    ) {
      return;
    }

    // 2回目の確認で最終的な意思確認を行い、データ損失のリスクを最小化する
    if (
      !confirm(
        'This will delete all personas, rooms, messages, and thought logs. Are you absolutely sure?'
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await Promise.all([
        db.personas.clear(),
        db.rooms.clear(),
        db.messages.clear(),
        db.thoughtLogs.clear(),
      ]);
      logger.warn('All data deleted');
      alert('All data has been deleted.');
    } catch (error) {
      logger.error('Error deleting data', {
        error: error instanceof Error ? error.message : String(error),
      });
      alert('Error deleting data. Please check console for details.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Data Management</h2>
      <div className="space-y-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <h3 className="font-semibold mb-2">Export Data</h3>
          <p className="text-sm text-gray-600 mb-4">
            Export all your data (personas, rooms, messages, thought logs) as a
            JSON file.
          </p>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            Export Data
          </button>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-red-200">
          <h3 className="font-semibold mb-2 text-red-600">Delete All Data</h3>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete all personas, rooms, messages, and thought logs.
            This action cannot be undone!
          </p>
          <button
            onClick={handleDeleteAll}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TrashIcon className="w-5 h-5" />
            {isDeleting ? 'Deleting...' : 'Delete All Data'}
          </button>
        </div>
      </div>
    </div>
  );
}

