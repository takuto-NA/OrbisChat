/**
 * db - データベース定義と初期化
 * 
 * このファイルは、Dexieを使用したIndexedDBのデータベーススキーマ定義と
 * 初期化処理を実装しています。ペルソナ、チャットルーム、メッセージ、思考ログ、
 * 設定などのテーブル構造を定義し、デフォルト設定の初期化機能を提供します。
 */

import Dexie, { Table } from 'dexie';
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_GLOBAL_SPEED_SECONDS,
} from './constants';

export interface Persona {
  id?: number;
  name: string;
  personality: string;
  systemPrompt: string;
  responseDelayMultiplier: number; // Multiplier for global speed
  createdAt: number;
  updatedAt: number;
}

export interface ChatRoom {
  id?: number;
  name: string;
  createdAt: number;
}

export interface Message {
  id?: number;
  roomId: number;
  personaId?: number; // undefined for user messages
  content: string;
  timestamp: number;
  type: 'user' | 'persona';
}

export interface ThoughtLog {
  id?: number;
  personaId: number;
  roomId: number;
  thought: string;
  timestamp: number;
}

export interface Settings {
  id?: number;
  apiKey: string;
  apiEndpoint?: string; // OpenAI API互換サーバーのエンドポイント（オプション）
  model: string;
  globalSpeed: number; // Base speed in seconds
  debugMode: boolean;
}

class OrbisChatDB extends Dexie {
  personas!: Table<Persona>;
  rooms!: Table<ChatRoom>;
  messages!: Table<Message>;
  thoughtLogs!: Table<ThoughtLog>;
  settings!: Table<Settings>;

  constructor() {
    super('OrbisChatDB');
    this.version(1).stores({
      personas: '++id, name, createdAt',
      rooms: '++id, name, createdAt',
      messages: '++id, roomId, personaId, timestamp',
      thoughtLogs: '++id, personaId, roomId, timestamp',
      settings: '++id',
    });
  }
}

export const db = new OrbisChatDB();

/**
 * デフォルト設定を初期化する
 * 
 * データベースに設定が存在しない場合、デフォルト値を設定する。
 * アプリケーション起動時に呼び出され、必要な設定が存在することを保証する。
 */

export async function initializeSettings(): Promise<void> {
  const existingSettings = await db.settings.toArray();
  // 設定が存在しない場合のみデフォルト設定を追加
  // 既存の設定を上書きしないため、存在チェックを行い、ユーザーの設定を保護する
  if (existingSettings.length === 0) {
    await db.settings.add({
      apiKey: '',
      model: DEFAULT_MODEL_NAME,
      globalSpeed: DEFAULT_GLOBAL_SPEED_SECONDS,
      debugMode: false,
    });
  }
}

