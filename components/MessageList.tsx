/**
 * MessageList - メッセージリスト表示コンポーネント
 * 
 * このファイルは、チャットルーム内のメッセージを時系列順に表示するコンポーネントです。
 * デバッグモードが有効な場合、ペルソナの思考ログも表示し、会話の文脈を
 * 理解しやすくする役割を担っています。
 */

'use client';

import { Message } from '@/lib/db';
import { useDebugMode } from '@/hooks/useDebugMode';
import { db, ThoughtLog } from '@/lib/db';
import { useEffect, useState } from 'react';
import { THOUGHT_LOG_PREVIEW_LENGTH } from '@/lib/constants';

interface MessageListProps {
  messages: Message[];
  roomId: number;
}

export function MessageList({ messages, roomId }: MessageListProps) {
  const { debugMode } = useDebugMode();
  const [thoughtLogs, setThoughtLogs] = useState<ThoughtLog[]>([]);

  useEffect(() => {
    // デバッグモードでない場合は思考ログを表示しないため、早期リターンで処理をスキップ
    // パフォーマンス向上のため、不要なデータベースクエリを避ける
    if (!debugMode) {
      setThoughtLogs([]);
      return;
    }

    // デバッグモード時のみ思考ログを読み込むことで、通常時のパフォーマンスを維持する
    db.thoughtLogs
      .where('roomId')
      .equals(roomId)
      .sortBy('timestamp')
      .then(setThoughtLogs);
  }, [debugMode, roomId, messages.length]);

  const getThoughtLogForPersona = (
    personaId: number | undefined,
    messageTimestamp: number
  ): ThoughtLog | null => {
    if (!personaId || !debugMode) return null;
    
    // そのメッセージのタイムスタンプより前で、最も近い思考ログを取得
    // これにより、各メッセージに対して適切な思考ログが表示される
    const relevantLogs = thoughtLogs
      .filter((log) => log.personaId === personaId && log.timestamp <= messageTimestamp)
      .sort((a, b) => b.timestamp - a.timestamp); // 降順にソート（最新が先頭）
    
    return relevantLogs[0] || null;
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {messages.map((message) => {
        const thoughtLog = getThoughtLogForPersona(message.personaId, message.timestamp);
        return (
          <div key={message.id} className="flex flex-col gap-1">
            {thoughtLog && debugMode && (
              <div className="text-xs text-gray-500 italic pl-4">
                💭 {thoughtLog.thought.substring(0, THOUGHT_LOG_PREVIEW_LENGTH)}...
              </div>
            )}
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">
                {message.type === 'user' ? 'You' : `Persona ${message.personaId}`}
              </div>
              <div className="text-gray-900">
                {/* [You]や[Persona X]のプレフィックスを除去して表示 */}
                {message.type === 'persona' && message.content.startsWith('[')
                  ? message.content.replace(/^\[[^\]]+\]\s*/, '')
                  : message.content}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

