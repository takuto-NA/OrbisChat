/**
 * SettingsPage - 設定ページ
 * 
 * このファイルは、アプリケーションの設定を管理するページを実装しています。
 * API設定（APIキー、モデル、グローバル速度）、デバッグモードの切り替え、
 * データ管理機能を統合し、ユーザーがアプリケーションの動作をカスタマイズできる
 * インターフェースを提供します。
 */

'use client';

import { useState, useEffect } from 'react';
import { db, Settings } from '@/lib/db';
import { useDebugMode } from '@/hooks/useDebugMode';
import { DataManagement } from '@/components/DataManagement';
import { logger } from '@/lib/logger';
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_GLOBAL_SPEED_SECONDS,
} from '@/lib/constants';

export default function SettingsPage() {
  const { debugMode, toggleDebugMode } = useDebugMode();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [formData, setFormData] = useState({
    apiKey: '',
    apiEndpoint: '',
    model: DEFAULT_MODEL_NAME,
    globalSpeed: DEFAULT_GLOBAL_SPEED_SECONDS,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async (): Promise<void> => {
    try {
      const allSettings = await db.settings.toArray();
      if (allSettings.length > 0) {
        const setting = allSettings[0];
        setSettings(setting);
        setFormData({
          apiKey: setting.apiKey,
          apiEndpoint: setting.apiEndpoint || '',
          model: setting.model,
          globalSpeed: setting.globalSpeed,
        });
      }
    } catch (error) {
      logger.error('Error loading settings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      // 空文字列のapiEndpointはundefinedとして保存する
      // これにより、デフォルトのOpenAIエンドポイントが使用される
      const settingsToSave = {
        ...formData,
        apiEndpoint: formData.apiEndpoint.trim() || undefined,
      };

      // 編集と新規作成で処理が異なるため、早期リターンで分岐を明確にする
      // これにより、ネストを減らし可読性を向上させる
      if (settings?.id) {
        await db.settings.update(settings.id, {
          ...settingsToSave,
          debugMode: settings.debugMode,
        });
        logger.info('Settings saved');
        alert('Settings saved successfully!');
        await loadSettings();
        return;
      }

      // 新規設定時はdebugModeも初期化する必要があるため、別の処理として実装
      await db.settings.add({
        ...settingsToSave,
        debugMode: false,
      });
      logger.info('Settings saved');
      alert('Settings saved successfully!');
      await loadSettings();
    } catch (error) {
      logger.error('Error saving settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      alert('Error saving settings. Please check console for details.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>

        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="sk-..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your API key is stored locally and never sent to our servers.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  API Endpoint (Optional)
                </label>
                <input
                  type="text"
                  value={formData.apiEndpoint}
                  onChange={(e) =>
                    setFormData({ ...formData, apiEndpoint: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://api.openai.com/v1 (default)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use OpenAI&apos;s default endpoint. Set a custom endpoint for OpenAI-compatible servers (e.g., LocalAI, Ollama).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Model Name</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) =>
                    setFormData({ ...formData, model: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="gpt-4o-mini"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the model name (e.g., gpt-4o-mini, gpt-4o, llama-3.1-70b, etc.)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Global Speed (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  value={formData.globalSpeed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      globalSpeed: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Base typing delay for all personas (multiplied by persona&apos;s
                  delay multiplier).
                </p>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Save Settings
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Debug Mode</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Debug Mode</p>
                <p className="text-sm text-gray-600">
                  Show thought logs in UI and console
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={toggleDebugMode}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          <DataManagement />
        </div>
      </div>
    </div>
  );
}

