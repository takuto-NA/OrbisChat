/**
 * turn-taking - 発言権管理システム
 * 
 * このファイルは、複数のペルソナが同時にタイピングする際の競合を管理する
 * システムを実装しています。タイピング状態の追跡、遅延時間の計算、競合する
 * ペルソナの検出などの機能を提供し、自然な会話の流れを実現します。
 */

import { db, Settings } from './db';
import { logger } from './logger';
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_GLOBAL_SPEED_SECONDS,
  SECONDS_TO_MILLISECONDS,
} from './constants';

export interface TypingState {
  personaId: number;
  personaName: string;
  startTime: number;
  delay: number; // Delay in milliseconds
}

class TurnTakingManager {
  private typingStates: Map<number, TypingState> = new Map();
  private typingCallbacks: Map<number, () => void> = new Map();

  async startTyping(
    personaId: number,
    personaName: string,
    delayMultiplier: number
  ): Promise<void> {
    const settings = await this.getSettings();
    // グローバル速度（秒）をミリ秒に変換し、ペルソナの遅延倍率を適用
    // これにより、各ペルソナの個性に応じた応答速度を実現する
    const baseDelay = settings.globalSpeed * SECONDS_TO_MILLISECONDS;
    const delay = baseDelay * delayMultiplier;

    const typingState: TypingState = {
      personaId,
      personaName,
      startTime: Date.now(),
      delay,
    };

    this.typingStates.set(personaId, typingState);
    logger.debug(`Persona ${personaId} started typing`, {
      personaId,
      delay,
      delayMultiplier,
    });

    // Set timeout to complete typing
    const timeoutId = setTimeout(() => {
      this.completeTyping(personaId);
    }, delay);

    // Store timeout callback
    this.typingCallbacks.set(personaId, () => {
      clearTimeout(timeoutId);
    });
  }

  /**
   * 指定されたペルソナのタイピングをキャンセルする
   * 
   * タイピング状態とタイマーをクリーンアップし、タイピングインジケーターから
   * 削除する。競合が発生した場合などに呼び出される。
   */
  cancelTyping(personaId: number): boolean {
    const callback = this.typingCallbacks.get(personaId);
    if (callback) {
      callback();
      this.typingStates.delete(personaId);
      this.typingCallbacks.delete(personaId);
      logger.debug(`Persona ${personaId} cancelled typing`, { personaId });
      return true;
    }
    return false;
  }

  private completeTyping(personaId: number) {
    this.typingStates.delete(personaId);
    this.typingCallbacks.delete(personaId);
    logger.debug(`Persona ${personaId} completed typing`, { personaId });
  }

  getTypingStates(): TypingState[] {
    return Array.from(this.typingStates.values());
  }

  isTyping(personaId: number): boolean {
    return this.typingStates.has(personaId);
  }

  /**
   * 指定されたペルソナ以外でタイピング中のペルソナのリストを取得する
   * 
   * 競合チェックに使用され、他のペルソナがタイピング中かどうかを判定する
   */
  getConflictingPersonas(excludePersonaId: number): TypingState[] {
    return this.getTypingStates().filter(
      (state) => state.personaId !== excludePersonaId
    );
  }

  private async getSettings(): Promise<Settings> {
    const settings = await db.settings.toArray();
    // 設定が存在しない場合はデフォルト値を返す
    // アプリケーションの動作を保証するため、常に有効な設定オブジェクトを返す
    // これにより、設定が未初期化でもエラーが発生せず、アプリケーションが正常に動作する
    return settings[0] || {
      apiKey: '',
      apiEndpoint: undefined,
      model: DEFAULT_MODEL_NAME,
      globalSpeed: DEFAULT_GLOBAL_SPEED_SECONDS,
      debugMode: false,
    };
  }
}

export const turnTakingManager = new TurnTakingManager();

