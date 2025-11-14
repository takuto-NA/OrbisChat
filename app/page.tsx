/**
 * Home - アプリケーションのホームページ
 * 
 * このファイルは、OrbisChatアプリケーションのメインページを実装しています。
 * チャットルームの一覧表示、新規作成、選択機能を提供し、選択されたルームでは
 * チャット画面を表示します。ペルソナ管理と設定へのナビゲーションも含まれます。
 */

'use client';

import { useState, useEffect } from 'react';
import { useChatRooms } from '@/hooks/useChatRoom';
import { ChatRoom } from '@/components/ChatRoom';
import { initializeSettings } from '@/lib/db';
import { Cog6ToothIcon, UserGroupIcon, PlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function Home() {
  const { rooms, loading, createRoom, deleteRoom } = useChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    // Initialize settings on mount
    initializeSettings();
  }, []);

  const handleCreateRoom = async (): Promise<void> => {
    // 空のルーム名は許可しない
    if (!newRoomName.trim()) {
      return;
    }
    try {
      const id = await createRoom(newRoomName);
      setNewRoomName('');
      setShowCreateModal(false);
      // 型安全性を保つため、createRoomの戻り値をそのまま使用する
      setSelectedRoomId(id);
    } catch (error) {
      // ユーザーへの即座のフィードバックが必要なため、コンソールに出力
      // loggerは非同期で記録される可能性があるため、デバッグ時の即時確認のためにコンソールを使用
      console.error('Error creating room:', error);
    }
  };

  if (selectedRoomId) {
    return (
      <div className="flex h-screen">
        <div className="w-64 bg-gray-100 border-r p-4 flex flex-col">
          <button
            onClick={() => setSelectedRoomId(null)}
            className="mb-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            ← Back to Rooms
          </button>
          <div className="flex-1 overflow-y-auto">
            <h2 className="font-semibold mb-2">Rooms</h2>
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`p-2 rounded mb-1 cursor-pointer ${
                  room.id === selectedRoomId
                    ? 'bg-blue-500 text-white'
                    : 'bg-white hover:bg-gray-200'
                }`}
                onClick={() => setSelectedRoomId(room.id!)}
              >
                {room.name}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Link
              href="/personas"
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg hover:bg-gray-200"
            >
              <UserGroupIcon className="w-5 h-5" />
              Personas
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg hover:bg-gray-200"
            >
              <Cog6ToothIcon className="w-5 h-5" />
              Settings
            </Link>
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatRoom roomId={selectedRoomId} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">OrbisChat</h1>
          <p className="text-lg text-gray-600">
            Multi-persona chat room with LangGraph
          </p>
        </div>

        <div className="flex justify-end gap-4 mb-6">
          <Link
            href="/personas"
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:bg-gray-50"
          >
            <UserGroupIcon className="w-5 h-5" />
            Manage Personas
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:bg-gray-50"
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Settings
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No chat rooms yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 mx-auto"
            >
              <PlusIcon className="w-5 h-5" />
              Create Your First Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md cursor-pointer transition-shadow"
                onClick={() => setSelectedRoomId(room.id!)}
              >
                <h3 className="text-lg font-semibold mb-2">{room.name}</h3>
                <p className="text-sm text-gray-500">
                  Created {new Date(room.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-white rounded-lg p-6 shadow-sm border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <PlusIcon className="w-8 h-8 text-gray-400" />
              <span className="text-gray-600">Create New Room</span>
            </button>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Create New Room</h2>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Room name..."
                className="w-full px-4 py-2 border rounded-lg mb-4"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateRoom();
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewRoomName('');
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRoom}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
