/**
 * useDebugMode - デバッグモード管理フック
 * 
 * このファイルは、アプリケーションのデバッグモードの状態を管理するフックです。
 * データベースからデバッグモード設定を読み込み、ロガーと同期させながら、
 * ユーザーがデバッグモードを切り替えられる機能を提供します。
 */

'use client';

import { useState, useEffect } from 'react';
import { db, Settings } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_GLOBAL_SPEED_SECONDS,
} from '@/lib/constants';

export function useDebugMode(): {
  debugMode: boolean;
  toggleDebugMode: () => Promise<void>;
} {
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    // アプリケーション起動時にデバッグモード設定を読み込み、ロガーと同期させる
    // これにより、ユーザーが設定したデバッグモードが即座に反映される
    db.settings
      .toArray()
      .then((settings) => {
        const setting = settings[0];
        if (setting) {
          setDebugMode(setting.debugMode);
          logger.setDebugMode(setting.debugMode);
        }
      })
      .catch((error) => {
        console.error('Error loading debug mode:', error);
      });
  }, []);

  const toggleDebugMode = async (): Promise<void> => {
    const newMode = !debugMode;
    setDebugMode(newMode);
    logger.setDebugMode(newMode);

    // デバッグモードの状態をデータベースに永続化し、次回起動時にも反映されるようにする
    const settings = await db.settings.toArray();
    // 既存設定がある場合は更新処理を実行して早期リターン
    // これにより、設定の重複を防ぎ、データの整合性を保つ
    if (settings.length > 0) {
      await db.settings.update(settings[0].id!, { debugMode: newMode });
      return;
    }

    // 新規設定の場合はデフォルト値と共に追加する
    // 設定が存在しない場合でも、アプリケーションが正常に動作するようにする
    await db.settings.add({
      apiKey: '',
      apiEndpoint: undefined,
      model: DEFAULT_MODEL_NAME,
      globalSpeed: DEFAULT_GLOBAL_SPEED_SECONDS,
      debugMode: newMode,
    });
  };

  return {
    debugMode,
    toggleDebugMode,
  };
}

