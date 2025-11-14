/**
 * useChatRoom - チャットルーム管理フック
 * 
 * このファイルは、チャットルームとメッセージの管理を行うカスタムフックです。
 * メッセージの読み込み、送信、チャットルームの作成・削除などの機能を提供し、
 * データベースとの連携を抽象化することで、コンポーネント側の実装を簡潔にします。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { db, ChatRoom, Message, Persona } from '@/lib/db';
import { logger } from '@/lib/logger';

export function useChatRoom(roomId: number | null): {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  resetRoom: () => Promise<void>;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async (): Promise<void> => {
    if (!roomId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    try {
      const roomMessages = await db.messages
        .where('roomId')
        .equals(roomId)
        .sortBy('timestamp');
      setMessages(roomMessages);
      logger.debug('Messages loaded', { roomId, count: roomMessages.length });
    } catch (error) {
      logger.error('Error loading messages', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadMessages();

    // ペルソナのメッセージを自動的に反映するため、定期的にメッセージを更新
    // これにより、ペルソナが送信したメッセージがUIに表示される
    const intervalId = setInterval(() => {
      loadMessages();
    }, 2000); // 2秒ごとに更新

    return () => {
      clearInterval(intervalId);
    };
  }, [loadMessages]);

  const sendMessage = async (content: string): Promise<void> => {
    // 無効なデータでの処理を防ぐため、最初にバリデーションを行い早期リターン
    // これにより、不要なデータベース操作を避け、エラーを事前に防ぐ
    if (!roomId || !content.trim()) {
      return;
    }

    try {
      const message: Message = {
        roomId,
        content: content.trim(),
        timestamp: Date.now(),
        type: 'user',
      };

      await db.messages.add(message);
      logger.info('Message sent', { roomId, content: content.substring(0, 50) });
      await loadMessages();
    } catch (error) {
      logger.error('Error sending message', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const resetRoom = async (): Promise<void> => {
    // ルームIDが無効な場合は早期リターン
    if (!roomId) {
      return;
    }

    try {
      // ルーム内のメッセージと思考ログを削除
      // ルーム自体は削除せず、メッセージのみをリセットする
      await Promise.all([
        db.messages.where('roomId').equals(roomId).delete(),
        db.thoughtLogs.where('roomId').equals(roomId).delete(),
      ]);
      logger.info('Room reset', { roomId });
      await loadMessages();
    } catch (error) {
      logger.error('Error resetting room', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    messages,
    loading,
    sendMessage,
    refreshMessages: loadMessages,
    resetRoom,
  };
}

export function useChatRooms(): {
  rooms: ChatRoom[];
  loading: boolean;
  createRoom: (name: string) => Promise<number>;
  deleteRoom: (roomId: number) => Promise<void>;
  refreshRooms: () => Promise<void>;
} {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRooms = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const allRooms = await db.rooms.orderBy('createdAt').reverse().toArray();
      setRooms(allRooms);
      logger.debug('Rooms loaded', { count: allRooms.length });
    } catch (error) {
      logger.error('Error loading rooms', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const createRoom = async (name: string): Promise<number> => {
    try {
      const room: ChatRoom = {
        name: name.trim(),
        createdAt: Date.now(),
      };
      // データベーススキーマで'++id'が定義されているため、常にnumberが返される
      // 型定義が不十分なため型アサーションを使用し、型安全性を保つ
      const id = (await db.rooms.add(room)) as number;
      logger.info('Room created', { roomId: id, name });
      await loadRooms();
      return id;
    } catch (error) {
      logger.error('Error creating room', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const deleteRoom = async (roomId: number): Promise<void> => {
    try {
      await db.rooms.delete(roomId);
      // Also delete all messages in this room
      await db.messages.where('roomId').equals(roomId).delete();
      logger.info('Room deleted', { roomId });
      await loadRooms();
    } catch (error) {
      logger.error('Error deleting room', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    rooms,
    loading,
    createRoom,
    deleteRoom,
    refreshRooms: loadRooms,
  };
}

