/**
 * data-export - データエクスポート機能
 * 
 * このファイルは、アプリケーションの全データをJSON形式でエクスポートする
 * 機能を実装しています。ペルソナ、チャットルーム、メッセージ、思考ログ、設定を
 * 一括してエクスポートし、ユーザーがデータをバックアップできるようにします。
 */

import { db, Persona, ChatRoom, Message, ThoughtLog, Settings } from './db';
import { EXPORT_DATA_VERSION } from './constants';

export interface ExportData {
  personas: Persona[];
  rooms: ChatRoom[];
  messages: Message[];
  thoughtLogs: ThoughtLog[];
  settings: Settings[];
  exportDate: string;
  version: string;
}

export async function exportData(): Promise<ExportData> {
  const [personas, rooms, messages, thoughtLogs, settings] =
    await Promise.all([
      db.personas.toArray(),
      db.rooms.toArray(),
      db.messages.toArray(),
      db.thoughtLogs.toArray(),
      db.settings.toArray(),
    ]);

  return {
    personas,
    rooms,
    messages,
    thoughtLogs,
    settings,
    exportDate: new Date().toISOString(),
    version: EXPORT_DATA_VERSION,
  };
}

export async function downloadExport(): Promise<void> {
  const data = await exportData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchorElement = document.createElement('a');
  anchorElement.href = url;
  anchorElement.download = `orbischat-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(anchorElement);
  anchorElement.click();
  document.body.removeChild(anchorElement);
  URL.revokeObjectURL(url);
}

