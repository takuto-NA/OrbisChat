/**
 * ChatRoom - チャットルームのメインコンポーネント
 * 
 * このファイルは、ユーザーがメッセージを送信し、ペルソナの応答を表示する
 * チャットルームのUIを提供します。メッセージリスト、タイピングインジケーター、
 * メッセージ入力フォームを含む完全なチャットインターフェースを実装しています。
 */

'use client';

import { useState } from 'react';
import { useChatRoom } from '@/hooks/useChatRoom';
import { usePersonaAutonomy } from '@/hooks/usePersonaAutonomy';
import { useErrorNotification } from '@/hooks/useErrorNotification';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { ErrorNotification } from './ErrorNotification';
import { ThoughtLogViewer } from './ThoughtLogViewer';
import { PaperAirplaneIcon, ArrowPathIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface ChatRoomProps {
  roomId: number;
}

export function ChatRoom({ roomId }: ChatRoomProps) {
  const { messages, sendMessage, resetRoom } = useChatRoom(roomId);
  const [input, setInput] = useState('');
  const [showThoughtLogs, setShowThoughtLogs] = useState(false);
  const { error, handleError, dismissError } = useErrorNotification();
  usePersonaAutonomy(roomId, handleError);

  const handleResetRoom = async (): Promise<void> => {
    // 誤操作を防ぐため、リセット前に確認を求める
    if (
      !confirm(
        'Are you sure you want to reset this room? All messages and thought logs will be deleted. This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await resetRoom();
    } catch (error) {
      handleError(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    // 空のメッセージは送信しない
    if (!input.trim()) {
      return;
    }

    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      // エラーをユーザーに通知するため、エラーハンドラーを使用
      handleError(error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ErrorNotification error={error} onDismiss={dismissError} />
      <div className="border-b p-2 bg-gray-50 flex justify-between items-center">
        <button
          onClick={() => setShowThoughtLogs(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="View thought logs"
        >
          <DocumentTextIcon className="w-4 h-4" />
          Thought Logs
        </button>
        <button
          onClick={handleResetRoom}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Reset room (delete all messages)"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Reset Room
        </button>
      </div>
      {showThoughtLogs && (
        <ThoughtLogViewer roomId={roomId} onClose={() => setShowThoughtLogs(false)} />
      )}
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} roomId={roomId} />
        <TypingIndicator />
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4 bg-white z-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            disabled={false}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

